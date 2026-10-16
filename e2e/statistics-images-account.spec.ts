import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";

const sharp = createRequire(new URL("../server/package.json", import.meta.url))("sharp");
const base = "http://127.0.0.1:3002/api";
let admin: string;
let customer: string;
let png: Buffer;
const errors = new WeakMap<Page, string[]>();
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const currency = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
async function api(request: APIRequestContext, path: string, data?: unknown, method = "POST", token = admin) {
  const response = await request.fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() }, ...(data === undefined ? {} : { data }) });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function account(request: APIRequestContext) {
  const username = `ui_${crypto.randomUUID().replaceAll("-", "").slice(0, 15)}`;
  const response = await request.post(base + "/auth/register", { data: { username, displayName: "账户维护顾客", password: "Before123!" } });
  expect(response.status()).toBe(201); return { ...(await response.json()), username };
}
async function login(page: Page, next = "/admin/statistics", username = "admin", password = "Admin12345!") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  const loggedIn = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const result = await loggedIn; expect(result.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(next === "/" ? "/$" : next + "$"));
  return (await result.json()).token as string;
}
async function order(request: APIRequestContext, state: "completed" | "waiting" | "unpaid" | "refunded") {
  const { order } = await api(request, "/orders", { items: [{ dishId: "h1", quantity: 2 }], name: "统计演示顾客", phone: "13800000000", address: "课程演示地址", payMethod: "wechat" }, "POST", customer);
  if (state !== "unpaid") await api(request, `/orders/${order.id}/demo-payment`, { outcome: "success" }, "POST", customer);
  if (state === "completed") for (const status of ["preparing", "delivering", "completed"]) await api(request, `/admin/orders/${order.id}/status`, { status }, "PATCH");
  if (state === "refunded") await api(request, `/admin/orders/${order.id}/status`, { status: "cancelled", reason: "统计演示拒单" }, "PATCH");
  return order;
}

test.beforeAll(async ({ request }) => {
  const a = await request.post(base + "/auth/login", { data: { username: "admin", password: "Admin12345!" } });
  const c = await request.post(base + "/auth/login", { data: { username: "demo", password: "Customer12345!" } });
  expect(a.ok() && c.ok()).toBeTruthy(); admin = (await a.json()).token; customer = (await c.json()).token;
  png = await sharp({ create: { width: 480, height: 320, channels: 3, background: "#bc5898" } }).png().toBuffer();
});
test.beforeEach(async ({ page }) => {
  const messages: string[] = []; errors.set(page, messages); page.on("pageerror", error => messages.push(error.message));
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
  await page.route("https://picsum.photos/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#745066"/></svg>' }));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test("个人资料和统计路由保留登录返回地址，顾客无法请求营业数据", async ({ page, request }) => {
  await page.goto("/profile"); await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  let requests = 0; page.on("request", req => { if (req.url().includes("/api/admin/")) requests++; });
  await login(page, "/admin/statistics", "demo", "Customer12345!");
  await expect(page.getByRole("heading", { name: "需要商家管理员账号", exact: true })).toBeVisible();
  expect(requests).toBe(0);
  expect((await request.get(base + "/admin/statistics", { headers: { Authorization: `Bearer ${customer}` } })).status()).toBe(403);
});

test("营业统计与真实交易一致，已完成计营业额，未完成及退款不计，明细可展开", async ({ page, request }) => {
  const path = `/admin/statistics?dateFrom=${today()}&dateTo=${today()}`;
  const before = await api(request, path, undefined, "GET");
  const completed = await order(request, "completed");
  await order(request, "waiting"); await order(request, "unpaid"); const refunded = await order(request, "refunded");
  await login(page); await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.getByRole("region", { name: "营业额", exact: true })).toContainText(currency(before.summary.revenueCents + completed.totalCents));
  await expect(page.getByRole("region", { name: "已完成订单", exact: true })).toContainText(`${before.summary.completedOrders + 1} 笔`);
  await expect(page.getByRole("region", { name: "订单总数", exact: true })).toContainText(`${before.summary.totalOrders + 4} 笔`);
  await expect(page.getByText(`已模拟退款金额`, { exact: false })).toContainText(currency(before.summary.refundedCents + refunded.totalCents));
  await expect(page.getByRole("img", { name: /每日营业额，精确金额/ })).toBeVisible();
  await page.getByText("查看每日明细", { exact: true }).click();
  await expect(page.getByRole("table", { name: "每日订单与营业额", exact: true })).toContainText(today());
  await expect(page.getByRole("table", { name: "每日订单与营业额", exact: true })).toContainText(currency(before.summary.revenueCents + completed.totalCents));
  const extra = await order(request, "completed");
  await page.getByRole("button", { name: "查询统计", exact: true }).click();
  await expect(page.getByRole("region", { name: "营业额", exact: true })).toContainText(currency(before.summary.revenueCents + completed.totalCents + extra.totalCents));
  await page.getByRole("button", { name: "近 7 天", exact: true }).click();
  await expect(page.getByRole("table", { name: "每日订单与营业额", exact: true }).getByRole("row")).toHaveCount(8);
});

test("统计接口失败可重试，空范围显示零值，日期范围错误保留筛选", async ({ page }) => {
  await page.route("**/api/admin/statistics?*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "统计暂不可用" } }) }));
  await login(page); await expect(page.getByRole("alert")).toContainText("统计暂不可用");
  await page.unroute("**/api/admin/statistics?*"); await page.getByRole("button", { name: "重新尝试", exact: true }).click();
  await expect(page.getByRole("region", { name: "营业额", exact: true })).toBeVisible();
  await page.getByLabel("统计开始日期", { exact: true }).fill("2040-01-01");
  await page.getByLabel("统计结束日期", { exact: true }).fill("2040-01-03");
  await page.getByRole("button", { name: "查询统计", exact: true }).click();
  await expect(page.getByRole("region", { name: "营业额", exact: true })).toContainText("¥0.00");
  await expect(page.getByText("所选日期暂无已完成订单", { exact: true })).toBeVisible();
  await page.getByLabel("统计开始日期", { exact: true }).fill("2040-01-04");
  await page.getByRole("button", { name: "查询统计", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("结束日期不能早于开始日期");
  await page.getByLabel("统计开始日期", { exact: true }).fill("2040-01-01");
  await page.getByLabel("统计结束日期", { exact: true }).fill("2040-06-01");
  await page.getByRole("button", { name: "查询统计", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("统计范围最多为 92 天");
  await page.getByRole("button", { name: "近 30 天", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("个人资料失败保留输入，保存后刷新回显且结算带入最新昵称电话", async ({ page, request }) => {
  const user = await account(request); await login(page, "/profile", user.username, "Before123!");
  await expect(page.getByText(user.username, { exact: true })).toBeVisible();
  await expect(page.getByText("普通用户", { exact: true })).toBeVisible();
  await page.getByLabel("昵称", { exact: true }).fill("资料更新顾客");
  await page.getByLabel("联系电话（选填）", { exact: true }).fill("bad");
  await page.getByRole("button", { name: "保存资料", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请输入有效联系电话");
  await expect(page.getByLabel("昵称", { exact: true })).toHaveValue("资料更新顾客");
  await page.getByLabel("联系电话（选填）", { exact: true }).fill("13912345678");
  await page.getByRole("button", { name: "保存资料", exact: true }).click();
  await expect(page.getByText("个人资料已保存", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("昵称", { exact: true })).toHaveValue("资料更新顾客");
  await expect(page.getByLabel("联系电话（选填）", { exact: true })).toHaveValue("13912345678");
  await page.getByRole("link", { name: "返回菜单", exact: true }).click();
  await expect(page.getByRole("link", { name: "个人资料", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "添加爱心红烧肉", exact: true }).click();
  await page.getByRole("link", { name: /去结算/ }).click(); await page.getByRole("link", { name: "去结算", exact: true }).click();
  await expect(page.getByLabel("联系人姓名", { exact: true })).toHaveValue("资料更新顾客");
  await expect(page.getByLabel("手机号码", { exact: true })).toHaveValue("13912345678");
  await page.getByRole("link", { name: "个人资料", exact: true }).click();
  await page.getByLabel("联系电话（选填）", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存资料", exact: true }).click();
  await expect(page.getByText("个人资料已保存", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("联系电话（选填）", { exact: true })).toHaveValue("");
});

test("修改密码校验原密码和两次输入，成功保持登录，旧会话失效且新密码可重新登录", async ({ page, request }) => {
  const user = await account(request); const oldToken = await login(page, "/profile", user.username, "Before123!");
  const other = await api(request, "/auth/login", { username: user.username, password: "Before123!" });
  await page.getByLabel("原密码", { exact: true }).fill("Before123!");
  await page.getByLabel("新密码", { exact: true }).fill("After123!");
  await page.getByLabel("确认新密码", { exact: true }).fill("Mismatch123!");
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("两次输入的新密码不一致");
  await page.getByLabel("确认新密码", { exact: true }).fill("After123!");
  await page.getByLabel("原密码", { exact: true }).fill("Wrong123!");
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("原密码不正确");
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel("原密码", { exact: true }).fill("Before123!");
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  await expect(page.getByText("密码已修改，旧登录会话已失效", { exact: true })).toBeVisible();
  for (const label of ["原密码", "新密码", "确认新密码"]) await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  for (const token of [oldToken, other.token]) expect((await request.get(base + "/auth/me", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
  await page.reload(); await expect(page.getByRole("heading", { name: "个人中心", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.goto("/login?next=%2Fprofile"); await page.getByLabel("账号", { exact: true }).fill(user.username);
  await page.getByLabel("密码", { exact: true }).fill("Before123!"); await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("账号或密码不正确");
  await page.getByLabel("密码", { exact: true }).fill("After123!"); await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
});

test("菜品图片上传失败保留原图和表单，重试预览保存，顾客可加载真实上传图片", async ({ page, request }) => {
  const { category } = await api(request, "/admin/categories", { name: "上传图片测试分类" });
  await page.setViewportSize({ width: 375, height: 812 }); await login(page, "/admin/menu");
  await page.getByRole("button", { name: "新增菜品", exact: true }).click();
  await page.getByLabel("菜品名称", { exact: true }).fill("上传图片示例菜");
  await page.getByLabel("菜品分类", { exact: true }).selectOption(category.id);
  await page.getByLabel("价格（元）", { exact: true }).fill("42.50");
  const field = page.getByLabel("图片地址（选填）", { exact: true });
  const oldImage = "https://picsum.photos/seed/old-upload/400/300"; await field.fill(oldImage);
  const input = page.getByLabel("上传菜品图片", { exact: true });
  await input.setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByRole("alert")).toHaveText("请选择 JPG、PNG 或 WebP 图片");
  await input.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert")).toHaveText("图片不能超过 5 MB");
  await page.route("**/api/admin/uploads/images", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "上传暂不可用" } }) }));
  await input.setInputFiles({ name: "dish.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("alert")).toHaveText("上传暂不可用");
  await expect(field).toHaveValue(oldImage); await expect(page.getByLabel("菜品名称", { exact: true })).toHaveValue("上传图片示例菜");
  await page.unroute("**/api/admin/uploads/images");
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/uploads/images", async route => { await gate; await route.continue(); });
  await input.setInputFiles({ name: "dish.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: "图片上传中…", exact: true })).toBeDisabled(); release();
  await expect(page.getByText("图片已上传，保存菜品后生效", { exact: true })).toBeVisible();
  const url = await field.inputValue(); expect(url).toMatch(/^\/api\/uploads\/menu\/[a-f0-9]{64}\.webp$/);
  await expect.poll(() => page.getByRole("img", { name: "菜品图片预览", exact: true }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/dish-upload-mobile.png" });
  const created = page.waitForResponse(response => response.url().endsWith("/admin/menu") && response.request().method() === "POST");
  await page.getByRole("button", { name: "保存菜品", exact: true }).click(); expect((await created).status()).toBe(201);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("combobox", { name: "筛选菜品分类", exact: true }).selectOption(category.id);
  await expect(page.getByRole("article", { name: "菜品 上传图片示例菜", exact: true }).getByRole("img")).toHaveAttribute("src", url);
  await page.goto("/"); await page.getByRole("button", { name: category.name, exact: true }).click();
  const publicImage = page.getByRole("img", { name: "上传图片示例菜", exact: true });
  await expect(publicImage).toHaveAttribute("src", url);
  await expect.poll(() => publicImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.reload(); await page.getByRole("button", { name: category.name, exact: true }).click(); await expect(publicImage).toHaveAttribute("src", url);
});

test("统计及个人中心保持主题，手机桌面无横向溢出，商家可进入个人资料", async ({ page }) => {
  await login(page); await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height, name] of [[375, 812, "mobile"], [1280, 1100, "desktop"]] as const) {
    await page.setViewportSize({ width, height }); await expect(page.getByRole("region", { name: "营业额", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `test-results/statistics-${name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 }); await page.getByRole("link", { name: "个人资料", exact: true }).click();
  await expect(page.getByText("商家管理员", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/profile-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "返回商家工作台", exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
});
