import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { Heart, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { MobileLayout } from "../components/layout";
import { RequestState } from "../components/request-state";
import { errorMessage } from "../lib/api";
import { safeNext } from "../lib/auth-navigation";

export default function Login() {
  const auth = useAuth();
  const [, navigate] = useLocation();
  const next = safeNext(new URLSearchParams(useSearch()).get("next"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const locked = useRef(false);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  if (auth.isChecking) return <MobileLayout title="欢迎回来" showBack><RequestState message="正在确认登录状态…" /></MobileLayout>;
  if (auth.user) return <Redirect to={next} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try { await auth.login(username.trim(), password); navigate(next, { replace: true }); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { locked.current = false; setBusy(false); }
  };

  return <MobileLayout title="欢迎回来" showBack>
    <div className="px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 mx-auto mb-4 flex items-center justify-center"><Heart className="w-8 h-8 text-primary fill-primary" aria-hidden="true" /></div>
        <h2 className="text-2xl font-bold mb-2">把甜蜜留在这里</h2>
        <p className="text-sm text-muted-foreground">登录后即可下单、模拟付款和查看历史订单</p>
      </motion.div>
      <form onSubmit={submit} className="rounded-2xl p-5 bg-card/80 backdrop-blur-sm border border-card-border space-y-5">
        <div><label htmlFor="login-username" className="block text-sm font-medium mb-2">账号</label><div className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border/50 px-3 focus-within:border-primary"><UserRound className="w-5 h-5 text-muted-foreground" aria-hidden="true" /><input id="login-username" name="username" autoComplete="username" required maxLength={32} disabled={busy} value={username} onChange={event => setUsername(event.target.value)} className="w-full min-h-12 bg-transparent outline-none" placeholder="输入账号" /></div></div>
        <div><label htmlFor="login-password" className="block text-sm font-medium mb-2">密码</label><div className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border/50 px-3 focus-within:border-primary"><LockKeyhole className="w-5 h-5 text-muted-foreground" aria-hidden="true" /><input id="login-password" name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="w-full min-h-12 bg-transparent outline-none" placeholder="输入密码" /></div></div>
        {error && <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className="w-full min-h-12 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">{busy && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}{busy ? "正在登录…" : "登录"}</button>
      </form>
      <p className="text-center text-sm text-muted-foreground mt-5">还没有账号？<Link href={`/register?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center text-primary underline ml-2">注册账号</Link></p>
      <Link href="/" className="mt-6 min-h-11 flex items-center justify-center text-sm text-primary">先逛逛菜单</Link>
    </div>
  </MobileLayout>;
}
