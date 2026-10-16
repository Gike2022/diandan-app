import { config as dotenv } from 'dotenv';
import { z } from 'zod';
import { resolve } from 'node:path';
import type { SslOptions } from 'mysql2';

const schema = z.object({
  DATABASE_URL: z.string().url().refine(value => value.startsWith('mysql://'), '必须使用 mysql:// 连接地址'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_MODE: z.enum(['standard', 'demo']).default('standard'),
  SERVE_FRONTEND: z.enum(['true', 'false']).default('false'),
  FRONTEND_DIRECTORY: z.string().min(1).default('../dist'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  RENDER_EXTERNAL_URL: z.string().url().optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  DATABASE_SSL_CA: z.string().min(1).optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  ENABLE_DEMO_PAYMENTS: z.enum(['true', 'false']).default('false'),
  UPLOAD_DIRECTORY: z.string().min(1).default('../.local/uploads/menu'),
  IMAGE_STORAGE: z.enum(['filesystem', 'mysql']).default('filesystem'),
  ORDER_PAYMENT_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(604800).default(900),
  ORDER_EXPIRY_SWEEP_INTERVAL_MS: z.coerce.number().int().min(100).max(600000).default(30000),
});

export interface AppConfig {
  databaseUrl: string;
  host: string;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  appMode: 'standard' | 'demo';
  frontendDirectory?: string;
  trustProxyHops: number;
  databaseSsl?: SslOptions;
  corsOrigins: string[];
  demoPayments: boolean;
  uploadDirectory: string;
  imageStorage: 'filesystem' | 'mysql';
  paymentTimeoutSeconds: number;
  expirySweepIntervalMs: number;
}

export function loadConfig(): AppConfig {
  dotenv({ quiet: true });
  return parseConfig(process.env);
}

export function parseConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const env = schema.parse(environment);
  if (env.NODE_ENV === 'production' && env.ENABLE_DEMO_PAYMENTS === 'true' && env.APP_MODE !== 'demo') {
    throw new Error('正常生产环境不能开启模拟支付；公开课程演示请明确设置 APP_MODE=demo');
  }
  return {
    databaseUrl: env.DATABASE_URL,
    host: env.HOST,
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    appMode: env.APP_MODE,
    frontendDirectory: env.SERVE_FRONTEND === 'true' ? resolve(env.FRONTEND_DIRECTORY) : undefined,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    databaseSsl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true, verifyIdentity: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) } : undefined,
    corsOrigins: [...new Set([...env.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean), ...(env.RENDER_EXTERNAL_URL ? [new URL(env.RENDER_EXTERNAL_URL).origin] : [])])],
    demoPayments: env.ENABLE_DEMO_PAYMENTS === 'true',
    uploadDirectory: resolve(env.UPLOAD_DIRECTORY),
    imageStorage: env.IMAGE_STORAGE,
    paymentTimeoutSeconds: env.ORDER_PAYMENT_TIMEOUT_SECONDS,
    expirySweepIntervalMs: env.ORDER_EXPIRY_SWEEP_INTERVAL_MS,
  };
}
