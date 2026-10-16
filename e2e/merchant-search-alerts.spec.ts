import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const base = "http://127.0.0.1:3002/api";
let admin: string;
let customer: string;
const errors = new WeakMap<Page, string[]>();
async function api(request: APIRequestContext, path: string, token = admin, data?: unknown, method = "POST") {
  const response = await request.fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() }, ...(data === undefined ? {} : { data }) });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function createOrder(request: APIRequestContext, paid = true) {
  const { order } = await api(request, "/orders", customer, { items: [{ dishId: "h1", quantity: 1 }], name: "查询提醒顾客", phone: "13900000000", address: "商家功能演示地址", payMethod: "wechat" });
  if (paid) await api(request, `/orders/${order.id}/demo-payment`, customer, { outcome: "success" });
  return order;
}
async function login(page: Page, path = "/admin") {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("账号", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("Admin12345!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + "$"));
  await expect(page.getByRole("complementary", { name: "新订单提醒" }).getByRole("status")).toHaveText(/待接单 \d+ 笔/);
}
const reminder = (page: Page) => page.getByRole("complementary", { name: "新订单提醒" });
const newToast = (page: Page) => page.getByText(/^收到 \d+ 笔新订单$/);

test.beforeAll(async ({ request }) => {
  const a = await request.post(base + "/auth/login", { data: { username: "admin", password: "Admin12345!" } });
  const c = await request.post(base + "/auth/login", { data: { username: "demo", password: "Customer12345!" } });
  expect(a.ok() && c.ok()).toBeTruthy();
  admin = (await a.json()).token; customer = (await c.json()).token;
});
test.beforeEach(async ({ page }) => {
  const messages: string[] = []; errors.set(page, messages);
  page.on("pageerror", error => messages.push(error.message));
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
  await page.route("https://picsum.photos/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#745066"/></svg>' }));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test("组合查询从第二页返回第一页，保留生效条件，日期错误与无结果可恢复", async ({ page, request }) => {
  for (let index = 0; index < 21; index++) await createOrder(request, false);
  const target = await createOrder(request);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(target.createdAt));
  await login(page);
  await page.getByLabel("订单状态", { exact: true }).selectOption("");
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByText(/第 2 \/ \d+ 页/)).toBeVisible();
  await page.getByLabel("订单号", { exact: true }).fill(target.orderNumber.slice(-10).toUpperCase());
  await page.getByLabel("开始日期", { exact: true }).fill(today);
  await page.getByLabel("结束日期", { exact: true }).fill(today);
  await page.getByRole("button", { name: "查询订单", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: `商家订单 ${target.orderNumber}`, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "上一页", exact: true })).toBeDisabled();
  await expect(page.getByText("第 1 / 1 页 · 共 1 条", { exact: true })).toBeVisible();
  await page.getByLabel("订单号", { exact: true }).fill("NONEXISTENTORDER");
  await expect(page.getByLabel("已应用的订单查询条件")).toContainText(target.orderNumber.slice(-10).toUpperCase());
  await page.getByRole("button", { name: "查询订单", exact: true }).click();
  await expect(page.getByRole("heading", { name: "没有符合查询条件的订单", exact: true })).toBeVisible();
  await page.getByLabel("开始日期", { exact: true }).fill("2034-04-11");
  await page.getByLabel("结束日期", { exact: true }).fill("2034-04-10");
  await page.getByRole("button", { name: "查询订单", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("结束日期不能早于开始日期");
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(page.getByLabel("订单号", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("开始日期", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("结束日期", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("订单状态", { exact: true })).toHaveValue("pending_acceptance");
  await expect(page.getByRole("article", { name: `商家订单 ${target.orderNumber}`, exact: true })).toBeVisible();
  for (const [width, height, filename] of [[375, 812, "mobile"], [1280, 1000, "desktop"]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector("main")?.scrollTo(0, 0); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `test-results/admin-search-alerts-${filename}.png` });
  }
});

test("菜品页收到付款提醒，首次已有订单及刷新切页不重复提醒，接单后数量减少", async ({ page, request }) => {
  await createOrder(request);
  await login(page, "/admin/menu");
  const before = await api(request, "/admin/orders/notifications", admin, undefined, "GET");
  await expect(reminder(page).getByRole("status")).toHaveText(`待接单 ${before.total} 笔`);
  await expect(newToast(page)).toHaveCount(0);
  const pending = await createOrder(request, false);
  const poll = await page.waitForResponse(response => response.url().endsWith("/admin/orders/notifications"));
  expect((await poll.json()).total).toBe(before.total);
  await expect(newToast(page)).toHaveCount(0);
  await api(request, `/orders/${pending.id}/demo-payment`, customer, { outcome: "success" });
  await expect(newToast(page)).toHaveText("收到 1 笔新订单");
  await expect(reminder(page).getByRole("status")).toHaveText(`待接单 ${before.total + 1} 笔`);
  await page.locator("[toast-close]").click();
  await expect(newToast(page)).toHaveCount(0);
  await page.reload();
  await expect(reminder(page).getByRole("status")).toHaveText(`待接单 ${before.total + 1} 笔`);
  await expect(newToast(page)).toHaveCount(0);
  await page.getByRole("link", { name: "查看待接单", exact: true }).click();
  const card = page.getByRole("article", { name: `商家订单 ${pending.orderNumber}`, exact: true });
  await card.getByRole("button", { name: "接单并制作", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(reminder(page).getByRole("status")).toHaveText(`待接单 ${before.total} 笔`);
  await expect(newToast(page)).toHaveCount(0);
});

test("提醒独立于筛选且按ID识别同数量换单，查看待接单清空筛选", async ({ page, request }) => {
  const outgoing = await createOrder(request);
  await login(page);
  await page.getByLabel("订单状态", { exact: true }).selectOption("completed");
  await page.getByLabel("订单号", { exact: true }).fill("FILTERHIDESNEW");
  await page.getByRole("button", { name: "查询订单", exact: true }).click();
  await expect(page.getByRole("heading", { name: "没有符合查询条件的订单", exact: true })).toBeVisible();
  const before = await api(request, "/admin/orders/notifications", admin, undefined, "GET");
  // Pause delivery of snapshots while the queue replaces one order with another.
  await page.route("**/api/admin/orders/notifications", route => route.abort());
  await api(request, `/admin/orders/${outgoing.id}/status`, admin, { status: "preparing" }, "PATCH");
  const incoming = await createOrder(request);
  await expect(reminder(page)).toContainText("提醒同步中断");
  await page.unroute("**/api/admin/orders/notifications");
  await reminder(page).getByRole("button", { name: "重试提醒同步", exact: true }).click();
  await expect(newToast(page)).toHaveText("收到 1 笔新订单");
  await expect(reminder(page).getByRole("status")).toHaveText(`待接单 ${before.total} 笔`);
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.locator("[toast-close]").click();
  await reminder(page).getByRole("button", { name: "查看待接单", exact: true }).click();
  await expect(page.getByLabel("订单号", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("订单状态", { exact: true })).toHaveValue("pending_acceptance");
  await expect(page.getByRole("article", { name: `商家订单 ${incoming.orderNumber}`, exact: true })).toBeVisible();
  await page.waitForResponse(response => response.url().endsWith("/admin/orders/notifications"));
  await expect(newToast(page)).toHaveCount(0);
});

test("首次提醒查询失败不把已有订单当作新订单，恢复后批量合并提醒", async ({ page, request }) => {
  await page.route("**/api/admin/orders/notifications", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "同步暂不可用" } }) }));
  await page.goto("/login?next=%2Fadmin%2Fcategories");
  await page.getByLabel("账号", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("Admin12345!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(reminder(page)).toContainText("待接单数量暂不可用");
  await createOrder(request);
  await page.unroute("**/api/admin/orders/notifications");
  await reminder(page).getByRole("button", { name: "重试提醒同步", exact: true }).click();
  await expect(reminder(page).getByRole("status")).toHaveText(/待接单 \d+ 笔/);
  await expect(newToast(page)).toHaveCount(0);
  await page.route("**/api/admin/orders/notifications", route => route.abort());
  await expect(reminder(page)).toContainText("提醒同步中断");
  const before = await api(request, "/admin/orders/notifications", admin, undefined, "GET");
  await createOrder(request); await createOrder(request); await createOrder(request);
  await page.unroute("**/api/admin/orders/notifications");
  await reminder(page).getByRole("button", { name: "重试提醒同步", exact: true }).click();
  await expect(newToast(page)).toHaveText("收到 3 笔新订单");
  await expect(reminder(page).getByRole("status")).toHaveText(`待接单 ${before.total + 3} 笔`);
});
