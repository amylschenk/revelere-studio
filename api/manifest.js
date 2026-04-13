import { list, put } from '@vercel/blob';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

const MANIFEST_PATH = 'revelere/manifest.json';

export default async function handler(req, res) {
  // ── GET: return current manifest ──────────────────────────────
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: 'revelere/manifest' });
      const found = blobs.find(b => b.pathname === MANIFEST_PATH);
      if (!found) return res.status(200).json({ rooms: {}, sourcing: {} });

      // Fetch with cache-bust to always get latest version
      const r = await fetch(found.url + '?t=' + Date.now());
      if (!r.ok) return res.status(200).json({ rooms: {}, sourcing: {} });

      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      console.error('Manifest GET error:', e);
      return res.status(200).json({ rooms: {}, sourcing: {} });
    }
  }

  // ── POST: save updated manifest ───────────────────────────────
  if (req.method === 'POST') {
    try {
      const manifest = req.body;
      const json = JSON.stringify(manifest);
      const buffer = Buffer.from(json, 'utf-8');

      const { url } = await put(MANIFEST_PATH, buffer, {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return res.status(200).json({ url });
    } catch (e) {
      console.error('Manifest POST error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
