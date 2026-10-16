import { useState } from "react";
import { AdminLayout, adminButton, adminPrimary } from "../components/admin-layout";
import { CategoryEditor } from "../components/admin-catalog-editors";
import { RequestState } from "../components/request-state";
import { useAdminCatalog } from "../hooks/use-admin-catalog";
import { errorMessage, type Category } from "../lib/api";

export default function AdminCategories() {
  const { token, categories, refreshCatalog } = useAdminCatalog();
  const [editor, setEditor] = useState<Category | "new" | null>(null);
  return <AdminLayout>
    <div className="flex justify-between items-center gap-3"><div><h2 className="text-xl font-bold">分类管理</h2><p className="text-xs text-muted-foreground mt-1">整理菜单，让心意更好找</p></div><button onClick={() => setEditor("new")} className={adminPrimary}>新增分类</button></div>
    {categories.isPending ? <RequestState message="正在加载分类…" /> : categories.isError ? <RequestState error message={errorMessage(categories.error)} retry={() => { void categories.refetch(); }} /> : categories.data.categories.length === 0 ? <p className="p-8 text-center text-muted-foreground">还没有分类，先添加一个吧</p> : <div className="grid sm:grid-cols-2 gap-4">{categories.data.categories.map(category => <article key={category.id} aria-label={`分类 ${category.name}`} className="rounded-2xl bg-card/80 border border-card-border p-5 flex items-center justify-between gap-3"><div className="min-w-0"><h3 className="font-bold break-words">{category.name}</h3><p className="mt-2 text-sm text-muted-foreground">排序 {category.sortOrder} · <span className={category.isActive ? "text-primary" : ""}>{category.isActive ? "已启用" : "已停用"}</span></p></div><button onClick={() => setEditor(category)} className={`${adminButton} shrink-0`}>编辑分类</button></article>)}</div>}
    {editor && <CategoryEditor key={editor === "new" ? "new" : editor.id} token={token} category={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} onSaved={refreshCatalog} />}
  </AdminLayout>;
}
