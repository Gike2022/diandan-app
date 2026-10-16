import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TrendingUp } from "lucide-react";
import { AdminLayout, adminButton, adminControl, adminPrimary } from "../components/admin-layout";
import { RequestState } from "../components/request-state";
import { useAuth } from "../context/AuthContext";
import { adminApi, type BusinessStatistics } from "../lib/admin-api";
import { errorMessage, money, orderStatusLabels } from "../lib/api";

function recentRange(days: number) {
  const dateTo = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  return { dateFrom: new Date(Date.parse(`${dateTo}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10), dateTo };
}
const card = "rounded-2xl bg-card/80 border border-card-border p-5";
function RevenueTrend({ daily }: { daily: BusinessStatistics["daily"] }) {
  const maximum = Math.max(1, ...daily.map(day => day.revenueCents));
  const step = 540 / daily.length;
  return <figure aria-label="每日营业额趋势">
    <svg viewBox="0 0 640 230" role="img" aria-labelledby="revenue-chart-title" className="w-full h-auto text-primary">
      <title id="revenue-chart-title">每日营业额，精确金额可查看下方每日明细</title>
      {[0, 0.5, 1].map(ratio => <g key={ratio}><line x1="85" y1={185 - ratio * 150} x2="625" y2={185 - ratio * 150} stroke="currentColor" opacity="0.15" /><text x="78" y={190 - ratio * 150} textAnchor="end" fill="currentColor" fontSize="12">¥{money(Math.round(maximum * ratio))}</text></g>)}
      {daily.map((day, index) => <g key={day.day}><rect x={85 + index * step + step * 0.15} y={185 - day.revenueCents / maximum * 150} width={Math.max(1, step * 0.7)} height={day.revenueCents / maximum * 150} rx="2" fill="currentColor"><title>{day.day}：¥{money(day.revenueCents)}</title></rect>{(index % Math.ceil(daily.length / 7) === 0 || index === daily.length - 1) && <text x={85 + (index + 0.5) * step} y="212" textAnchor="middle" fill="currentColor" fontSize="12">{day.day.slice(5).replace("-", "/")}</text>}</g>)}
    </svg>
    <figcaption className="text-xs text-muted-foreground">每日已完成且已付款订单金额，包含包装费。</figcaption>
  </figure>;
}

export default function AdminStatistics() {
  const { user, token } = useAuth();
  const [range, setRange] = useState(() => recentRange(7));
  const [draft, setDraft] = useState(range);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["admin", user!.id, "statistics", range], queryFn: ({ signal }) => adminApi.statistics(token!, range, signal), retry: false, refetchInterval: 30000 });
  const applyRecent = (days: number) => { const next = recentRange(days); setDraft(next); setError(""); if (next.dateFrom === range.dateFrom && next.dateTo === range.dateTo) void query.refetch(); else setRange(next); };
  return <AdminLayout>
    <div className="flex justify-between items-center gap-3"><div><h2 className="text-xl font-bold">营业统计</h2><p className="text-xs text-muted-foreground mt-1">看看每一份用心带来的收获</p></div><button className={`${adminButton} inline-flex items-center gap-2 shrink-0`} disabled={query.isFetching} onClick={() => { void query.refetch(); }}><RefreshCw aria-hidden="true" className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新统计</button></div>
    <form aria-label="营业统计日期筛选" className={`${card} space-y-4`} onSubmit={event => {
      event.preventDefault();
      if (draft.dateFrom > draft.dateTo) { setError("结束日期不能早于开始日期"); return; }
      if ((Date.parse(draft.dateTo) - Date.parse(draft.dateFrom)) / 86400000 >= 92) { setError("统计范围最多为 92 天"); return; }
      setError(""); if (draft.dateFrom === range.dateFrom && draft.dateTo === range.dateTo) void query.refetch(); else setRange({ ...draft });
    }}>
      <div className="grid sm:grid-cols-2 gap-4">{([{ key: "dateFrom", label: "统计开始日期" }, { key: "dateTo", label: "统计结束日期" }] as const).map(field => <div className="min-w-0" key={field.key}><label className="block text-sm mb-2" htmlFor={`stats-${field.key}`}>{field.label}</label><input id={`stats-${field.key}`} type="date" required min="1000-01-01" max="9998-12-31" style={{ colorScheme: "dark" }} className={`${adminControl} min-w-0`} value={draft[field.key]} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} /></div>)}</div>
      <div className="flex flex-wrap gap-2 items-center"><button type="button" className={adminButton} onClick={() => applyRecent(1)}>今日</button><button type="button" className={adminButton} onClick={() => applyRecent(7)}>近 7 天</button><button type="button" className={adminButton} onClick={() => applyRecent(30)}>近 30 天</button><button className={`${adminPrimary} sm:ml-auto`}>查询统计</button></div>
      <p className="text-xs text-muted-foreground">按北京时间的下单日期统计，包含结束日期当天，最多查询 92 天。</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
    {query.isPending ? <RequestState message="正在汇总营业数据…" /> : query.isError && !query.data ? <RequestState error message={errorMessage(query.error)} retry={() => { void query.refetch(); }} /> : query.data && <>
      {query.isError && <p role="alert" className="text-sm text-destructive">更新失败，当前显示上次统计结果。请点击刷新统计重试。</p>}
      <p className="text-xs text-muted-foreground">当前范围：{query.data.dateFrom} 至 {query.data.dateTo} · 更新于 <time dateTime={query.data.generatedAt}>{new Date(query.data.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time>（北京时间）</p>
      <div className="grid sm:grid-cols-3 gap-3">
        {[{ title: "营业额", value: `¥${money(query.data.summary.revenueCents)}` }, { title: "已完成订单", value: `${query.data.summary.completedOrders} 笔` }, { title: "订单总数", value: `${query.data.summary.totalOrders} 笔` }].map(metric => <section aria-label={metric.title} key={metric.title} className={card}><h3 className="text-sm text-muted-foreground">{metric.title}</h3><p className="text-2xl font-bold text-primary mt-3 break-all tabular-nums">{metric.value}</p></section>)}
      </div>
      <section className={`${card} space-y-3`}><h3 className="font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" aria-hidden="true" />每日营业额</h3><RevenueTrend daily={query.data.daily} />
        <details><summary className="min-h-11 flex items-center text-sm text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">查看每日明细</summary><div className="overflow-x-auto"><table className="w-full text-sm tabular-nums"><caption className="sr-only">每日订单与营业额</caption><thead><tr className="text-muted-foreground"><th className="text-left py-3">日期</th><th className="text-right">订单数</th><th className="text-right">完成数</th><th className="text-right">营业额</th></tr></thead><tbody>{query.data.daily.map(day => <tr key={day.day} className="border-t border-border"><th scope="row" className="text-left py-3 font-normal whitespace-nowrap">{day.day}</th><td className="text-right">{day.totalOrders}</td><td className="text-right">{day.completedOrders}</td><td className="text-right whitespace-nowrap">¥{money(day.revenueCents)}</td></tr>)}</tbody></table></div></details>
      </section>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className={`${card} space-y-4`}><h3 className="font-bold">订单状态</h3><dl className="space-y-3">{query.data.statuses.map(item => <div className="flex justify-between text-sm gap-3" key={item.status}><dt className="text-muted-foreground">{orderStatusLabels[item.status]}</dt><dd>{item.count} 笔</dd></div>)}</dl><p className="border-t border-border pt-4 text-sm">已模拟退款金额 <strong className="text-primary float-right">¥{money(query.data.summary.refundedCents)}</strong></p></section>
        <section className={`${card} space-y-4`}><h3 className="font-bold">热门菜品 TOP 5</h3>{!query.data.topDishes.length ? <p className="py-8 text-center text-sm text-muted-foreground">所选日期暂无已完成订单</p> : <ol className="space-y-4">{query.data.topDishes.map((dish, index) => <li className="flex gap-3 items-start text-sm" key={dish.dishId}><span className="rounded-full w-7 h-7 shrink-0 flex items-center justify-center bg-primary/10 text-primary">{index + 1}</span><div className="min-w-0 flex-1"><p className="font-medium break-words">{dish.name}</p><p className="text-xs text-muted-foreground mt-1">售出 {dish.quantity} 份</p></div><span className="text-primary shrink-0 tabular-nums">¥{money(dish.amountCents)}</span></li>)}</ol>}<p className="text-xs text-muted-foreground">仅计已完成且已付款订单；菜品销售额不含包装费。</p></section>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">营业额按所选日期内下单、当前已完成且已付款的订单计算，包含包装费。退款金额来自这些日期内下单订单的成功模拟退款记录。当前系统所有金额均为模拟交易数据。</p>
    </>}
  </AdminLayout>;
}
