import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { adminButton, adminControl } from "./admin-layout";
import { adminApi } from "../lib/admin-api";
import { errorMessage, imageSource } from "../lib/api";

export function DishImageInput({ token, value, onChange, onUploadingChange }: {
  token: string; value: string; onChange: (value: string) => void; onUploadingChange: (uploading: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController>();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const upload = async (file: File) => {
    setError(""); setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("请选择 JPG、PNG 或 WebP 图片"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("图片不能超过 5 MB"); return; }
    const current = new AbortController(); controller.current = current; onUploadingChange(true);
    try {
      const result = await adminApi.uploadImage(token, file, current.signal);
      if (mounted.current) { onChange(result.imageUrl); setMessage("图片已上传，保存菜品后生效"); }
    } catch (failure) { if (mounted.current && !current.signal.aborted) setError(errorMessage(failure)); }
    finally { if (mounted.current) onUploadingChange(false); }
  };
  return <div className="space-y-3">
    <div><label htmlFor="dish-upload" className="flex gap-2 items-center text-sm mb-2"><Upload className="w-4 h-4 text-primary" aria-hidden="true" />上传菜品图片</label><input id="dish-upload" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="dish-upload-help" className="block w-full min-w-0 text-sm min-h-11 file:mr-3 file:min-h-11 file:px-4 file:rounded-full file:border file:border-primary/40 file:bg-primary/10 file:text-primary file:cursor-pointer disabled:opacity-50" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /><p id="dish-upload-help" className="text-xs text-muted-foreground mt-2">支持 JPG、PNG、静态 WebP，单张最多 5 MB。</p></div>
    <div><label htmlFor="dish-image" className="block text-sm mb-2">图片地址（选填）</label><input id="dish-image" inputMode="url" maxLength={2048} value={value} onChange={event => { onChange(event.target.value); setMessage(""); setError(""); }} className={adminControl} placeholder="上传后自动填入，也可填写 https://…" /></div>
    {value && <div className="flex items-center gap-4"><img src={imageSource(value)} alt="菜品图片预览" className="w-24 h-24 shrink-0 rounded-xl object-cover bg-muted" /><button type="button" className={adminButton} onClick={() => { onChange(""); setMessage(""); }}>移除图片</button></div>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
