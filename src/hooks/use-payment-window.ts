import { useEffect, useState } from "react";
import type { Order } from "../lib/api";

export function usePaymentWindow(order?: Order) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const deadline = order?.paymentExpiresAt;
  const serverTime = order?.serverTime;
  const pending = order?.status === "pending_payment";
  useEffect(() => {
    if (!pending || !deadline || !serverTime) { setSecondsLeft(null); return; }
    const observedAt = performance.now();
    const initialMs = Math.max(0, Date.parse(deadline) - Date.parse(serverTime));
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((initialMs - (performance.now() - observedAt)) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadline, serverTime, pending]);
  const expired = pending && secondsLeft === 0;
  const label = secondsLeft === null ? "正在确认付款时间…" : `付款剩余 ${Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:${(secondsLeft % 60).toString().padStart(2, "0")}`;
  return { expired, label };
}
