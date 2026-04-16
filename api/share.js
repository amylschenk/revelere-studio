import { put } from '@vercel/blob';
import crypto from 'crypto';

export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { html } = req.body || {};
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Missing html content' });
  }

  try {
    const token = crypto.randomBytes(14).toString('hex');
    const content = Buffer.from(html, 'utf8');
    const blob = await put(`shares/${token}.html`, content, {
      access: 'public',
      contentType: 'text/html; charset=utf-8',
      addRandomSuffix: false,
    });
    return res.status(200).json({ url: blob.url, token });
  } catch (e) {
    console.error('Share API error:', e);
    return res.status(500).json({ error: e.message || 'Failed to create share link' });
  }
}
