import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { hashPassword } from '../src/auth.js';
import { transaction } from '../src/db.js';

interface SeedMenu {
  categories: { id: string; name: string }[];
  dishes: { id: string; categoryId: string; name: string; description: string; priceCents: number; imageUrl: string; soldOut?: boolean }[];
}

export async function seed(pool: Pool, adminPassword: string, customerPassword: string) {
  z.string().min(8).max(128).parse(adminPassword);
  z.string().min(8).max(128).parse(customerPassword);
  const menu = JSON.parse(await readFile(new URL('../seeds/menu.json', import.meta.url), 'utf8')) as SeedMenu;
  const passwords = await Promise.all([hashPassword(adminPassword), hashPassword(customerPassword)]);
  await transaction(pool, async db => {
    for (const [index, category] of menu.categories.entries()) {
      await db.execute('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = categories.id', [category.id, category.name, index]);
    }
    for (const [index, dish] of menu.dishes.entries()) {
      await db.execute('INSERT INTO dishes (id, category_id, name, description, price_cents, image_url, sold_out, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = dishes.id',
        [dish.id, dish.categoryId, dish.name, dish.description, dish.priceCents, dish.imageUrl, dish.soldOut ?? false, index]);
    }
    for (const [index, account] of [{ username: 'admin', displayName: '演示商家', role: 'admin' }, { username: 'demo', displayName: '演示顾客', role: 'customer' }].entries()) {
      await db.execute('INSERT INTO users (id, username, display_name, role, password_hash) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = users.id',
        [randomUUID(), account.username, account.displayName, account.role, passwords[index]!]);
    }
  });
}
