import { createHash, randomUUID } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { isDatabaseError, rows, transaction, type Database, type SqlValue } from './db.js';
import { ApiError } from './errors.js';
import { pagination, resourceId } from './validation.js';
import { uploadedImageUrl } from './images.js';

const categoryFields = {
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
};
export const categoryInput = z.object(categoryFields).strict();
const expectedVersion = z.number().int().min(1).optional();
export const categoryPatch = categoryInput.partial().extend({ expectedVersion }).refine(value => Object.keys(value).some(key => key !== 'expectedVersion'), '至少提供一个修改字段');
export const dishInput = z.object({
  categoryId: resourceId,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(5000).default(''),
  priceCents: z.number().int().min(1).max(1000000),
  imageUrl: z.union([z.literal(''), z.string().regex(uploadedImageUrl), z.string().url().max(2048).refine(value => /^https?:\/\//.test(value), '仅允许 http/https 图片地址或已上传图片')]).default(''),
  soldOut: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100000).default(0),
}).strict();
export const dishPatch = dishInput.partial().extend({ expectedVersion }).refine(value => Object.keys(value).some(key => key !== 'expectedVersion'), '至少提供一个修改字段');
export const menuQuery = pagination.extend({
  categoryId: resourceId.optional(), search: z.string().trim().max(80).optional(),
});

const dishColumns = `d.id, d.category_id AS categoryId, c.name AS category,
  d.name, d.description, d.price_cents AS priceCents, d.image_url AS imageUrl,
  d.sold_out AS soldOut, d.is_active AS isActive, d.sort_order AS sortOrder, d.version`;

interface CategoryRow extends RowDataPacket { id: string; name: string; sortOrder: number; isActive: number }
interface DishRow extends RowDataPacket {
  id: string; categoryId: string; category: string; name: string; description: string;
  priceCents: number; imageUrl: string; soldOut: number; isActive: number; sortOrder: number;
}

export async function categories(pool: Pool, admin = false) {
  const result = await rows<CategoryRow>(pool, `SELECT id, name, sort_order AS sortOrder, is_active AS isActive, version FROM categories ${admin ? '' : 'WHERE is_active = TRUE'} ORDER BY sort_order, id`);
  return result.map(row => ({ ...row, isActive: Boolean(row.isActive) }));
}

function serializeDish(row: DishRow) {
  return { ...row, price: row.priceCents / 100, soldOut: Boolean(row.soldOut), isActive: Boolean(row.isActive) };
}

export async function listMenu(pool: Pool, query: z.infer<typeof menuQuery>, admin = false) {
  const conditions = admin ? ['1 = 1'] : ['d.is_active = TRUE', 'c.is_active = TRUE'];
  const params: SqlValue[] = [];
  if (query.categoryId) { conditions.push('d.category_id = ?'); params.push(query.categoryId); }
  if (query.search) { conditions.push('d.name LIKE ?'); params.push(`%${query.search}%`); }
  const where = conditions.join(' AND ');
  const [count] = await rows(pool, `SELECT COUNT(*) AS total FROM dishes d JOIN categories c ON c.id = d.category_id WHERE ${where}`, params);
  // Pagination is bounded and parsed as integers; MySQL LIMIT literals are safe here.
  const result = await rows<DishRow>(pool, `SELECT ${dishColumns} FROM dishes d JOIN categories c ON c.id = d.category_id WHERE ${where} ORDER BY c.sort_order, d.sort_order, d.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
  return { items: result.map(serializeDish), total: Number(count!.total), page: query.page, pageSize: query.pageSize };
}

export async function getDish(pool: Pool, id: string, admin = false) {
  const [dish] = await rows<DishRow>(pool, `SELECT ${dishColumns} FROM dishes d JOIN categories c ON c.id = d.category_id WHERE d.id = ? ${admin ? '' : 'AND d.is_active = TRUE AND c.is_active = TRUE'}`, [id]);
  if (!dish) throw new ApiError(404, 'DISH_NOT_FOUND', '菜品不存在或已停售');
  return serializeDish(dish);
}

interface CreateRequest { userId: string; key: string }

async function createOnce(pool: Pool, kind: 'category' | 'dish', input: unknown, request: CreateRequest | undefined, insert: (db: Database, id: string) => Promise<unknown>) {
  const id = randomUUID();
  if (!request) { await insert(pool, id); return { id, created: true }; }
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  try {
    await transaction(pool, async db => {
      await db.execute('INSERT INTO catalog_create_requests (user_id, resource_kind, request_key, request_hash, resource_id) VALUES (?, ?, ?, ?, ?)', [request.userId, kind, request.key, hash, id]);
      await insert(db, id);
    });
  } catch (error) {
    if (isDatabaseError(error, 'ER_DUP_ENTRY')) {
      const [existing] = await rows(pool, 'SELECT request_hash, resource_id FROM catalog_create_requests WHERE user_id = ? AND resource_kind = ? AND request_key = ?', [request.userId, kind, request.key]);
      if (existing) {
        if (existing.request_hash !== hash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '本次新增请求内容已改变，请先确认原记录');
        return { id: existing.resource_id as string, created: false };
      }
    }
    throw error;
  }
  return { id, created: true };
}

export async function createCategory(pool: Pool, input: z.infer<typeof categoryInput>, request?: CreateRequest) {
  const result = await createOnce(pool, 'category', input, request, (db, id) => db.execute('INSERT INTO categories (id, name, sort_order, is_active) VALUES (?, ?, ?, ?)', [id, input.name, input.sortOrder, input.isActive]));
  return { category: (await categories(pool, true)).find(category => category.id === result.id)!, created: result.created };
}

export async function updateCategory(pool: Pool, id: string, input: z.infer<typeof categoryPatch>) {
  if (!(await categories(pool, true)).some(category => category.id === id)) throw new ApiError(404, 'CATEGORY_NOT_FOUND', '分类不存在');
  await updateFields(pool, 'categories', id, input, { name: 'name', sortOrder: 'sort_order', isActive: 'is_active' });
  return (await categories(pool, true)).find(category => category.id === id)!;
}

export async function createDish(pool: Pool, input: z.infer<typeof dishInput>, request?: CreateRequest) {
  const result = await createOnce(pool, 'dish', input, request, (db, id) => db.execute('INSERT INTO dishes (id, category_id, name, description, price_cents, image_url, sold_out, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, input.categoryId, input.name, input.description, input.priceCents, input.imageUrl, input.soldOut, input.isActive, input.sortOrder]));
  return { dish: await getDish(pool, result.id, true), created: result.created };
}

export async function updateDish(pool: Pool, id: string, input: z.infer<typeof dishPatch>) {
  await getDish(pool, id, true);
  await updateFields(pool, 'dishes', id, input, {
    categoryId: 'category_id', name: 'name', description: 'description', priceCents: 'price_cents',
    imageUrl: 'image_url', soldOut: 'sold_out', isActive: 'is_active', sortOrder: 'sort_order',
  });
  return getDish(pool, id, true);
}

async function updateFields(pool: Pool, table: 'categories' | 'dishes', id: string, input: Record<string, SqlValue | undefined>, columns: Record<string, string>) {
  const { expectedVersion, ...fields } = input;
  const entries = Object.entries(fields).filter((entry): entry is [string, SqlValue] => entry[1] !== undefined);
  // All identifiers come exclusively from the internal column map.
  const [result] = await pool.execute<ResultSetHeader>(`UPDATE ${table} SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')}, version = version + 1 WHERE id = ?${expectedVersion === undefined ? '' : ' AND version = ?'}`, [...entries.map(([, value]) => value), id, ...(expectedVersion === undefined ? [] : [expectedVersion])]);
  if (result.affectedRows === 0) throw new ApiError(409, 'VERSION_CONFLICT', '记录已被其他页面修改，请关闭后重新打开最新记录再编辑');
}
