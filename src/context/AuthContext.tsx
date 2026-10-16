import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, SESSION_EXPIRED, type RegisterBody, type User, type ProfileBody, type PasswordBody } from "../lib/api";

const TOKEN_KEY = "sweet_kitchen_token";
function readToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch { return null; }
}
interface AuthState {
  token: string | null;
  user: User | null;
  isChecking: boolean;
  error: Error | null;
  retry: () => void;
  login: (username: string, password: string) => Promise<void>;
  register: (body: RegisterBody) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (body: ProfileBody) => Promise<User>;
  changePassword: (body: PasswordBody) => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(readToken);
  const currentToken = useRef(token);
  currentToken.current = token;
  const session = useQuery({
    queryKey: ["session", token],
    queryFn: ({ signal }) => api.me(token!, signal),
    enabled: Boolean(token), retry: false, staleTime: Infinity,
  });

  const adoptToken = useCallback((next: string | null) => {
    currentToken.current = next;
    try { if (next) localStorage.setItem(TOKEN_KEY, next); else localStorage.removeItem(TOKEN_KEY); } catch { /* Session still works in memory when storage is unavailable. */ }
    void queryClient.cancelQueries({ queryKey: ["orders"] });
    void queryClient.cancelQueries({ queryKey: ["order"] });
    void queryClient.cancelQueries({ queryKey: ["admin"] });
    queryClient.removeQueries({ queryKey: ["orders"] });
    queryClient.removeQueries({ queryKey: ["order"] });
    queryClient.removeQueries({ queryKey: ["admin"] });
    queryClient.removeQueries({ queryKey: ["session"] });
    setToken(next);
  }, [queryClient]);

  useEffect(() => {
    const expired = (event: Event) => {
      if ((event as CustomEvent<string>).detail === currentToken.current) adoptToken(null);
    };
    const changed = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY || event.key === null) adoptToken(readToken());
    };
    window.addEventListener(SESSION_EXPIRED, expired);
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener(SESSION_EXPIRED, expired); window.removeEventListener("storage", changed); };
  }, [adoptToken]);

  const login = async (username: string, password: string) => {
    const result = await api.login({ username, password });
    adoptToken(result.token);
    queryClient.setQueryData(["session", result.token], { user: result.user });
  };
  const logout = async () => {
    const previous = currentToken.current;
    adoptToken(null);
    if (previous) await api.logout(previous);
  };
  const register = async (body: RegisterBody) => {
    const result = await api.register(body);
    adoptToken(result.token);
    queryClient.setQueryData(["session", result.token], { user: result.user });
  };
  const updateProfile = async (body: ProfileBody) => {
    const previous = currentToken.current;
    if (!previous) throw new Error("请先登录");
    const result = await api.updateProfile(previous, body);
    if (currentToken.current === previous) queryClient.setQueryData(["session", previous], { user: result.user });
    return result.user;
  };
  const changePassword = async (body: PasswordBody) => {
    const previous = currentToken.current;
    if (!previous) throw new Error("请先登录");
    const result = await api.changePassword(previous, body);
    if (currentToken.current !== previous) throw new Error("登录账号已变化，请在当前账号中重新确认");
    adoptToken(result.token);
    queryClient.setQueryData(["session", result.token], { user: result.user });
  };

  return <AuthContext.Provider value={{
    token, user: session.data?.user ?? null, isChecking: Boolean(token) && session.isPending,
    error: session.error, retry: () => { void session.refetch(); }, login, register, logout, updateProfile, changePassword,
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("useAuth must be used within AuthProvider");
  return state;
}
