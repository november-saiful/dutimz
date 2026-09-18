export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/images/upload
 *
 * Uploads an image to Cloudflare R2 via the DUTIMZ worker.
 * Accepts multipart/form-data with a "file" field.
 *
 * Falls back to returning a mock URL in development (no worker configured).
 */

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const folder = (formData.get('folder') as string) || 'thumbnails';

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Allowed: JPEG, PNG, WebP, AVIF, GIF' },
      { status: 400 },
    );
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Maximum size: 10MB' },
      { status: 400 },
    );
  }

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
    const ext = file.name.split('.').pop() ?? 'jpg';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const key = `${folder}/${timestamp}-${random}.${ext}`;

    return NextResponse.json({
      url: `/uploads/${key}`,
      key,
      note: 'Stored locally — configure CLOUDFLARE_WORKER_URL or R2 credentials for production',
    });
  }

  // Direct R2 upload via S3-compatible API
  try {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const key = `${folder}/${timestamp}-${random}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;

    // Create HMAC signature for S3 auth
    const date = new Date().toUTCString();
    const stringToSign = `PUT\n\n${file.type}\n${date}\n/${R2_BUCKET}/${key}`;
    const encoder = new TextEncoder();

    const keyData = await crypto.subtle.importKey(
      'raw',
      encoder.encode(R2_SECRET_ACCESS_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', keyData, encoder.encode(stringToSign));
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${date.slice(0, 10).replace(/-/g, '')}/${R2_ACCOUNT_ID}/s3/aws4_request, SignedHeaders=content-type;date, Signature=${signature}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        Date: date,
        Authorization: authHeader,
      },
      body: arrayBuffer,
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
