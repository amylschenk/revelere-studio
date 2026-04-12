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

  // Detect bot-blocked / error pages by title
  const BOT_TITLES = /page not found|robot check|access denied|something went wrong|error|captcha|verify you are human|just a moment|are you a robot|service unavailable|403 forbidden|404/i;

  // Extract Amazon ASIN from URL if present
  let asin = '';
  try {
    const asinMatch = url.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i) || url.match(/[?&](?:ASIN|asin)=([A-Z0-9]{10})/i);
    if (asinMatch) asin = asinMatch[1];
  } catch(e) {}

  async function fetchPage(ua) {
    return fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
  }

  // Step 2: Try fetching the product page for OG / JSON-LD data
  let name = '', image = '', price = 0;
  try {
    // Try desktop UA first, then mobile if it looks bot-blocked
    let html = '';
    let resp = await fetchPage('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    html = await resp.text();

    // If page looks bot-blocked, try mobile UA
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleTagMatch ? titleTagMatch[1].trim() : '';
    if (BOT_TITLES.test(pageTitle) || html.length < 2000) {
      resp = await fetchPage('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
      html = await resp.text();
    }

    const freshTitle = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
    if (BOT_TITLES.test(freshTitle)) {
      // Still blocked — skip page data, fall through to ASIN/fallback
      throw new Error('bot-blocked');
    }

    // OG tags
    const ogTitle  = ogGet(html, 'og:title')             || ogGet(html, 'twitter:title');
    const ogImage  = ogGet(html, 'og:image')             || ogGet(html, 'twitter:image');
    const ogPrice  = ogGet(html, 'product:price:amount') || ogGet(html, 'og:price:amount');
    const ogSite   = ogGet(html, 'og:site_name');
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
          if (product.brand?.name && !VENDOR_MAP[new URL(url).hostname.replace(/^www\./, '')]) vendor = product.brand.name;
          break;
        }
      } catch(e) {}
    }

    // Fall back to OG
    if (!name)  name  = ogTitle || '';
    if (!image) image = ogImage || '';
    if (!price) price = parseFloat(ogPrice || '0') || 0;

    // Title tag last resort for name
    if (!name && !BOT_TITLES.test(freshTitle)) {
      name = freshTitle.split(/[|\-–]/)[0].trim();
    }

    // Try to find price in page text if still missing (e.g. "$49.99" pattern)
    if (!price) {
      const priceMatch = html.match(/["']price["']\s*[:=]\s*["']?([\d,.]+)["']?/i)
                      || html.match(/\$\s*([\d,]+\.?\d{0,2})\b/);
      if (priceMatch) price = parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
    }

  } catch(e) {
    // Fetch failed or bot-blocked — fall through to ASIN/fallback below
  }

  // Step 2b: For Amazon with ASIN, build image URL via associate widget (works without scraping)
  if (asin && !image) {
    image = `https://ws-na.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${asin}&Format=_SL500_&ID=AsinImage&MarketPlace=US&ServiceVersion=20070822&WS=1&tag=revelere-20`;
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
