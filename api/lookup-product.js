const VENDOR_MAP = {
  'westelm.com':         { name: 'West Elm',       comm: 5 },
  'potterybarn.com':     { name: 'Pottery Barn',    comm: 5 },
  'pbteen.com':          { name: 'Pottery Barn',    comm: 5 },
  'rh.com':              { name: 'RH',              comm: 0 },
  'restorationhardware.com': { name: 'RH',          comm: 0 },
  'cb2.com':             { name: 'CB2',             comm: 0 },
  'crateandbarrel.com':  { name: 'Crate & Barrel',  comm: 0 },
  'anthropologie.com':   { name: 'Anthropologie',   comm: 6 },
  'serenaandlily.com':   { name: 'Serena & Lily',   comm: 8 },
  'mcgeeandco.com':      { name: 'McGee & Co',      comm: 8 },
  'article.com':         { name: 'Article',         comm: 5 },
  'wayfair.com':         { name: 'Wayfair',         comm: 7 },
  'amazon.com':          { name: 'Amazon',          comm: 4 },
  'target.com':          { name: 'Target',          comm: 5 },
  'homedepot.com':       { name: 'Home Depot',      comm: 3 },
  'etsy.com':            { name: 'Etsy',            comm: 4 },
  'fourhandsfurniture.com': { name: 'Four Hands',   comm: 6 },
  'forhands.com':        { name: 'Four Hands',      comm: 6 },
  'visualcomfort.com':   { name: 'Visual Comfort',  comm: 6 },
  'rejuvenation.com':    { name: 'Rejuvenation',    comm: 5 },
  'lumens.com':          { name: 'Lumens',          comm: 7 },
  'arhaus.com':          { name: 'Arhaus',          comm: 0 },
  'zgallerie.com':       { name: 'Z Gallerie',      comm: 6 },
  'worldmarket.com':     { name: 'World Market',    comm: 5 },
  'overstock.com':       { name: 'Overstock',       comm: 7 },
  'ikea.com':            { name: 'IKEA',            comm: 0 },
  'hayneedle.com':       { name: 'Hayneedle',       comm: 7 },
  'lulu-georgia.com':    { name: 'Lulu & Georgia',  comm: 8 },
  'luluandgeorgia.com':  { name: 'Lulu & Georgia',  comm: 8 },
  'farmhousepottery.com':{ name: 'Farmhouse Pottery', comm: 7 },
  'schoolhouse.com':     { name: 'Schoolhouse',     comm: 6 },
  'perigold.com':        { name: 'Perigold',        comm: 7 },
  'burkedecor.com':      { name: 'Burke Decor',     comm: 8 },
};

function guessCategory(name = '') {
  const n = name.toLowerCase();
  if (/sofa|sectional|chair|seating|ottoman|bench|stool|loveseat|recliner/.test(n)) return 'Seating';
  if (/table|desk|counter|shelf|shelving|cabinet|dresser|console|nightstand|credenza/.test(n)) return 'Tables';
  if (/lamp|light|pendant|chandelier|sconce|lantern|fixture|bulb/.test(n)) return 'Lighting';
  if (/rug|pillow|throw|blanket|curtain|drape|textile|linen|duvet|sheet/.test(n)) return 'Textiles';
  if (/mirror|art|plant|vase|candle|tray|book|frame|sculpture|decor|figurine/.test(n)) return 'Decor';
  if (/bed|mattress|wardrobe|armoire|headboard|bookcase|bookshelf/.test(n)) return 'Furniture';
  if (/basket|organizer|hook|hardware|knob|pull/.test(n)) return 'Accessories';
  return 'Other';
}

function ogGet(html, prop) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1].trim();
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  // Step 1: Always get vendor + comm from domain — guaranteed baseline
  let vendor = '', comm = 6;
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    const match = VENDOR_MAP[domain];
    if (match) {
      vendor = match.name;
      comm   = match.comm;
    } else {
      // Capitalise first segment of domain as fallback vendor
      vendor = domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  } catch(e) {}

  // Step 2: Try fetching the product page for OG / JSON-LD data
  let name = '', image = '', price = 0;
  try {
    const pageResp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });

    const html = await pageResp.text();

    // OG tags
    const ogTitle   = ogGet(html, 'og:title')               || ogGet(html, 'twitter:title');
    const ogImage   = ogGet(html, 'og:image')               || ogGet(html, 'twitter:image');
    const ogPrice   = ogGet(html, 'product:price:amount')   || ogGet(html, 'og:price:amount');
    const ogSite    = ogGet(html, 'og:site_name');
    if (ogSite && !VENDOR_MAP[new URL(url).hostname.replace(/^www\./, '')]) vendor = ogSite;

    // JSON-LD product schema
    const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldMatches) {
      try {
        const parsed = JSON.parse(m[1]);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        const product = items.find(p => p['@type'] === 'Product');
        if (product) {
          name  = product.name || '';
          image = Array.isArray(product.image) ? product.image[0] : (product.image || '');
          price = parseFloat(product.offers?.price || product.offers?.[0]?.price || '0') || 0;
          if (product.brand?.name && !VENDOR_MAP[new URL(url).hostname.replace(/^www\./, '')]) {
            vendor = product.brand.name;
          }
          break;
        }
      } catch(e) {}
    }

    // Fall back to OG if JSON-LD gave nothing
    if (!name)  name  = ogTitle || '';
    if (!image) image = ogImage || '';
    if (!price) price = parseFloat(ogPrice || '0') || 0;

    // Also try to find title tag if still nothing
    if (!name) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) name = titleMatch[1].trim().split(/[|\-–]/)[0].trim();
    }

  } catch(e) {
    // Fetch failed (bot block, timeout, etc.) — that's fine, we'll return what we have
  }

  // Step 3: Clean up name with Claude (only if we have a name to clean)
  // Skip Claude entirely if we already have good data
  if (name && vendor) {
    try {
      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Clean up this product name and pick a category. Return ONLY JSON, no other text:
{"name":"<clean short product name, no brand prefix>","category":"<one of: Seating, Tables, Lighting, Textiles, Decor, Furniture, Accessories, Other>","notes":"<one short sentence about this product for a luxury interior designer>"}

Raw name: "${name}"
Vendor: "${vendor}"
Infer category from the product name.`
          }]
        }),
      });
      const cd = await claudeResp.json();
      const text = cd.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const cleaned = JSON.parse(jsonMatch[0]);
        if (cleaned.name) name = cleaned.name;
        return res.json({ name, vendor, price, image, category: cleaned.category || guessCategory(name), comm, notes: cleaned.notes || '' });
      }
    } catch(e) {}
  }

  // Step 4: Return whatever we have — always return something
  res.json({
    name:     name     || '',
    vendor:   vendor   || '',
    price:    price    || 0,
    image:    image    || '',
    category: guessCategory(name),
    comm:     comm     || 0,
    notes:    '',
  });
}
