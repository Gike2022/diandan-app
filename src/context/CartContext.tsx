import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Dish } from "../data/menu";
import { toast } from "../hooks/use-toast";
import { CART_KEY, cartSchema, emptyCartSnapshot, readCartSnapshot, writeCartSnapshot, type CartItem, type CartSnapshot } from "../lib/cart-storage";
export type { CartItem } from "../lib/cart-storage";

interface CartContextType {
  cart: CartItem[];
  addToCart: (dish: Dish) => void;
  removeFromCart: (dishId: string) => void;
  updateQuantity: (dishId: string, quantity: number) => void;
  clearCart: () => void;
  replaceCart: (items: CartItem[]) => void;
  consumeItems: (items: { dishId: string; quantity: number }[], settlementKey: string) => Promise<void>;
  getCartSnapshot: () => CartSnapshot;
  totalItems: number;
  totalPrice: number;
}
const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<CartSnapshot>(() => { try { return readCartSnapshot(); } catch { return emptyCartSnapshot(); } });
  const current = useRef(snapshot);
  const adopt = useCallback((next: CartSnapshot) => { current.current = next; setSnapshot(next); }, []);
  useEffect(() => {
    const sync = () => { try { adopt(readCartSnapshot()); } catch { /* Keep the current in-memory cart. */ } };
    const changed = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) sync(); };
    window.addEventListener("storage", changed);
    window.addEventListener("pageshow", sync);
    return () => { window.removeEventListener("storage", changed); window.removeEventListener("pageshow", sync); };
  }, [adopt]);

  const mutate = useCallback(async (change: (previous: CartSnapshot) => CartSnapshot, strict = false) => {
    const apply = () => {
      let previous: CartSnapshot;
      try { previous = readCartSnapshot(); } catch (error) { if (strict) throw error; previous = current.current; }
      const next = change(previous);
      try { writeCartSnapshot(next); } catch (error) { if (strict) throw error; }
      adopt(next);
    };
    // Serialize storage read/modify/write across tabs; stable server keys also protect simultaneous checkout.
    if (navigator.locks) await navigator.locks.request(CART_KEY, apply);
    else apply();
  }, [adopt]);
  const changeCart = useCallback((change: (cart: CartItem[]) => CartItem[]) => {
    void mutate(previous => {
      const cart = change(previous.cart);
      return cart === previous.cart ? previous : { ...previous, cart, revision: crypto.randomUUID() };
    });
  }, [mutate]);

  const addToCart = useCallback((dish: Dish) => {
    if (dish.soldOut) return;
    changeCart(previous => {
      const existing = previous.find(item => item.id === dish.id);
      if (existing) return previous.map(item => item.id === dish.id ? { ...dish, quantity: Math.min(99, item.quantity + 1) } : item);
      if (previous.length >= 50) { toast({ title: "购物车已满", description: "每笔订单最多选择 50 种菜品" }); return previous; }
      return [...previous, { ...dish, quantity: 1 }];
    });
  }, [changeCart]);
  const removeFromCart = useCallback((id: string) => changeCart(previous => previous.filter(item => item.id !== id)), [changeCart]);
  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity > 99) return;
    changeCart(previous => quantity <= 0 ? previous.filter(item => item.id !== id) : previous.map(item => item.id === id ? { ...item, quantity } : item));
  }, [changeCart]);
  const clearCart = useCallback(() => changeCart(() => []), [changeCart]);
  const replaceCart = useCallback((items: CartItem[]) => changeCart(() => cartSchema.parse(items) as CartItem[]), [changeCart]);
  const consumeItems = useCallback((items: { dishId: string; quantity: number }[], settlementKey: string) => mutate(previous => {
    if (previous.settled.includes(settlementKey)) return previous;
    const cart = previous.cart.map(item => ({ ...item, quantity: Math.max(0, item.quantity - (items.find(line => line.dishId === item.id)?.quantity ?? 0)) })).filter(item => item.quantity > 0);
    // Cart deduction and its receipt are one storage write, so retries cannot deduct newly added items again.
    return { revision: crypto.randomUUID(), cart, settled: [...previous.settled, settlementKey] };
  }, true), [mutate]);

  const cart = snapshot.cart;
  const totalItems = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const totalPrice = useMemo(() => cart.reduce((sum, item) => sum + (item.priceCents ?? Math.round(item.price * 100)) * item.quantity, 0) / 100, [cart]);
  return <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, replaceCart, consumeItems, getCartSnapshot: readCartSnapshot, totalItems, totalPrice }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
