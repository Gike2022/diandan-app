import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { AdminLayout, AdminPagination, adminButton, adminControl, adminPrimary } from "../components/admin-layout";
import { DishEditor } from "../components/admin-catalog-editors";
import { RequestState } from "../components/request-state";
import { useAdminCatalog } from "../hooks/use-admin-catalog";
import { adminApi, type DishPatch } from "../lib/admin-api";
import { errorMessage, money, imageSource, type MenuDish } from "../lib/api";

export default function AdminMenu() {
  const { token, user, categories, refreshCatalog } = useAdminCatalog();
  const [editor, setEditor] = useState<MenuDish | "new" | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const query = useQuery({ queryKey: ["admin", user.id, "menu", page, search, categoryId], queryFn: ({ signal }) => adminApi.menu(token, page, search, categoryId, signal), retry: false });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: DishPatch }) => adminApi.saveDish(token, body, id), onSuccess: refreshCatalog, onError: () => { void refreshCatalog(); } });
  const categoryList = categories.data?.categories ?? [];
  return <AdminLayout>
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">菜品管理</h2><p className="text-xs text-muted-foreground mt-1">把每一道用心之作呈现在菜单里</p></div><button className={adminPrimary} onClick={() => setEditor("new")} disabled={!categoryList.length}>新增菜品</button></div>
    <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
      <div className="flex flex-1 min-w-0 gap-2"><input aria-label="搜索菜品名称" className={adminControl} maxLength={80} placeholder="搜索菜品名称" value={searchInput} onChange={event => setSearchInput(event.target.value)} /><button className={`${adminButton} shrink-0`}>搜索</button></div>
      <select aria-label="筛选菜品分类" className={`${adminControl} sm:w-48`} value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }}><option value="">全部分类</option>{categoryList.map(category => <option key={category.id} value={category.id}>{category.name}{category.isActive ? "" : "（已停用）"}</option>)}</select>
    </form>
    {categories.isError && <RequestState error message={errorMessage(categories.error)} retry={() => { void categories.refetch(); }} />}
    {update.isError && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{errorMessage(update.error)}</p>}
    {query.isPending ? <RequestState message="正在准备菜品列表…" /> : query.isError ? <RequestState error message={errorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <>
      {!query.data.items.length ? <p className="rounded-2xl border border-card-border bg-card/80 p-8 text-center text-muted-foreground">没有符合条件的菜品</p> : <div className="grid md:grid-cols-2 gap-4">{query.data.items.map(dish => {
        const categoryActive = categoryList.find(category => category.id === dish.categoryId)?.isActive;
        return <article key={dish.id} aria-label={`菜品 ${dish.name}`} className="rounded-2xl border border-card-border bg-card/80 p-4 space-y-4">
          <div className="flex gap-4"><div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">{dish.imageUrl ? <img src={imageSource(dish.imageUrl)} alt={dish.name} loading="lazy" className="w-full h-full object-cover" /> : <ImageIcon className="w-7 h-7 text-muted-foreground" aria-hidden="true" />}</div><div className="min-w-0 flex-1"><h3 className="font-bold break-words">{dish.name}</h3><p className="text-xs text-muted-foreground mt-1">{dish.category} · 排序 {dish.sortOrder}</p><p className="text-primary font-bold text-lg mt-1">¥{money(dish.priceCents)}</p></div></div>
          {dish.description && <p className="text-sm text-muted-foreground line-clamp-2 break-words">{dish.description}</p>}
          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full px-3 py-1 bg-primary/10 text-primary">{dish.isActive ? "已上架" : "已下架"}</span><span className="rounded-full px-3 py-1 bg-muted">{dish.soldOut ? "已售罄" : "可售"}</span>{categoryActive === false && <span className="rounded-full px-3 py-1 bg-muted text-muted-foreground">分类已停用，顾客不可见</span>}</div>
          <div className="flex flex-wrap gap-2"><button className={adminButton} disabled={update.isPending || !categoryList.length} onClick={() => setEditor(dish)}>编辑菜品</button><button className={adminButton} disabled={update.isPending} onClick={() => update.mutate({ id: dish.id, body: { soldOut: !dish.soldOut, expectedVersion: dish.version } })}>{update.isPending && update.variables?.id === dish.id ? "保存中…" : dish.soldOut ? "恢复可售" : "设为售罄"}</button><button className={adminButton} disabled={update.isPending} onClick={() => update.mutate({ id: dish.id, body: { isActive: !dish.isActive, expectedVersion: dish.version } })}>{dish.isActive ? "下架菜品" : "上架菜品"}</button></div>
        </article>;
      })}</div>}
      <AdminPagination page={page} total={query.data.total} onChange={setPage} />
    </>}
    {editor && <DishEditor key={editor === "new" ? "new" : editor.id} token={token} dish={editor === "new" ? undefined : editor} categories={categoryList} onClose={() => setEditor(null)} onSaved={refreshCatalog} />}
  </AdminLayout>;
}
