import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { RequestHandler } from 'express';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { isDatabaseError, rows, transaction, type Database } from './db.js';
import { ApiError } from './errors.js';
import { phone } from './validation.js';

const scrypt = promisify(scryptCallback);
const password = z.string().min(8).max(128);
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/, '账号须为 3–32 位字母、数字或下划线');
export const registerInput = z.object({
  username, password, displayName: z.string().trim().min(1).max(80), phone: phone.optional(),
}).strict();
export const loginInput = z.object({ username, password }).strict();
export const profileInput = z.object({
  displayName: z.string().trim().min(1).max(80),
  phone: z.union([phone, z.literal('').transform(() => null), z.null()]),
}).strict();
export const passwordInput = z.object({ currentPassword: password, newPassword: password }).strict()
  .refine(input => input.currentPassword !== input.newPassword, { path: ['newPassword'], message: '新密码不能与原密码相同' });

export interface User extends RowDataPacket {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  role: 'customer' | 'admin';
}
export const userColumns = 'id, username, display_name AS displayName, phone, role';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(value, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(value: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hex] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await scrypt(value, salt, 64) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function createSession(pool: Database, user: User) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.execute('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash(token), user.id, expiresAt]);
  return { user, token, expiresAt: expiresAt.toISOString() };
}

export async function register(pool: Pool, input: z.infer<typeof registerInput>) {
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  try { return await transaction(pool, async db => {
    await db.execute('INSERT INTO users (id, username, display_name, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
      [id, input.username, input.displayName, input.phone ?? null, passwordHash]);
    const [user] = await rows<User>(db, `SELECT ${userColumns} FROM users WHERE id = ?`, [id]);
    return createSession(db, user!);
  }); } catch (error) {
    if (isDatabaseError(error, 'ER_DUP_ENTRY')) throw new ApiError(409, 'USERNAME_TAKEN', '该账号已被注册，请更换账号或直接登录');
    throw error;
  }
}

export async function login(pool: Pool, input: z.infer<typeof loginInput>) {
  return transaction(pool, async db => {
  // Serialize login with password changes so an old password cannot mint a session after revocation.
  const [record] = await rows<User & { passwordHash: string }>(db,
    `SELECT ${userColumns}, password_hash AS passwordHash FROM users WHERE username = ? FOR UPDATE`, [input.username]);
  // Equal-cost hash verification also for unknown accounts.
  const fallbackHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
  const valid = await verifyPassword(input.password, record?.passwordHash ?? fallbackHash);
  if (!record || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', '账号或密码不正确');
  const { passwordHash: _passwordHash, ...user } = record;
  return createSession(db, user as User);
  });
}

export async function updateProfile(pool: Pool, userId: string, input: z.infer<typeof profileInput>) {
  await pool.execute('UPDATE users SET display_name = ?, phone = ? WHERE id = ?', [input.displayName, input.phone, userId]);
  const [user] = await rows<User>(pool, `SELECT ${userColumns} FROM users WHERE id = ?`, [userId]);
  return { user: user! };
}

export async function changePassword(pool: Pool, userId: string, currentTokenHash: string, input: z.infer<typeof passwordInput>) {
  const nextHash = await hashPassword(input.newPassword);
  return transaction(pool, async db => {
    const [record] = await rows<User & { passwordHash: string }>(db, `SELECT ${userColumns}, password_hash AS passwordHash FROM users WHERE id = ? FOR UPDATE`, [userId]);
    const [session] = await rows(db, 'SELECT token_hash FROM sessions WHERE token_hash = ? AND user_id = ? AND expires_at > UTC_TIMESTAMP(3)', [currentTokenHash, userId]);
    if (!record || !session) throw new ApiError(401, 'UNAUTHORIZED', '登录已过期，请重新登录');
    if (!await verifyPassword(input.currentPassword, record.passwordHash)) throw new ApiError(400, 'INVALID_CURRENT_PASSWORD', '原密码不正确');
    await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [nextHash, userId]);
    await db.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
    const { passwordHash: _passwordHash, ...user } = record;
    return createSession(db, user as User);
  });
}

export function authenticate(pool: Pool): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization') ?? '');
    if (!match?.[1]) throw new ApiError(401, 'UNAUTHORIZED', '请先登录');
    const hash = tokenHash(match[1]);
    const [user] = await rows<User>(pool,
      'SELECT u.id, u.username, u.display_name AS displayName, u.phone, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)', [hash]);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', '登录已过期，请重新登录');
    res.locals.user = user;
    res.locals.tokenHash = hash;
    next();
  };
}

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if ((res.locals.user as User).role !== 'admin') throw new ApiError(403, 'FORBIDDEN', '此操作需要商家管理员权限');
  next();
};
