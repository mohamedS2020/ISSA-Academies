/**
 * The import routes' upload: one .xlsx file and the branch it is for, posted
 * as multipart form data. Server-only.
 */
import { z } from 'zod';
import { BadRequestError } from '@/lib/api/error-handler';
import { IMPORT_LIMITS } from './template';

const branchIdSchema = z.string().uuid();

export async function readUpload(request: Request): Promise<{ file: Buffer; fileName: string; branchId: string }> {
  // Refuse an oversized body before reading it.
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > IMPORT_LIMITS.maxFileSize + 64 * 1024) throw new BadRequestError('The file is larger than 5 MB.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new BadRequestError('Send the file as multipart form data.');
  }
  const file = form.get('file');
  const branchId = branchIdSchema.safeParse(form.get('branchId'));
  if (!(file instanceof File)) throw new BadRequestError('Choose a file to import.');
  if (!branchId.success) throw new BadRequestError('Choose the branch to import into.');
  if (file.size > IMPORT_LIMITS.maxFileSize) throw new BadRequestError('The file is larger than 5 MB.');

  return {
    file: Buffer.from(await file.arrayBuffer()),
    fileName: file.name.slice(0, 255),
    branchId: branchId.data,
  };
}
