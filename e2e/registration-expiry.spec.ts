import { test, expect, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createPool, connectionOptions, rows } from "../server/src/db";

const api = "http://127.0.0.1:3002/api";
const serverRequire = createRequire(new URL("../server/package.json", import.meta.url));
const env = serverRequire("dotenv").parse(readFileSync(new URL("../server/.env", import.meta.url)));
const testUrl = process.env.TEST_DATABASE_URL ?? env.TEST_DATABASE_URL;
const appUrl = process.env.DATABASE_URL ?? env.DATABASE_URL;
if (!testUrl || !appUrl || !/_test(?:_[a-f0-9]+)?$/.test(connectionOptions(testUrl).database) || connectionOptions(testUrl).database === connectionOptions(appUrl).database) throw new Error("订单时间加速测试仅允许独立测试库");
const pool = createPool(testUrl);
let customerToken: string;
const runtimeErrors: string[] = [];
async function newOrder(request: APIRequestContext) {
  const response = await request.post(api + "/orders", { headers: { Authorization: `Bearer ${customerToken}`, "Idempotency-Key": `expiry-${crypto.randomUUID()}` }, data: { items: [{ dishId: "h1", quantity: 1 }], name: "超时演示顾客", phone: "13800000000", address: "独立测试库演示地址", payMethod: "wechat" } });
  expect(response.status()).toBe(201);
  return (await response.json()).order;
}
test.beforeAll(async ({ request }) => {
  const response = await request.post(api + "/auth/login", { data: { username: "demo", password: "Customer12345!" } });
  expect(response.ok()).toBeTruthy();
  customerToken = (await response.json()).token;
});
test.afterAll(async () => { await pool.end(); });
test.beforeEach(async ({ page }) => {
  runtimeErrors.length = 0;
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
  await page.route("https://picsum.photos/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#745066"/></svg>' }));
});
test.afterEach(() => { expect(runtimeErrors).toEqual([]); });

test("注册校验和重名保留输入，成功自动登录回结算并完成首单", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "添加爱心红烧肉", exact: true }).click();
  await page.getByRole("link", { name: /去结算/ }).click();
  await page.getByRole("link", { name: "去结算", exact: true }).click();
  await page.getByRole("link", { name: "注册账号", exact: true }).click();
  await expect(page).toHaveURL(/\/register\?next=%2Fcheckout$/);
  await page.getByLabel("账号", { exact: true }).fill("demo");
  await page.getByLabel("昵称", { exact: true }).fill("新来的小厨顾客");
  const phone = page.getByLabel("联系电话（选填）", { exact: true });
  await phone.fill("wrong");
  expect(await phone.evaluate((element: HTMLInputElement) => element.checkValidity())).toBeFalsy();
  await phone.fill("13800000000");
  expect(await phone.evaluate((element: HTMLInputElement) => element.checkValidity())).toBeTruthy();
  await page.getByLabel("密码", { exact: true }).fill("Student12345!");
  await page.getByLabel("确认密码", { exact: true }).fill("Different12345!");
  await page.getByRole("button", { name: "注册并登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("两次输入的密码不一致");
  await expect(page.getByRole("alert")).toBeFocused();
  await page.getByLabel("确认密码", { exact: true }).fill("Student12345!");
  await page.getByRole("button", { name: "注册并登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("该账号已被注册");
  await expect(page.getByLabel("昵称", { exact: true })).toHaveValue("新来的小厨顾客");
  await page.getByLabel("账号", { exact: true }).fill("new_customer_ui");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/register-mobile.png", fullPage: true });
  const registered = page.waitForResponse(response => response.url().endsWith("/auth/register") && response.request().method() === "POST");
  await page.getByRole("button", { name: "注册并登录", exact: true }).click();
  const response = await registered;
  expect(response.status()).toBe(201);
  expect((await response.json()).user.role).toBe("customer");
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByLabel("联系人姓名", { exact: true })).toHaveValue("新来的小厨顾客");
  await expect(page.getByLabel("手机号码", { exact: true })).toHaveValue("13800000000");
  await page.getByLabel("详细地址", { exact: true }).fill("注册后的首单地址");
  await page.getByRole("button", { name: "确认下单，前往模拟付款", exact: true }).click();
  await expect(page.getByRole("heading", { name: "待付款", exact: true })).toBeVisible();
  await expect(page.getByTestId("payment-countdown")).toContainText("付款剩余");
  await page.getByRole("button", { name: "模拟付款成功", exact: true }).click();
  await expect(page.getByRole("heading", { name: "待接单", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "待接单", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看历史订单", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("详情显示15分钟倒计时，截止后自动关闭，历史保留取消原因", async ({ page, request }) => {
  const order = await newOrder(request);
  expect(Date.parse(order.paymentExpiresAt) - Date.parse(order.createdAt)).toBe(900000);
  await page.goto(`/login?next=${encodeURIComponent(`/orders/${order.id}`)}`);
  await page.getByLabel("账号", { exact: true }).fill("demo");
  await page.getByLabel("密码", { exact: true }).fill("Customer12345!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByTestId("payment-countdown")).toHaveText(/付款剩余 1[45]:[0-5]\d/);
  await pool.execute('UPDATE orders SET payment_expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 SECOND) WHERE id = ?', [order.id]);
  await page.reload();
  await expect(page.getByTestId("payment-countdown")).toHaveText(/付款剩余 00:0[1-4]/);
  await expect(page.getByRole("heading", { name: "已取消", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "模拟付款成功", exact: true })).toHaveCount(0);
  await expect(page.getByText("订单因超时未付款已自动取消，可以重新点餐", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/order-expired-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "查看历史订单", exact: true }).click();
  const row = page.getByRole("article", { name: `订单 ${order.orderNumber}`, exact: true });
  await expect(row).toContainText("付款超时自动取消");
  await expect(row.getByRole("link", { name: "继续付款", exact: true })).toHaveCount(0);
});

test("不打开订单页面也会后台自动取消，已付款订单不受影响且不能再付款", async ({ request }) => {
  const unpaid = await newOrder(request);
  const paid = await newOrder(request);
  expect((await request.post(api + `/orders/${paid.id}/demo-payment`, { headers: { Authorization: `Bearer ${customerToken}` }, data: { outcome: "success" } })).status()).toBe(200);
  await pool.execute('UPDATE orders SET payment_expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id IN (?, ?)', [unpaid.id, paid.id]);
  // Poll MySQL, not an order endpoint: this proves the background task works without page requests.
  await expect.poll(async () => (await rows(pool, 'SELECT status FROM orders WHERE id = ?', [unpaid.id]))[0].status).toBe("cancelled");
  expect((await rows(pool, 'SELECT status FROM orders WHERE id = ?', [paid.id]))[0].status).toBe("pending_acceptance");
  const attempted = await request.post(api + `/orders/${unpaid.id}/demo-payment`, { headers: { Authorization: `Bearer ${customerToken}` }, data: { outcome: "success" } });
  expect(attempted.status()).toBe(409);
  expect((await attempted.json()).error.code).toBe("PAYMENT_EXPIRED");
  expect((await rows(pool, 'SELECT id FROM payments WHERE order_id = ?', [unpaid.id])).length).toBe(0);
});
