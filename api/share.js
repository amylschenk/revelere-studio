import { list, put } from '@vercel/blob';
import crypto from 'crypto';

export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } },
};

export default async function handler(req, res) {
  // ── GET: proxy the share HTML so the blob URL is never exposed ──
  if (req.method === 'GET') {
    const { t } = req.query;
    if (!t || !/^[a-f0-9]+$/.test(t)) return res.status(400).end();
    try {
      const { blobs } = await list({ prefix: `shares/${t}.html`, limit: 1 });
      const found = blobs.find(b => b.pathname === `shares/${t}.html`);
      if (!found) return res.status(404).send('<p>Share not found or expired.</p>');
      const r = await fetch(found.url);
      if (!r.ok) return res.status(502).send('<p>Could not load share.</p>');
      const html = await r.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(html);
    } catch (e) {
      console.error('Share GET error:', e);
      return res.status(500).send('<p>Error loading share.</p>');
    }
  }

  // ── POST: save share HTML to Vercel Blob, return the viewer URL ──
  if (req.method === 'POST') {
    const { html } = req.body || {};
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'Missing html content' });
    }
    try {
      const token = crypto.randomBytes(14).toString('hex');
      const content = Buffer.from(html, 'utf8');
      await put(`shares/${token}.html`, content, {
        access: 'public',
        contentType: 'text/html; charset=utf-8',
        addRandomSuffix: false,
      });
      // Return the viewer URL — not the blob URL — so clients never see the CDN address
      return res.status(200).json({ token, url: `/view?t=${token}` });
    } catch (e) {
      console.error('Share POST error:', e);
      return res.status(500).json({ error: e.message || 'Failed to create share link' });
    }
  }

  res.status(405).end();
}
