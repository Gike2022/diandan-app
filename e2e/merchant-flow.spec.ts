import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const apiBase = "http://127.0.0.1:3002/api";
let adminToken: string;
let customerToken: string;
const runtimeErrors = new WeakMap<Page, string[]>();

async function call(request: APIRequestContext, path: string, data?: unknown, method = "POST", token = adminToken) {
  const response = await request.fetch(apiBase + path, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function login(page: Page, next = "/admin", username = "admin", password = "Admin12345!") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  const response = page.waitForResponse(result => result.url().endsWith("/api/auth/login") && result.request().method() === "POST");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(next === "/" ? "/$" : next + "$"));
  return (await (await response).json()).token as string;
}

async function newOrder(request: APIRequestContext, paid = true) {
  const response = await request.post(apiBase + "/orders", {
    headers: { Authorization: `Bearer ${customerToken}`, "Idempotency-Key": `merchant-${crypto.randomUUID()}` },
    data: { items: [{ dishId: "h1", quantity: 1 }], name: "商家流程顾客", phone: "13900000000", address: "作品演示教学楼", notes: "请少放辣椒", payMethod: "wechat" },
  });
  expect(response.status()).toBe(201);
  const { order } = await response.json();
  if (paid) await call(request, `/orders/${order.id}/demo-payment`, { outcome: "success" }, "POST", customerToken);
  return order;
}

test.beforeAll(async ({ request }) => {
  const admin = await request.post(apiBase + "/auth/login", { data: { username: "admin", password: "Admin12345!" } });
  const customer = await request.post(apiBase + "/auth/login", { data: { username: "demo", password: "Customer12345!" } });
  expect(admin.ok() && customer.ok()).toBeTruthy();
  adminToken = (await admin.json()).token;
  customerToken = (await customer.json()).token;
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
  await page.route("https://picsum.photos/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#745066"/></svg>' }));
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test("管理路由要求登录并保留返回地址，顾客被拦截且不请求商家数据", async ({ page, request }) => {
  let adminCalls = 0;
  page.on("request", request => { if (request.url().includes("/api/admin/")) adminCalls++; });
  await page.goto("/admin/menu");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fmenu$/);
  await page.getByLabel("账号", { exact: true }).fill("demo");
  await page.getByLabel("密码", { exact: true }).fill("Customer12345!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "需要商家管理员账号", exact: true })).toBeVisible();
  expect(adminCalls).toBe(0);
  const forbidden = await request.get(apiBase + "/admin/menu", { headers: { Authorization: `Bearer ${customerToken}` } });
  expect(forbidden.status()).toBe(403);
});

test("管理员从首页进入工作台，菜品接口失败时可重试", async ({ page }) => {
  await login(page, "/");
  await page.getByRole("link", { name: "商家管理", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "商家导航" })).toBeVisible();
  await page.route("**/api/admin/menu?*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "菜品列表暂时不可用" } }) }));
  await page.getByRole("link", { name: "菜品管理", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("菜品列表暂时不可用");
  await page.unroute("**/api/admin/menu?*");
  await page.getByRole("button", { name: "重新尝试", exact: true }).click();
  await expect(page.getByRole("article", { name: "菜品 爱心红烧肉", exact: true })).toBeVisible();
});

test("分类可新增、编辑排序与启停，顾客菜单同步隐藏和恢复", async ({ page, request }) => {
  await login(page, "/admin/categories");
  await page.getByRole("button", { name: "新增分类", exact: true }).click();
  await page.getByLabel("分类名称", { exact: true }).fill("商家新分类");
  await page.getByLabel("排序", { exact: true }).fill("10");
  const created = page.waitForResponse(response => response.url().endsWith("/admin/categories") && response.request().method() === "POST");
  await page.getByRole("button", { name: "保存分类", exact: true }).click();
  const { category } = await (await created).json();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.getByRole("article", { name: "分类 商家新分类", exact: true });
  await row.getByRole("button", { name: "编辑分类", exact: true }).click();
  await page.getByLabel("分类名称", { exact: true }).fill("本周限定");
  await page.getByLabel("排序", { exact: true }).fill("8");
  await page.getByLabel("启用分类", { exact: true }).uncheck();
  await page.getByRole("button", { name: "保存分类", exact: true }).click();
  const updated = page.getByRole("article", { name: "分类 本周限定", exact: true });
  await expect(updated).toContainText("排序 8 · 已停用");
  expect((await call(request, "/categories", undefined, "GET")).categories.some((item: { id: string }) => item.id === category.id)).toBeFalsy();
  await updated.getByRole("button", { name: "编辑分类", exact: true }).click();
  await page.getByLabel("启用分类", { exact: true }).check();
  await page.getByRole("button", { name: "保存分类", exact: true }).click();
  await expect(updated).toContainText("已启用");
  await page.getByRole("link", { name: "返回菜单", exact: true }).click();
  await expect(page.getByRole("button", { name: "本周限定", exact: true })).toBeVisible();
});

test("菜品新增和编辑保留分精度，失败不丢表单，售罄及上下架同步公开菜单", async ({ page, request }) => {
  await login(page, "/admin/menu");
  await expect(page.getByRole("button", { name: "新增菜品", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "新增菜品", exact: true }).click();
  await page.getByLabel("菜品名称", { exact: true }).fill("商家新品小蛋糕");
  await page.getByLabel("菜品分类", { exact: true }).selectOption("snacks");
  await page.getByLabel("价格（元）", { exact: true }).fill("12.345");
  await page.getByRole("button", { name: "保存菜品", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("最多两位小数");
  await page.getByLabel("价格（元）", { exact: true }).fill("12.34");
  await page.getByLabel("菜品描述", { exact: true }).fill("当日手作，甜度适中");
  await page.route("**/api/admin/menu", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "保存服务暂时不可用" } }) }), { times: 1 });
  await page.getByRole("button", { name: "保存菜品", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("保存服务暂时不可用");
  await expect(page.getByLabel("菜品名称", { exact: true })).toHaveValue("商家新品小蛋糕");
  const created = page.waitForResponse(response => response.url().endsWith("/admin/menu") && response.request().method() === "POST");
  await page.getByRole("button", { name: "保存菜品", exact: true }).click();
  const { dish } = await (await created).json();
  expect(dish.priceCents).toBe(1234);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("textbox", { name: "搜索菜品名称", exact: true }).fill("商家新品");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  const row = page.getByRole("article", { name: "菜品 商家新品小蛋糕", exact: true });
  await expect(row).toContainText("¥12.34");
  await row.getByRole("button", { name: "编辑菜品", exact: true }).click();
  await page.getByLabel("价格（元）", { exact: true }).fill("19.90");
  await page.getByRole("button", { name: "保存菜品", exact: true }).click();
  await expect(row).toContainText("¥19.90");
  await row.getByRole("button", { name: "设为售罄", exact: true }).click();
  await expect(row).toContainText("已售罄");
  expect((await call(request, `/menu/${dish.id}`, undefined, "GET")).dish.soldOut).toBeTruthy();
  await row.getByRole("button", { name: "恢复可售", exact: true }).click();
  await expect(row.getByRole("button", { name: "设为售罄", exact: true })).toBeEnabled();
  await row.getByRole("button", { name: "下架菜品", exact: true }).click();
  await expect(row).toContainText("已下架");
  expect((await request.get(apiBase + `/menu/${dish.id}`)).status()).toBe(404);
  await row.getByRole("button", { name: "上架菜品", exact: true }).click();
  await expect(row).toContainText("已上架");
  expect((await call(request, `/menu/${dish.id}`, undefined, "GET")).dish.priceCents).toBe(1990);
});

test("商家按顺序接单、开始配送和完成，顾客可查询最终状态", async ({ page, request }) => {
  const order = await newOrder(request);
  await login(page);
  const row = page.getByRole("article", { name: `商家订单 ${order.orderNumber}`, exact: true });
  await expect(row).toContainText("13900000000");
  await expect(row).toContainText("请少放辣椒");
  await row.getByRole("button", { name: "接单并制作", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByLabel("订单状态", { exact: true }).selectOption("preparing");
  await row.getByRole("button", { name: "开始配送", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByLabel("订单状态", { exact: true }).selectOption("delivering");
  await row.getByRole("button", { name: "确认完成", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByLabel("订单状态", { exact: true }).selectOption("completed");
  await expect(row).toContainText("已完成");
  await expect(row.getByRole("button")).toHaveCount(0);
  expect((await call(request, `/orders/${order.id}`, undefined, "GET", customerToken)).order.status).toBe("completed");
  await page.reload();
  await page.getByLabel("订单状态", { exact: true }).selectOption("completed");
  await expect(row).toContainText("已完成");
});

test("拒单必须填写原因并记录模拟退款，未付款订单不能接单", async ({ page, request }) => {
  const order = await newOrder(request);
  const unpaid = await newOrder(request, false);
  await login(page);
  const row = page.getByRole("article", { name: `商家订单 ${order.orderNumber}`, exact: true });
  await row.getByRole("button", { name: "拒单并模拟退款", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认拒单并退款", exact: true })).toBeDisabled();
  await page.getByLabel("拒单原因", { exact: true }).fill("今日食材已售完");
  await page.getByRole("button", { name: "确认拒单并退款", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("订单状态", { exact: true }).selectOption("cancelled");
  await expect(row).toContainText("今日食材已售完");
  await expect(row).toContainText("已模拟退款");
  const result = (await call(request, `/orders/${order.id}`, undefined, "GET", customerToken)).order;
  expect(result.paymentStatus).toBe("refunded");
  expect(result.payments.filter((payment: { kind: string }) => payment.kind === "refund")).toHaveLength(1);
  await page.getByLabel("订单状态", { exact: true }).selectOption("pending_payment");
  const unpaidRow = page.getByRole("article", { name: `商家订单 ${unpaid.orderNumber}`, exact: true });
  await expect(unpaidRow).toContainText("等待顾客完成模拟付款后可接单");
  await expect(unpaidRow.getByRole("button")).toHaveCount(0);
});

test("状态冲突及响应丢失会重查真实状态，不显示虚假成功", async ({ page, request }) => {
  const order = await newOrder(request);
  await login(page);
  const row = page.getByRole("article", { name: `商家订单 ${order.orderNumber}`, exact: true });
  await expect(row).toBeVisible();
  await call(request, `/admin/orders/${order.id}/status`, { status: "preparing" }, "PATCH");
  await call(request, `/admin/orders/${order.id}/status`, { status: "delivering" }, "PATCH");
  await row.getByRole("button", { name: "接单并制作", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("订单状态不能跳转到该阶段");
  await expect(row).toHaveCount(0);
  await page.getByLabel("订单状态", { exact: true }).selectOption("delivering");
  await expect(row).toContainText("配送中");
  await page.route(`**/api/admin/orders/${order.id}/status`, async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await row.getByRole("button", { name: "确认完成", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("暂时无法连接服务");
  await expect(row).toHaveCount(0);
  await page.getByLabel("订单状态", { exact: true }).selectOption("completed");
  await expect(row).toContainText("已完成");
});

test("分类筛选与菜品分页能读取第二页，管理会话失效后重新登录", async ({ page, request }) => {
  const { category } = await call(request, "/admin/categories", { name: "分页测试分类", isActive: false });
  for (let index = 0; index < 21; index++) await call(request, "/admin/menu", { categoryId: category.id, name: `分页菜品${String(index).padStart(2, "0")}`, priceCents: 1000, sortOrder: index });
  const token = await login(page, "/admin/menu");
  await page.getByRole("combobox", { name: "筛选菜品分类", exact: true }).selectOption(category.id);
  await expect(page.getByRole("article")).toHaveCount(20);
  await expect(page.getByText("分类已停用，顾客不可见", { exact: true })).toHaveCount(20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "菜品 分页菜品20", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(20);
  expect((await request.post(apiBase + "/auth/logout", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(204);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fmenu$/);
});

test("商家手机和桌面布局无横向溢出，表单在窄屏可操作", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, "/admin/menu");
  await expect(page.getByRole("article").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/admin-menu-mobile.png" });
  await page.getByRole("button", { name: "新增菜品", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.getByRole("dialog").evaluate(element => element.getBoundingClientRect().width <= window.innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "订单管理", exact: true }).click();
  await page.getByLabel("订单状态", { exact: true }).selectOption("");
  await expect(page.getByRole("article").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/admin-orders-desktop.png" });
});
