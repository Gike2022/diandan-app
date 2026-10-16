import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { Heart, Loader2 } from "lucide-react";
import { MobileLayout } from "../components/layout";
import { RequestState } from "../components/request-state";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/api";
import { safeNext } from "../lib/auth-navigation";

const inputClass = "w-full min-h-12 rounded-xl bg-muted/30 border border-border/50 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

export default function Register() {
  const auth = useAuth();
  const [, navigate] = useLocation();
  const next = safeNext(new URLSearchParams(useSearch()).get("next"));
  const [form, setForm] = useState({ username: "", displayName: "", phone: "", password: "", confirmation: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    setError(""); setErrorField("");
    if (form.password !== form.confirmation) { setErrorField("register-confirmation"); setError("两次输入的密码不一致，请重新确认"); return; }
    locked.current = true; setBusy(true);
    try {
      await auth.register({ username: form.username.trim(), displayName: form.displayName.trim(), password: form.password, ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) });
      if (mounted.current) navigate(next, { replace: true });
    } catch (failure) { if (mounted.current) setError(errorMessage(failure)); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  if (auth.isChecking) return <MobileLayout title="加入小厨" showBack><RequestState message="正在确认登录状态…" /></MobileLayout>;
  if (auth.user) return <Redirect to={next} replace />;
  return <MobileLayout title="加入小厨" showBack>
    <div className="px-5 py-7">
      <div className="text-center mb-6"><div className="w-14 h-14 rounded-2xl bg-primary/15 mx-auto mb-3 flex items-center justify-center"><Heart className="w-7 h-7 text-primary fill-primary" aria-hidden="true" /></div><h2 className="text-2xl font-bold mb-2">加入甜蜜小厨</h2><p className="text-sm text-muted-foreground">创建顾客账号，把喜欢的味道留在这里</p></div>
      <form onSubmit={submit} aria-busy={busy} className="rounded-2xl p-5 bg-card/80 backdrop-blur-sm border border-card-border space-y-4">
        {error && <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}{errorField && <a href={`#${errorField}`} className="block underline mt-2">检查确认密码</a>}</p>}
        <fieldset disabled={busy} className="space-y-4">
          <div><label htmlFor="register-username" className="block text-sm font-medium mb-2">账号</label><input id="register-username" name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]{3,32}" aria-describedby="username-help" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} className={inputClass} /><p id="username-help" className="text-xs text-muted-foreground mt-1">3–32 位字母、数字或下划线，字母不区分大小写</p></div>
          <div><label htmlFor="register-name" className="block text-sm font-medium mb-2">昵称</label><input id="register-name" name="displayName" autoComplete="nickname" required maxLength={80} value={form.displayName} onChange={event => setForm({ ...form, displayName: event.target.value })} className={inputClass} /></div>
          <div><label htmlFor="register-phone" className="block text-sm font-medium mb-2">联系电话（选填）</label><input id="register-phone" name="phone" type="tel" autoComplete="tel" maxLength={32} pattern={"\\+?[0-9][0-9 \\-]{5,30}[0-9]"} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className={inputClass} /></div>
          <div><label htmlFor="register-password" className="block text-sm font-medium mb-2">密码</label><input id="register-password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} className={inputClass} /><p className="text-xs text-muted-foreground mt-1">8–128 个字符</p></div>
          <div><label htmlFor="register-confirmation" className="block text-sm font-medium mb-2">确认密码</label><input id="register-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-invalid={errorField === "register-confirmation" || undefined} value={form.confirmation} onChange={event => setForm({ ...form, confirmation: event.target.value })} className={inputClass} /></div>
        </fieldset>
        <button disabled={busy || !form.username.trim() || !form.displayName.trim()} className="w-full min-h-12 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">{busy && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}{busy ? "正在注册…" : "注册并登录"}</button>
      </form>
      <p className="text-center text-sm text-muted-foreground mt-5">已有账号？<Link href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center text-primary underline ml-2">返回登录</Link></p>
    </div>
  </MobileLayout>;
}
