export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  let html = '';
  try {
    const pageResp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
    });
    html = await pageResp.text();
  } catch (e) {
    return res.status(422).json({ error: 'Could not fetch that URL — the site may block scrapers. Fill in manually.' });
  }

  // Extract Open Graph / meta tags first (fast, no AI needed)
  const og = (prop) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
           || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
    return m ? m[1].trim() : '';
  };

  // Extract JSON-LD product schema if present
  let jsonLd = {};
  const ldMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const parsed = JSON.parse(ldMatch[1]);
      const product = Array.isArray(parsed) ? parsed.find(p => p['@type'] === 'Product') : (parsed['@type'] === 'Product' ? parsed : null);
      if (product) {
        jsonLd = {
          name:   product.name || '',
          image:  Array.isArray(product.image) ? product.image[0] : (product.image || ''),
          price:  product.offers?.price || product.offers?.[0]?.price || '',
          vendor: product.brand?.name || '',
        };
      }
    } catch(e) {}
  }

  // Send condensed HTML to Claude for extraction
  const snippet = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 6000);

  const ogData = {
    title:  og('og:title') || og('twitter:title'),
    image:  og('og:image') || og('twitter:image'),
    price:  og('product:price:amount') || og('og:price:amount'),
    vendor: og('og:site_name'),
  };

  const prompt = `You are extracting product info for a luxury interior design sourcing tool.

URL: ${url}
Open Graph data: ${JSON.stringify(ogData)}
JSON-LD data: ${JSON.stringify(jsonLd)}
Page text snippet: ${snippet}

Return ONLY valid JSON with these fields:
{
  "name": "product name (concise, no brand prefix)",
  "vendor": "brand or retailer name",
  "price": 0,
  "category": "one of: Seating, Tables, Lighting, Textiles, Decor, Furniture, Accessories, Signature, Other",
  "image": "best product image URL (prefer og:image or JSON-LD)",
  "comm": 0,
  "notes": "one short sentence about this product"
}

Rules:
- price: number in USD, no $ sign. Use 0 if not found.
- comm: estimated affiliate commission % based on vendor. Amazon=4, Wayfair=7, RH=0, CB2=0, West Elm=5, Pottery Barn=5, Serena & Lily=8, McGee & Co=8, Article=5, most others=6. Use 0 if unknown.
- category: infer from product type if not explicit.
- image: full absolute URL only. Empty string if none found.`;

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
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const claudeData = await claudeResp.json();
    const text = claudeData.content?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const product = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json(product);
  } catch(e) {
    // Fall back to just OG data if Claude fails
    res.json({
      name:   jsonLd.name || ogData.title || '',
      vendor: jsonLd.vendor || ogData.vendor || '',
      price:  parseFloat(jsonLd.price || ogData.price || '0') || 0,
      image:  jsonLd.image || ogData.image || '',
      category: 'Other',
      comm: 0,
      notes: '',
    });
  }
}
