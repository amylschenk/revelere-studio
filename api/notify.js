export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const topic = 'revelere-amy-studio-2026';
  const now = Date.now();

  // Simple rate limit: store last-notified timestamp in a module-level variable
  // Resets on cold start, but good enough for low-traffic review links
  if (handler._lastSent && now - handler._lastSent < 60 * 60 * 1000) {
    return res.status(200).json({ skipped: true });
  }
  handler._lastSent = now;

  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Title': 'Revelere Studio — someone just opened your link',
        'Priority': 'default',
        'Tags': 'eyes',
      },
      body: `A visitor opened Revelere Studio at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' })} ET`,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
