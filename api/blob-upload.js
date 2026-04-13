import { put } from '@vercel/blob';

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { dataUrl, filename } = req.body;
    if (!dataUrl || !filename) return res.status(400).json({ error: 'Missing dataUrl or filename' });

    // Convert base64 data URL to buffer
    const base64 = dataUrl.split(',')[1];
    if (!base64) return res.status(400).json({ error: 'Invalid dataUrl format' });

    const buffer = Buffer.from(base64, 'base64');
    const contentType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    const { url } = await put(`revelere/${filename}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });

    res.status(200).json({ url });
  } catch (err) {
    console.error('Blob upload error:', err);
    res.status(500).json({ error: err.message });
  }
}
