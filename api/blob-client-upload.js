import { handleUpload } from '@vercel/blob/client';

// Handles the two-step client upload flow:
// 1. Browser POSTs here to get a short-lived client token
// 2. Browser uploads directly to Vercel Blob CDN using that token
// This bypasses the 4.5MB serverless body limit entirely.

export default async function handler(req, res) {
  // Allow CORS for same-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        allowOverwrite: true,
        access: 'public',
      }),
      onUploadCompleted: async ({ blob }) => {
        // No-op: we don't need a callback for this app
      },
    });
    return res.json(body);
  } catch (e) {
    console.error('Client upload handler error:', e);
    return res.status(500).json({ error: e.message });
  }
}
