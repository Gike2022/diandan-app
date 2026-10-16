import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const api = "http://127.0.0.1:3002/api";
let admin: string, customer: string;
async function call(request: APIRequestContext, path: string, data?: unknown, method = "POST", token = admin) {
  const response = await request.fetch(api + path, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function login(page: Page, next: string, username = "admin", password = "Admin12345!") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(next + "$"));
}
async function createOrder(request: APIRequestContext, paid = false) {
  const response = await request.post(api + "/orders", { headers: { Authorization: `Bearer ${customer}`, "Idempotency-Key": `regression-${crypto.randomUUID()}` }, data: { items: [{ dishId: "h1", quantity: 1 }], name: "流程检查", phone: "13800000000", address: "测试库检查地址", notes: "", payMethod: "wechat" } });
  expect(response.status()).toBe(201);
  const { order } = await response.json();
  if (paid) await call(request, `/orders/${order.id}/demo-payment`, { outcome: "success" }, "POST", customer);
  return order;
}
test.beforeAll(async ({ request }) => {
  admin = (await (await request.post(api + "/auth/login", { data: { username: "admin", password: "Admin12345!" } })).json()).token;
  customer = (await (await request.post(api + "/auth/login", { data: { username: "demo", password: "Customer12345!" } })).json()).token;
});
test.beforeEach(async ({ context }) => {
  await context.route("https://fonts.googleapis.com/**", route => route.abort());
  await context.route("https://fonts.gstatic.com/**", route => route.abort());
  await context.route("https://picsum.photos/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"/>' }));
});

test("新增菜品响应丢失后刷新并重试，仍只有一条记录", async ({ page, request }) => {
  await login(page, "/admin/menu");
  await expect(page.getByRole("button", { name: "新增菜品", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "新增菜品", exact: true }).click();
  await page.getByLabel("菜品名称", { exact: true }).fill("回归响应丢失菜品");
  await page.getByLabel("价格（元）", { exact: true }).fill("10.00");
  let firstKey = "";
  await page.route("**/api/admin/menu", async route => { firstKey = route.request().headers()["idempotency-key"]; await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await page.getByRole("button", { name: "保存菜品", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("暂时无法连接服务");
  await page.reload();
  await page.getByRole("button", { name: "新增菜品", exact: true }).click();
  await expect(page.getByLabel("菜品名称", { exact: true })).toHaveValue("回归响应丢失菜品");
  const retry = page.waitForResponse(response => response.url().endsWith("/admin/menu") && response.request().method() === "POST");
  await page.getByRole("button", { name: "保存菜品", exact: true }).click();
  const response = await retry;
  expect(firstKey).toBeTruthy();
  expect(response.request().headers()["idempotency-key"]).toBe(firstKey);
  expect(response.status()).toBe(200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await call(request, "/admin/menu?search=" + encodeURIComponent("回归响应丢失菜品"), undefined, "GET")).total).toBe(1);
});

test("旧编辑表单提示版本冲突，重新编辑保留另一端的新价格和售罄", async ({ page, request }) => {
  await login(page, "/admin/menu");
  const row = page.getByRole("article", { name: "菜品 爱心红烧肉", exact: true });
  try {
    await row.getByRole("button", { name: "编辑菜品", exact: true }).click();
    await call(request, "/admin/menu/h1", { priceCents: 7200, soldOut: true }, "PATCH");
    await page.getByLabel("菜品描述", { exact: true }).fill("只修改描述");
    await page.getByRole("button", { name: "保存菜品", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("已被其他页面修改");
    await expect(page.getByLabel("菜品描述", { exact: true })).toHaveValue("只修改描述");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(row).toContainText("¥72.00");
    await row.getByRole("button", { name: "编辑菜品", exact: true }).click();
    await expect(page.getByLabel("价格（元）", { exact: true })).toHaveValue("72.00");
    await page.getByLabel("菜品描述", { exact: true }).fill("重新编辑描述");
    await page.getByRole("button", { name: "保存菜品", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const result = (await call(request, "/menu/h1", undefined, "GET")).dish;
    expect(result.priceCents).toBe(7200);
    expect(result.soldOut).toBe(true);
    expect(result.description).toBe("重新编辑描述");
  } finally { await call(request, "/admin/menu/h1", { priceCents: 6800, soldOut: false }, "PATCH"); }
});

test("两个标签页共享购物车，一个下单后另一个同步清空且不能重复提交", async ({ page, context, request }) => {
  const before = (await call(request, "/orders", undefined, "GET", customer)).total;
  await login(page, "/", "demo", "Customer12345!");
  await page.getByRole("button", { name: "添加爱心红烧肉", exact: true }).click();
  await page.getByRole("link", { name: /去结算/ }).click();
  await page.getByRole("link", { name: "去结算", exact: true }).click();
  const second = await context.newPage();
  await second.goto("/checkout");
  for (const target of [page, second]) {
    await target.getByLabel("联系人姓名", { exact: true }).fill("双标签检查");
    await target.getByLabel("手机号码", { exact: true }).fill("13800000000");
    await target.getByLabel("详细地址", { exact: true }).fill("测试地址");
  }
  const response = page.waitForResponse(response => response.url().endsWith("/api/orders") && response.request().method() === "POST");
  await page.getByRole("button", { name: "确认下单，前往模拟付款", exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(second).toHaveURL(/\/cart$/);
  await expect(second.getByRole("heading", { name: "购物车是空的", exact: true })).toBeVisible();
  expect((await call(request, "/orders", undefined, "GET", customer)).total).toBe(before + 1);

  // Both tabs submit before either response arrives; an extra item added in flight must remain.
  await second.goto("/");
  await second.getByRole("button", { name: "添加爱心红烧肉", exact: true }).click();
  await second.getByRole("link", { name: /去结算/ }).click();
  await second.getByRole("link", { name: "去结算", exact: true }).click();
  await page.goto("/checkout");
  for (const target of [page, second]) {
    await target.getByLabel("联系人姓名", { exact: true }).fill("并发结算检查");
    await target.getByLabel("手机号码", { exact: true }).fill("13800000000");
    await target.getByLabel("详细地址", { exact: true }).fill("测试地址");
  }
  const keys: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  await context.route("**/api/orders", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    await barrier;
    await route.continue();
  });
  const firstResponse = page.waitForResponse(response => response.url().endsWith("/api/orders") && response.request().method() === "POST");
  const secondResponse = second.waitForResponse(response => response.url().endsWith("/api/orders") && response.request().method() === "POST");
  try {
    await Promise.all([page, second].map(target => target.getByRole("button", { name: "确认下单，前往模拟付款", exact: true }).click()));
    await expect.poll(() => keys.length).toBe(2);
    expect(keys[0]).toBe(keys[1]);
    const extra = await context.newPage();
    await extra.goto("/");
    await extra.getByRole("button", { name: "增加爱心红烧肉", exact: true }).click();
    await expect(extra.getByRole("link", { name: /去结算/ })).toContainText("136.00");
  } finally { release(); }
  const responses = await Promise.all([firstResponse, secondResponse]);
  expect(responses.map(response => response.status()).sort()).toEqual([200, 201]);
  const orders = await Promise.all(responses.map(async response => (await response.json()).order));
  expect(orders[0].id).toBe(orders[1].id);
  for (const target of [page, second]) await expect(target).toHaveURL(new RegExp(`/orders/${orders[0].id}$`));
  await page.goto("/cart");
  await expect(page.getByText("已选菜品 (1)", { exact: true })).toBeVisible();
  expect((await call(request, "/orders", undefined, "GET", customer)).total).toBe(before + 2);
});

test("第二页最后一笔接单后自动返回第一页，仍显示剩余20笔", async ({ page, request }) => {
  let existing = await call(request, "/admin/orders?status=pending_acceptance&pageSize=100", undefined, "GET");
  while (existing.items.length) {
    for (const order of existing.items) await call(request, `/admin/orders/${order.id}/status`, { status: "preparing" }, "PATCH");
    existing = await call(request, "/admin/orders?status=pending_acceptance&pageSize=100", undefined, "GET");
  }
  for (let index = 0; index < 21; index++) await createOrder(request, true);
  await login(page, "/admin");
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "接单并制作", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(20);
  await expect(page.getByText("第 1 / 1 页 · 共 20 条", { exact: true })).toBeVisible();
});

test("订单付款后的更新时间与创建时间一致采用UTC", async ({ request }) => {
  const order = await createOrder(request);
  const paid = (await call(request, `/orders/${order.id}/demo-payment`, { outcome: "success" }, "POST", customer)).order;
  expect(Math.abs(new Date(paid.updatedAt).getTime() - Date.now())).toBeLessThan(5000);
  expect(new Date(paid.updatedAt).getTime() - new Date(paid.createdAt).getTime()).toBeLessThan(5000);
});
