import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const apiBase = "http://127.0.0.1:3002/api";
let adminToken: string;
const runtimeErrors = new WeakMap<Page, string[]>();

async function adminRequest(request: APIRequestContext, path: string, data: unknown, method = "PATCH") {
  const response = await request.fetch(apiBase + path, { method, headers: { Authorization: `Bearer ${adminToken}` }, data });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function login(page: Page, next = "/", username = "demo", password = "Customer12345!") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  const result = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  expect((await result).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(next === "/" ? "/$" : next.replaceAll("/", "\\/") + "$"));
  return (await (await result).json()).token as string;
}

async function prepareCheckout(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "添加爱心红烧肉", exact: true }).click();
  await page.getByRole("link", { name: /去结算/ }).click();
  await page.getByRole("link", { name: "去结算", exact: true }).click();
  await expect(page.getByRole("heading", { name: "确认订单", exact: true })).toBeVisible();
  await page.getByLabel("联系人姓名", { exact: true }).fill("浏览器演示顾客");
  await page.getByLabel("手机号码", { exact: true }).fill("13800000000");
  await page.getByLabel("详细地址", { exact: true }).fill("浏览器自动化演示地址");
  await page.getByLabel("备注（选填）", { exact: true }).fill("少辣");
}

async function createOrder(page: Page) {
  const response = page.waitForResponse(result => result.url().endsWith("/api/orders") && result.request().method() === "POST");
  await page.getByRole("button", { name: "确认下单，前往模拟付款", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(201);
  const { order } = await result.json();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.getByRole("heading", { name: "待付款", exact: true })).toBeVisible();
  return order;
}

test.beforeAll(async ({ request }) => {
  const response = await request.post(apiBase + "/auth/login", { data: { username: "admin", password: "Admin12345!" } });
  expect(response.ok()).toBeTruthy();
  adminToken = (await response.json()).token;
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  // External image/font availability must not affect business-flow tests.
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
  await page.route("https://picsum.photos/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#745066"/></svg>' }));
});

test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test("匿名访问真实菜单，后台新增分类与菜品会出现在首页", async ({ page, request }) => {
  const category = await adminRequest(request, "/admin/categories", { name: "今日推荐", sortOrder: 0 }, "POST");
  await adminRequest(request, "/admin/menu", { categoryId: category.category.id, name: "今日限定甜点", priceCents: 1980, imageUrl: "https://picsum.photos/seed/test/400/300" }, "POST");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "爱心红烧肉", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "今日推荐", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今日限定甜点", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "登录", exact: true })).toBeVisible();
  await expect(page.getByText("已售罄", { exact: true })).toHaveCount(1);
});

test("登录错误可重试，匿名结算登录后返回并保留购物车", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加爱心红烧肉", exact: true }).click();
  await page.getByRole("link", { name: /去结算/ }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "爱心红烧肉", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "去结算", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await page.getByLabel("账号", { exact: true }).fill("demo");
  await page.getByLabel("密码", { exact: true }).fill("Incorrect123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("账号或密码不正确");
  await page.getByLabel("密码", { exact: true }).fill("Customer12345!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("爱心红烧肉", { exact: true })).toBeVisible();
  await expect(page.getByLabel("手机号码", { exact: true })).toBeVisible();
});

test("真实下单、模拟失败重试、成功刷新和历史查询形成完整流程", async ({ page }) => {
  await login(page);
  await prepareCheckout(page);
  const order = await createOrder(page);
  expect(order.phone).toBe("13800000000");
  expect(order.totalCents).toBe(6850);
  await expect(page.getByRole("img", { name: /收款码/ })).toHaveCount(0);
  await page.getByRole("button", { name: "模拟付款失败", exact: true }).click();
  await expect(page.getByText("上次模拟付款失败，订单仍待付款，可以继续重试。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "模拟付款成功", exact: true }).click();
  await expect(page.getByRole("heading", { name: "待接单", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "模拟付款成功", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "待接单", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "收货信息" })).toContainText("13800000000");
  await page.getByRole("link", { name: "查看历史订单", exact: true }).click();
  const row = page.getByRole("article", { name: `订单 ${order.orderNumber}`, exact: true });
  await expect(row).toContainText("待接单");
  await expect(row).toContainText("¥68.50");
});

test("下单成功但响应丢失，刷新重试复用原订单与幂等键", async ({ page }) => {
  await login(page);
  await prepareCheckout(page);
  let createdId = "";
  let firstKey = "";
  await page.route("**/api/orders", async route => {
    if (route.request().method() !== "POST") return route.continue();
    firstKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch();
    createdId = (await response.json()).order.id;
    await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "确认下单，前往模拟付款", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("暂时无法连接服务");
  expect(createdId).not.toBe("");
  await page.reload();
  await expect(page.getByRole("button", { name: "重试确认订单", exact: true })).toBeVisible();
  const retried = page.waitForResponse(response => response.url().endsWith("/api/orders") && response.request().method() === "POST");
  await page.getByRole("button", { name: "重试确认订单", exact: true }).click();
  const response = await retried;
  expect(response.status()).toBe(200);
  expect(response.request().headers()["idempotency-key"]).toBe(firstKey);
  expect((await response.json()).order.id).toBe(createdId);
  await expect(page).toHaveURL(new RegExp(`/orders/${createdId}$`));
});

test("历史订单可继续付款、取消；商家更新状态会自动同步", async ({ page, request }) => {
  await login(page);
  await prepareCheckout(page);
  await page.getByRole("button", { name: "支付宝", exact: true }).click();
  const order = await createOrder(page);
  expect(order.payMethod).toBe("alipay");
  await page.getByRole("link", { name: "查看历史订单", exact: true }).click();
  await page.getByRole("article", { name: `订单 ${order.orderNumber}`, exact: true }).getByRole("link", { name: "继续付款", exact: true }).click();
  await page.getByRole("button", { name: "模拟付款成功", exact: true }).click();
  await expect(page.getByRole("heading", { name: "待接单", exact: true })).toBeVisible();
  await adminRequest(request, `/admin/orders/${order.id}/status`, { status: "preparing" });
  await expect(page.getByRole("heading", { name: "制作中", exact: true })).toBeVisible();
  await prepareCheckout(page);
  await createOrder(page);
  await page.getByRole("button", { name: "取消订单", exact: true }).click();
  await page.getByRole("button", { name: "确认取消", exact: true }).click();
  await expect(page.getByRole("heading", { name: "已取消", exact: true })).toBeVisible();
});

test("再来一单使用当前菜单的价格与菜品 ID，不产生重复商品", async ({ page, request }) => {
  await login(page);
  await prepareCheckout(page);
  const order = await createOrder(page);
  try {
    await adminRequest(request, "/admin/menu/h1", { priceCents: 7200 });
    await page.getByRole("link", { name: "查看历史订单", exact: true }).click();
    await page.getByRole("article", { name: `订单 ${order.orderNumber}`, exact: true }).getByRole("button", { name: "再来一单", exact: true }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "爱心红烧肉", exact: true })).toHaveCount(1);
    await expect(page.getByText("¥72", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "返回菜单", exact: true }).click();
    await expect(page.getByRole("button", { name: "增加爱心红烧肉", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "增加爱心红烧肉", exact: true }).click();
    await page.getByRole("link", { name: /去结算/ }).click();
    await expect(page.getByRole("heading", { name: "爱心红烧肉", exact: true })).toHaveCount(1);
    await expect(page.getByText("已选菜品 (2)", { exact: true })).toBeVisible();
    await expect(page.getByText("¥72", { exact: true })).toBeVisible();
  } finally { await adminRequest(request, "/admin/menu/h1", { priceCents: 6800 }); }
});

test("退出和切换账号不会显示上个顾客的历史订单", async ({ page, request }) => {
  await login(page, "/orders");
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("link", { name: "历史订单", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
  const username = "student_ui";
  const registration = await request.post(apiBase + "/auth/register", { data: { username, password: "Student123!", displayName: "新顾客" } });
  expect(registration.status()).toBe(201);
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill("Student123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "还没有甜蜜回忆", exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("会话被服务端吊销后要求重新登录", async ({ page, request }) => {
  const token = await login(page);
  expect((await request.post(apiBase + "/auth/logout", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(204);
  await page.getByRole("link", { name: "历史订单", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
  await expect(page.getByLabel("账号", { exact: true })).toBeVisible();
});

test("菜单请求失败和空菜单有反馈，重试会重新读取接口", async ({ page }) => {
  await page.route("**/api/menu?*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "菜单暂时不可用" } }) }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("菜单暂时不可用");
  await page.unroute("**/api/menu?*");
  await page.getByRole("button", { name: "重新尝试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "爱心红烧肉", exact: true })).toBeVisible();
  await page.route("**/api/menu?*", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 100 }) }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "菜单正在准备中", exact: true })).toBeVisible();
  await page.unroute("**/api/menu?*");
  await page.getByRole("button", { name: "刷新菜单", exact: true }).click();
  await expect(page.getByRole("heading", { name: "爱心红烧肉", exact: true })).toBeVisible();
});

test("窄屏与横屏保留主题和布局，页面无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await expect(page.getByRole("heading", { name: "爱心红烧肉", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect.poll(() => page.getByRole("button", { name: "小食甜点", exact: true }).evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
  await page.screenshot({ path: "test-results/menu-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.goto("/orders");
  await expect(page.getByRole("article").first()).toBeVisible();
  await expect.poll(() => page.getByRole("article").first().evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
  await page.screenshot({ path: "test-results/orders-landscape.png" });
});
