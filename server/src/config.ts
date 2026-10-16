import { config as dotenv } from 'dotenv';
import { z } from 'zod';
import { resolve } from 'node:path';

const schema = z.object({
  DATABASE_URL: z.string().url().refine(value => value.startsWith('mysql://'), '必须使用 mysql:// 连接地址'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  ENABLE_DEMO_PAYMENTS: z.enum(['true', 'false']).default('false'),
  UPLOAD_DIRECTORY: z.string().min(1).default('../.local/uploads/menu'),
  ORDER_PAYMENT_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(604800).default(900),
  ORDER_EXPIRY_SWEEP_INTERVAL_MS: z.coerce.number().int().min(100).max(600000).default(30000),
});

export interface AppConfig {
  databaseUrl: string;
  host: string;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigins: string[];
  demoPayments: boolean;
  uploadDirectory: string;
  paymentTimeoutSeconds: number;
  expirySweepIntervalMs: number;
}

export function loadConfig(): AppConfig {
  dotenv({ quiet: true });
  const env = schema.parse(process.env);
  if (env.NODE_ENV === 'production' && env.ENABLE_DEMO_PAYMENTS === 'true') {
    throw new Error('生产环境不能开启模拟支付，请设置 ENABLE_DEMO_PAYMENTS=false');
  }
  return {
    databaseUrl: env.DATABASE_URL,
    host: env.HOST,
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    corsOrigins: env.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean),
    demoPayments: env.ENABLE_DEMO_PAYMENTS === 'true',
    uploadDirectory: resolve(env.UPLOAD_DIRECTORY),
    paymentTimeoutSeconds: env.ORDER_PAYMENT_TIMEOUT_SECONDS,
    expirySweepIntervalMs: env.ORDER_EXPIRY_SWEEP_INTERVAL_MS,
  };
}
