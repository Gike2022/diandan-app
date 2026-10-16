import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShieldCheck, UserRound } from "lucide-react";
import { MobileLayout } from "../components/layout";
import { adminButton, adminControl, adminPrimary } from "../components/admin-layout";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/api";

const emptyPasswords = { currentPassword: "", newPassword: "", confirmPassword: "" };
export default function Profile() {
  const auth = useAuth();
  const [profile, setProfile] = useState({ displayName: auth.user!.displayName, phone: auth.user!.phone ?? "" });
  const [passwords, setPasswords] = useState(emptyPasswords);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const saveProfile = useMutation({
    mutationFn: () => auth.updateProfile({ displayName: profile.displayName.trim(), phone: profile.phone.trim() || null }),
    onSuccess: user => setProfile({ displayName: user.displayName, phone: user.phone ?? "" }),
  });
  const savePassword = useMutation({
    mutationFn: () => auth.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }),
    onSuccess: () => { setPasswords(emptyPasswords); setShowPasswords(false); },
  });
  const busy = saveProfile.isPending || savePassword.isPending;
  return <MobileLayout title="个人中心" showBack>
    <div className="p-4 space-y-5">
      <section className="rounded-2xl bg-card/80 border border-card-border p-5 space-y-3">
        <UserRound className="w-9 h-9 text-primary" aria-hidden="true" /><h2 className="text-xl font-bold">{auth.user!.displayName}</h2>
        <dl className="text-sm space-y-2"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">登录账号</dt><dd className="break-all">{auth.user!.username}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">账户身份</dt><dd>{auth.user!.role === "admin" ? "商家管理员" : "普通用户"}</dd></div></dl>
        {auth.user!.role === "admin" && <Link href="/admin" className={`${adminButton} inline-flex items-center`}>返回商家工作台</Link>}
      </section>
      <form aria-label="修改个人资料" className="rounded-2xl bg-card/80 border border-card-border p-5 space-y-4" onSubmit={event => { event.preventDefault(); if (!busy) saveProfile.mutate(); }}>
        <h2 className="font-bold text-lg">个人资料</h2>
        <fieldset disabled={busy} className="space-y-4">
          <div><label htmlFor="profile-name" className="block text-sm mb-2">昵称</label><input id="profile-name" required maxLength={80} autoComplete="nickname" className={adminControl} value={profile.displayName} onChange={event => { setProfile({ ...profile, displayName: event.target.value }); saveProfile.reset(); }} /></div>
          <div><label htmlFor="profile-phone" className="block text-sm mb-2">联系电话（选填）</label><input id="profile-phone" type="tel" autoComplete="tel" maxLength={32} className={adminControl} value={profile.phone} onChange={event => { setProfile({ ...profile, phone: event.target.value }); saveProfile.reset(); }} /></div>
          <p className="text-xs text-muted-foreground">下次结算会优先填入你的昵称和联系电话。</p>
        </fieldset>
        {saveProfile.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(saveProfile.error)}</p>}
        {saveProfile.isSuccess && <p role="status" className="text-sm text-primary">个人资料已保存</p>}
        <button className={`${adminPrimary} w-full`} disabled={busy || !profile.displayName.trim()}>{saveProfile.isPending ? "保存中…" : "保存资料"}</button>
      </form>
      <form aria-label="修改登录密码" className="rounded-2xl bg-card/80 border border-card-border p-5 space-y-4" onSubmit={event => {
        event.preventDefault(); if (busy) return; savePassword.reset();
        if (passwords.newPassword !== passwords.confirmPassword) { setPasswordError("两次输入的新密码不一致"); return; }
        if (passwords.newPassword === passwords.currentPassword) { setPasswordError("新密码不能与原密码相同"); return; }
        setPasswordError(""); savePassword.mutate();
      }}>
        <h2 className="font-bold text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" />修改密码</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">密码为 8–128 个字符。修改成功后旧登录会话失效，当前页面保持登录。</p>
        <fieldset disabled={busy} className="space-y-4">
          {([{ key: "currentPassword", label: "原密码", complete: "current-password" }, { key: "newPassword", label: "新密码", complete: "new-password" }, { key: "confirmPassword", label: "确认新密码", complete: "new-password" }] as const).map(field => <div key={field.key}><label htmlFor={`profile-${field.key}`} className="block text-sm mb-2">{field.label}</label><input id={`profile-${field.key}`} type={showPasswords ? "text" : "password"} required minLength={8} maxLength={128} autoComplete={field.complete} className={adminControl} value={passwords[field.key]} onChange={event => { setPasswords({ ...passwords, [field.key]: event.target.value }); setPasswordError(""); savePassword.reset(); }} /></div>)}
          <label className="flex items-center gap-3 min-h-11 text-sm"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} className="size-4 accent-primary" />显示密码</label>
        </fieldset>
        {(passwordError || savePassword.isError) && <p role="alert" className="text-sm text-destructive">{passwordError || errorMessage(savePassword.error)}</p>}
        {savePassword.isSuccess && <p role="status" className="text-sm text-primary">密码已修改，旧登录会话已失效</p>}
        <button disabled={busy} className={`${adminPrimary} w-full`}>{savePassword.isPending ? "正在修改…" : "修改密码"}</button>
      </form>
    </div>
  </MobileLayout>;
}
