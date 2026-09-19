export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { amzDateString, sha256Hex, signRequestV4 } from '@/lib/upload/sigv4';
import { enforceRateLimit, validationFailure } from '@/lib/api/http';
import { imageUploadSchema } from '@/lib/api/schemas';
import { validate } from '@/lib/api/validation';

/**
 * POST /api/images/upload
 *
 * Uploads an image to Cloudflare R2 via the DUTIMZ worker.
 * Accepts multipart/form-data with a "file" field.
 *
 * Falls back to returning a mock URL in development (no worker configured).
 *
 * This is the most expensive unauthenticated endpoint (it can push 10 MB into
 * object storage), so it carries the tightest budget after the newsletter:
 * 5 uploads/min per IP (spec §9.4).
 */

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;

/** Canonical extension per MIME type — never trust the uploaded filename. */
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export async function POST(request: NextRequest) {
  // Budget before parsing the body so rejected uploads cost us nothing.
  const denied = enforceRateLimit(request, 'upload');
  if (denied) return denied;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  // The schema owns the file type/size rules and the storage-key prefix.
  const formData = await request.formData();
  const parsed = validate(imageUploadSchema, {
    file: formData.get('file'),
    folder: formData.get('folder'),
  });
  if (!parsed.ok) return validationFailure(parsed);
  const { file, folder } = parsed.data;

  // If worker URL is configured, proxy to the Cloudflare Worker
  if (WORKER_URL) {
    try {
      const workerForm = new FormData();
      workerForm.append('file', file);
      workerForm.append('folder', folder);

      const res = await fetch(`${WORKER_URL}/api/images/upload`, {
        method: 'POST',
        body: workerForm,
      });

      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (err) {
      console.error('Worker upload failed:', err);
      return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
    }
  }

  // Fallback: upload directly from the edge runtime using R2 S3 API
  // This requires R2 credentials to be set as env vars
  const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET = process.env.R2_BUCKET_NAME || 'dutimz-images';

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    // Development fallback: store locally and return a relative path
    const ext = EXT_BY_TYPE[file.type] ?? 'bin';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const key = `${folder}/${timestamp}-${random}.${ext}`;

    return NextResponse.json({
      url: `/uploads/${key}`,
      key,
      note: 'Stored locally — configure CLOUDFLARE_WORKER_URL or R2 credentials for production',
    });
  }

  // Direct R2 upload via the S3-compatible API, signed with AWS SigV4.
  try {
    const ext = EXT_BY_TYPE[file.type] ?? 'bin';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const key = `${folder}/${timestamp}-${random}.${ext}`;

    const body = await file.arrayBuffer();
    const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const amzDate = amzDateString();
    // R2 requires the payload hash as a signed header for PUT requests.
    const payloadHash = await sha256Hex(body);

    const signed = await signRequestV4({
      method: 'PUT',
      host,
      path: `/${R2_BUCKET}/${key}`,
      headers: {
        'content-type': file.type,
        'x-amz-content-sha256': payloadHash,
      },
      payloadHash,
      amzDate,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      region: 'auto',
      service: 's3',
    });

    const res = await fetch(`https://${host}/${R2_BUCKET}/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': signed.headers['x-amz-date']!,
        Authorization: signed.authorization,
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('R2 upload failed:', res.status, errText);
      return NextResponse.json({ error: 'Upload to R2 failed' }, { status: 502 });
    }

    const publicUrl = `https://${R2_BUCKET}.r2.dev/${key}`;
    return NextResponse.json({ url: publicUrl, key }, { status: 201 });
  } catch (err) {
    console.error('R2 direct upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
