import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { isDatabaseError } from './db.js';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: {
      code: 'VALIDATION_ERROR', message: '请求参数不正确',
      details: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    } });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: '请求体不是有效 JSON' } });
    return;
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: _req.path === '/api/admin/uploads/images' ? '图片不能超过 5 MB' : '请求体超过 100 KB 限制' } });
    return;
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'encoding.unsupported') {
    res.status(415).json({ error: { code: 'UNSUPPORTED_ENCODING', message: '不支持压缩的上传请求，请直接上传图片' } });
    return;
  }
  if (isDatabaseError(error, 'ER_DUP_ENTRY')) {
    res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: '该记录已存在' } });
    return;
  }
  if (isDatabaseError(error, 'ER_NO_REFERENCED_ROW_2') || isDatabaseError(error, 'ER_ROW_IS_REFERENCED_2')) {
    res.status(409).json({ error: { code: 'REFERENCE_CONFLICT', message: '关联记录不存在或仍在使用中' } });
    return;
  }
  // Do not log SQL values, credentials, tokens or customer contact details.
  console.error('API request failed:', error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器发生错误，请稍后重试' } });
};
