import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ApiError } from './errors.js';

export const uploadedImageUrl = /^\/api\/uploads\/menu\/[a-f0-9]{64}\.webp$/;
export const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const maxImageBytes = 5 * 1024 * 1024;

export async function saveMenuImage(directory: string, input: unknown) {
  if (!Buffer.isBuffer(input) || !input.length) throw new ApiError(400, 'IMAGE_REQUIRED', '请选择需要上传的图片');
  if (input.length > maxImageBytes) throw new ApiError(413, 'IMAGE_TOO_LARGE', '图片不能超过 5 MB');
  let output: Buffer;
  try {
    const bitmapSignature = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || input.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      || input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
    if (!bitmapSignature) throw new Error('Unsupported image signature');
    const image = sharp(input, { limitInputPixels: 25000000 });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
    output = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new ApiError(400, 'INVALID_IMAGE', '图片内容无效，请选择有效的 JPG、PNG 或静态 WebP 图片（最多 2500 万像素）'); }
  const name = `${createHash('sha256').update(output).digest('hex')}.webp`;
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, output, { flag: 'wx' });
    await rename(temporary, join(directory, name));
  } finally { await unlink(temporary).catch(() => {}); }
  return { imageUrl: `/api/uploads/menu/${name}`, size: output.length };
}
