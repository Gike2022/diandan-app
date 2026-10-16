import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { adminButton, adminControl, adminPrimary } from "./admin-layout";
import { adminApi, type CategoryInput, type CategoryPatch, type DishInput, type DishPatch } from "../lib/admin-api";
import { ApiError, errorMessage, money, type Category, type MenuDish } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { changedFields, clearCatalogAttempt, definiteRejection, readCategoryAttempt, readDishAttempt, saveCatalogAttempt } from "../lib/catalog-attempt";
import { DishImageInput } from "./dish-image-input";

interface EditorProps { token: string; onClose: () => void; onSaved: () => void }

export function CategoryEditor({ token, category, onClose, onSaved }: EditorProps & { category?: Category }) {
  const { user } = useAuth();
  const [pending, setPending] = useState(() => category ? null : readCategoryAttempt(user!.id));
  const initial = pending?.body ?? category;
  const [name, setName] = useState(initial?.name ?? "");
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: ({ body, key }: { body: CategoryPatch; key?: string }) => adminApi.saveCategory(token, body, category?.id, key),
    onSuccess: async () => { if (!category) clearCatalogAttempt(user!.id, "category"); await onSaved(); },
    onError: failure => {
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") onSaved();
      if (!category && definiteRejection(failure)) { clearCatalogAttempt(user!.id, "category"); setPending(null); }
    },
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    setError("");
    const body: CategoryInput = { name: name.trim(), sortOrder, isActive };
    if (category) {
      const changes = changedFields(body, category);
      if (!Object.keys(changes).length) { onClose(); return; }
      save.mutate({ body: { ...changes, expectedVersion: category.version } }, { onSuccess: onClose });
    } else {
      try { const attempt = pending ?? saveCatalogAttempt(user!.id, "category", body); setPending(attempt); save.mutate(attempt, { onSuccess: onClose }); }
      catch { setError("浏览器无法保存本次新增请求，请允许页面存储后重试"); }
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent className="w-[calc(100vw-2rem)] max-h-[85dvh] overflow-y-auto rounded-2xl">
    <DialogHeader><DialogTitle>{category ? "编辑分类" : "新增分类"}</DialogTitle><DialogDescription>停用分类后，顾客菜单将隐藏其中的全部菜品。</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={submit}>
      {pending && <p className="text-sm text-muted-foreground">这次新增结果尚待确认，保存会核对原记录。</p>}
      <fieldset disabled={save.isPending || Boolean(pending)} className="space-y-4">
        <div><label htmlFor="category-name" className="block text-sm mb-2">分类名称</label><input id="category-name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} className={adminControl} /></div>
        <div><label htmlFor="category-sort" className="block text-sm mb-2">排序</label><input id="category-sort" type="number" min={0} max={100000} step={1} required value={sortOrder} onChange={event => setSortOrder(Number(event.target.value))} className={adminControl} /><p className="mt-1 text-xs text-muted-foreground">数值越小越靠前。</p></div>
        <label className="flex items-center gap-3 min-h-11 text-sm"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} className="size-4 accent-primary" />启用分类</label>
      </fieldset>
      {(error || save.isError) && <p role="alert" className="text-sm text-destructive">{error || errorMessage(save.error)}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={save.isPending} className={adminButton} onClick={onClose}>取消</button><button disabled={save.isPending || !name.trim()} className={adminPrimary}>{save.isPending ? "保存中…" : "保存分类"}</button></div>
    </form>
  </DialogContent></Dialog>;
}

export function DishEditor({ token, dish, categories, onClose, onSaved }: EditorProps & { dish?: MenuDish; categories: Category[] }) {
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const [pending, setPending] = useState(() => dish ? null : readDishAttempt(user!.id));
  const initial = pending?.body ?? dish;
  const [form, setForm] = useState({
    name: initial?.name ?? "", categoryId: initial?.categoryId ?? categories.find(category => category.isActive)?.id ?? categories[0]?.id ?? "",
    price: initial ? money(initial.priceCents) : "", description: initial?.description ?? "", imageUrl: initial?.imageUrl ?? "",
    sortOrder: initial?.sortOrder ?? 0, soldOut: initial?.soldOut ?? false, isActive: initial?.isActive ?? true,
  });
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: ({ body, key }: { body: DishPatch; key?: string }) => adminApi.saveDish(token, body, dish?.id, key),
    onSuccess: async () => { if (!dish) clearCatalogAttempt(user!.id, "dish"); await onSaved(); },
    onError: failure => {
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") onSaved();
      if (!dish && definiteRejection(failure)) { clearCatalogAttempt(user!.id, "dish"); setPending(null); }
    },
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (save.isPending || uploading) return;
    const price = form.price.trim();
    if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(price)) { setError("价格须为最多两位小数的金额"); return; }
    const [whole, decimal = ""] = price.split(".");
    const priceCents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    if (priceCents < 1 || priceCents > 1000000) { setError("价格须在 0.01 至 10000.00 元之间"); return; }
    if (form.imageUrl.trim() && !/^https?:\/\//.test(form.imageUrl.trim()) && !/^\/api\/uploads\/menu\/[a-f0-9]{64}\.webp$/.test(form.imageUrl.trim())) { setError("图片请填写 HTTP/HTTPS 地址或选择上传图片"); return; }
    setError("");
    const body: DishInput = { name: form.name.trim(), categoryId: form.categoryId, priceCents, description: form.description.trim(), imageUrl: form.imageUrl.trim(), sortOrder: form.sortOrder, soldOut: form.soldOut, isActive: form.isActive };
    if (dish) {
      const changes = changedFields(body, dish);
      if (!Object.keys(changes).length) { onClose(); return; }
      save.mutate({ body: { ...changes, expectedVersion: dish.version } }, { onSuccess: onClose });
    } else {
      try { const attempt = pending ?? saveCatalogAttempt(user!.id, "dish", body); setPending(attempt); save.mutate(attempt, { onSuccess: onClose }); }
      catch { setError("浏览器无法保存本次新增请求，请允许页面存储后重试"); }
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending && !uploading) onClose(); }}><DialogContent className="w-[calc(100vw-2rem)] max-h-[85dvh] overflow-y-auto rounded-2xl">
    <DialogHeader><DialogTitle>{dish ? "编辑菜品" : "新增菜品"}</DialogTitle><DialogDescription>保存后顾客可看到最新菜单，历史订单保留下单时的信息。</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      {pending && <p className="text-sm text-muted-foreground">这次新增结果尚待确认，保存会核对原记录。</p>}
      <fieldset disabled={save.isPending || uploading || Boolean(pending)} className="space-y-4">
        <div><label htmlFor="dish-name" className="block text-sm mb-2">菜品名称</label><input id="dish-name" required maxLength={80} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className={adminControl} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="dish-category" className="block text-sm mb-2">菜品分类</label><select id="dish-category" required value={form.categoryId} onChange={event => setForm({ ...form, categoryId: event.target.value })} className={adminControl}>{categories.map(category => <option value={category.id} key={category.id}>{category.name}{category.isActive ? "" : "（已停用）"}</option>)}</select></div>
          <div><label htmlFor="dish-price" className="block text-sm mb-2">价格（元）</label><input id="dish-price" inputMode="decimal" required value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} className={adminControl} placeholder="例如 19.90" /></div>
        </div>
        <div><label htmlFor="dish-description" className="block text-sm mb-2">菜品描述</label><textarea id="dish-description" maxLength={5000} rows={2} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className={`${adminControl} py-3 resize-y`} /></div>
        <DishImageInput token={token} value={form.imageUrl} onChange={imageUrl => setForm(current => ({ ...current, imageUrl }))} onUploadingChange={setUploading} />
        {uploading && <p role="status" className="text-sm text-primary">图片上传中…</p>}
        <div><label htmlFor="dish-sort" className="block text-sm mb-2">排序</label><input id="dish-sort" type="number" min={0} max={100000} step={1} required value={form.sortOrder} onChange={event => setForm({ ...form, sortOrder: Number(event.target.value) })} className={adminControl} /></div>
        <div className="flex flex-wrap gap-x-6"><label className="flex items-center gap-3 min-h-11 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} className="size-4 accent-primary" />上架展示</label><label className="flex items-center gap-3 min-h-11 text-sm"><input type="checkbox" checked={form.soldOut} onChange={event => setForm({ ...form, soldOut: event.target.checked })} className="size-4 accent-primary" />标记售罄</label></div>
      </fieldset>
      {(error || save.isError) && <p role="alert" className="text-sm text-destructive">{error || errorMessage(save.error)}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={save.isPending || uploading} className={adminButton} onClick={onClose}>取消</button><button disabled={save.isPending || uploading || !form.name.trim() || !form.categoryId} className={adminPrimary}>{uploading ? "图片上传中…" : save.isPending ? "保存中…" : "保存菜品"}</button></div>
    </form>
  </DialogContent></Dialog>;
}
