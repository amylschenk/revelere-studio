# Revelere Studio — Claude Code Handoff

> This document is the complete technical handoff for Revelere Studio. Read it fully before touching any code. It covers what the app is, how it works, every architectural decision, what's built, what's pending, and exactly how to continue development.

---

## What This Is

Revelere Studio is a custom web application for **Revelere**, an STR (short-term rental) interior design and consulting business. It automates the end-to-end design workflow:

1. Upload property photos
2. Generate AI empty rooms (furniture removed)
3. Generate AI-designed "after" renders
4. Source furniture and decor with affiliate tracking
5. Produce a branded client deliverable called the **Design Book**

The app connects three Revelere revenue streams: STR design consulting, property management, and affiliate marketing.

---

## Current State

The prototype is a **single self-contained HTML file** (`index.html`). It runs entirely in the browser — no backend, no build step, no framework, no external libraries. All state is in-memory. API keys are saved to localStorage.

**This is intentional for the prototype.** The production migration plan is documented below.

---

## Five Modules — Status

| Module | What it does | Status |
|--------|-------------|--------|
| **M1 · Upload** | Drag-drop photo upload. Claude Vision auto-detects room types. | ✅ Complete |
| **M2 · Empty Rooms** | OpenAI gpt-image-1 strips furniture, leaving architectural shell. | ✅ Complete |
| **M3 · AI Design** | Stacked prompt system generates after renders. Core toggle, mood slider, multiple views per room. | ✅ Complete |
| **M4 · Sourcing** | Room-aware sourcing, 10 room catalogues, Pinterest refs, past purchases, custom items, swap/replace, affiliate scoring. | ✅ Complete |
| **M5 · Design Book** | AI-written design notes, 3 themes, per-room pages, sourcing pages, PDF export. | ✅ Complete |

---

## Tech Stack

### Prototype (current)
- **Frontend:** Single HTML file, vanilla JS, no framework, no build step
- **Room detection:** Anthropic API — `claude-haiku-4-5-20251001` vision
- **Image generation:** OpenAI API — `gpt-image-1` edit endpoint
- **Storage:** Browser localStorage (API keys only), in-memory state

### Production Target
- **Frontend:** Next.js (React) on Vercel
- **Backend/DB:** Supabase (auth, storage, project data)
- **Image generation:** OpenAI `gpt-image-1` (same, via server-side API route)
- **Room detection:** Anthropic API (same)
- **Sourcing:** Mantis API (pending confirmation) or CSV fallback
- **Hosting:** Vercel + Supabase

---

## API Keys

Two live API connections in the prototype:

### Anthropic (M1 — room detection)
- Model: `claude-haiku-4-5-20251001`
- Used: reads uploaded photo, returns room type from fixed list
- Cost: ~$0.001/image
- localStorage key: `rev_anth_key`
- **Optional** — app works without it, rooms just need manual labeling

### OpenAI (M2 + M3 — image generation)
- Model: `gpt-image-1`
- Endpoint: `https://api.openai.com/v1/images/edits`
- Quality: `medium` (fastest, 30–60s/image)
- M2 cost: ~$0.04–0.06/room
- M3 cost: ~$0.04–0.08/room
- localStorage key: `rev_openai_key`
- **Required** for real renders — free tier won't work, needs billing credits

---

## State Object

```javascript
const S = {
  propName: '',           // property name string
  rooms: [],              // array of room objects (see Room Schema below)
  activeRoom: 0,          // index of selected room in M3
  activeView: 0,          // index of selected view within active room
  preset: 'Revelere Core', // active style variant
  signatureMoment: false,  // signature moment toggle
  coreEnabled: true,       // Revelere Core base prompt toggle
  moodLevel: 50,           // 0=Dark & Cinematic, 100=Light & Airy
  anthKey: '',             // Anthropic API key (in-memory)
  openaiKey: '',           // OpenAI API key (in-memory)
  sourcing: {},            // { [roomId]: Item[] }
  activeSourcingRoom: null,
  pinterestRefs: [],       // Pinterest saved items (see schema below)
  pastPurchases: [],       // Prior project items (see schema below)
  pastedLinks: [],         // User-pasted product links
};
```

### Room Schema

```javascript
{
  id: number,              // Date.now() + Math.random()
  name: string,            // editable display name
  type: string,            // one of TYPES array
  src: string,             // base64 data URL of original photo
  empty: string | null,    // base64 data URL of empty room (API result)
  emptyCanvas: HTMLCanvasElement | null, // canvas fallback if no API
  after: string | null,    // base64 data URL of after render (view 0)
  brief: object | null,    // design brief from M3
  aiLabeled: boolean,      // was room type detected by Claude Vision?
  views: [                 // multiple angles of same room
    {
      src: string | null,
      empty: string | null,
      emptyCanvas: HTMLCanvasElement | null,
      after: string | null,
    }
  ]
}
```

### Sourcing Item Schema

```javascript
{
  id: string,              // 'item_' + timestamp + random
  category: string,        // 'Seating' | 'Lighting' | 'Tables' | 'Textiles' | 'Decor' | 'Furniture' | 'Accessories' | 'Signature' | 'Other'
  name: string,
  vendor: string,
  price: number,           // USD, already multiplied by budget tier
  comm: number,            // affiliate commission %, boosted for preset-aligned vendors
  image: string,           // product image URL (Unsplash CDN or real product)
  link: string,            // direct product URL (or '' if not yet set)
  status: string,          // 'pending' | 'accepted' | 'rejected'
  sourceType: string,      // 'ai' | 'pinterest' | 'past_project' | 'user_added'
  notes: string,           // designer notes
  rationale: string,       // AI-generated why-this-item copy
  altSuggestions: array,   // saved replacement directions
  emoji: string,           // category fallback display
}
```

---

## Prompt Architecture (M3)

Every render fires a stacked prompt — order matters:

1. **Revelere Core** (locked base — can be toggled off)
2. **Mood modifier** (from moodLevel slider: Dark/Balanced/Light)
3. **Style variant** (Mountain / Desert / Coastal / City)
4. **Room type instruction** (10 room types, each with specific brief)
5. **Signature Moment** (if toggle enabled)
6. **Location context** (influences materials and palette)
7. **Designer notes** (freeform)
8. **Final quality instruction**

### Revelere Core Prompt (exact text)
```
Transform this exact room into a high-end Revelere interior design.
DO NOT change the structure in any way. Keep all walls, windows, ceiling height, layout, and perspective exactly as-is.
Design in a cinematic, moody, editorial luxury style with a strong emotional atmosphere. The space should feel like a scene from a film, not a staged room.
Apply the Revelere Design DNA:
- Cinematic layered lighting: warm, dimmable, ambient glow, no harsh overhead lighting
- Elevated natural materials: real wood, stone, linen, soft textures
- Sensory luxury: plush fabrics, inviting bedding, tactile finishes
- Story-driven styling: subtle narrative elements, not cluttered
- Connection-focused layout: inviting, livable, intimate
Color palette: warm neutrals (egret white, soft taupe, warm ivory), deep accents (charcoal, bronze, muted plum), natural wood tones.
Design rules: include one strong focal point, include at least one sculptural or statement piece, avoid generic or mass-produced styling, keep the design refined, layered, and intentional.
Lighting must feel warm, romantic, and cinematic.
The result should feel like a luxury boutique hotel meets a high-end editorial shoot.
```

### Style Variants
- **Mountain:** Rich wood tones, stone elements, cozy textiles, warm intimate lighting. Refined high-end cabin, not rustic.
- **Desert:** Earth tones (sand/clay/terracotta), plaster textures, organic shapes. Warm, calm, architectural.
- **Coastal:** Ocean-inspired neutrals, light wood, airy textures. Breezy, elevated, not nautical.
- **City:** Deep tones (charcoal/black/bronze), sleek materials, sculptural furniture. Bold penthouse/boutique hotel feel.

---

## Sourcing System (M4)

### How sourcing generation works

`buildSourcingForRoom(room)` runs when user clicks "Generate sourcing":

1. Gets base items from `SOURCING_CATALOGUE[roomType]`
2. Applies budget multiplier (Ultra Luxury 1.35x → Value 0.55x)
3. Boosts commission +2% for preset-aligned vendors (capped at 25%)
4. Injects matching `S.pinterestRefs` items (sourceType: 'pinterest')
5. Injects matching `S.pastPurchases` items (sourceType: 'past_project')
6. Prepends Signature Moment item if toggle enabled
7. Enriches rationale with style context + location note

### Budget tier multipliers
| Tier | Multiplier |
|------|-----------|
| Ultra Luxury ($15,000+) | × 1.35 |
| High-end ($8,000–$15,000) | × 1.00 |
| Mid-market ($4,000–$8,000) | × 0.75 |
| Value ($2,000–$4,000) | × 0.55 |

### Vendor affinity by style variant
| Variant | Boosted vendors |
|---------|----------------|
| Mountain | RH, Article, Four Hands, Pottery Barn |
| Desert | McGee & Co., Farmhouse Pottery, Serena & Lily |
| Coastal | Serena & Lily, Pottery Barn, West Elm |
| City | CB2, Herman Miller, Visual Comfort, Four Hands |

### Link resolution
`getSearchUrl(item)` builds a search URL when no direct product link exists:
- Amazon-friendly vendors → `amazon.com/s?k={name+vendor}`
- All others → `google.com/search?q={name+vendor}&tbm=shop`

Items with real product links show "View ↗". Items without show "Search ↗" + "+ Pin link" to add a direct URL.

---

## Design Book (M5)

### Three themes
- **Ultra Minimal:** Background `#1B1B1B`, text `#D6C8B3`, accent `#A67C52`
- **Soft Editorial:** Background `#FAF7F3`, text `#1B1B1B`, accent `#A67C52`
- **Cinematic:** Background `#1e1a14` with radial amber gradient, text `#D6C8B3`

### Page structure
1. Cover — full-bleed hero (best after render), REVELERE wordmark, property name
2. Index — numbered room list
3. Per-room pages (one per room):
   - Original · Empty · Revelere Vision photo strip
   - Design Notes: Design Intent · Experience Layer · Material Language (AI-written)
   - Lighting Scene (3 columns)
   - Mood grid (4 accepted sourcing item thumbnails)
4. Extra view pages (for rooms with multiple views — "Signature View" pages)
5. Sourcing pages (one per room with accepted items)
6. Next Steps checklist

### AI-written design notes
`generateRoomNotes(room)` calls `claude-haiku-4-5-20251001` with a prompt requesting JSON:
```json
{
  "intent": "Design intent paragraph",
  "experience": "Guest experience layer paragraph",
  "materials": "Material language paragraph",
  "lighting": "Lighting scene paragraph"
}
```
Falls back to `getDefaultNotes(room)` if Anthropic key not set.

### Image handling
`toImgSrc(dataUrl)` converts base64 data URLs to `blob://` URLs for reliable browser rendering. `revokeBookBlobUrls()` cleans them up on each regenerate.

### PDF export
Opens formatted HTML as a blob URL in a new tab. Print dialog fires automatically after 800ms (waits for fonts + images). User selects "Save as PDF" from browser print dialog.

---

## Brand System

### Colors
```css
--charcoal: #1B1B1B    /* primary dark, sidebar */
--taupe: #D6C8B3       /* sidebar text, secondary */
--accent: #A67C52      /* CTAs, active states, borders */
--ivory: #F5F2EE       /* page background */
--ivory-dark: #EDE9E3  /* card backgrounds, hover */
--muted: #8A7E70       /* body text, labels */
--muted-light: #B8AFA4 /* disabled, placeholder */
```

### Typography
- **Display/headings:** Cormorant Garamond (Google Fonts)
- **Body/UI:** DM Sans (Google Fonts)
- **Print fallback:** Georgia (headings), Arial (body)

### Tagline
*Cinematic. Intentional. Unforgettable.*

---

## Key Functions Reference

### M1 Upload
- `handleFiles(files)` — processes uploaded photos, detects room types
- `detectRoomType(base64, filename)` — calls Claude Vision or falls back to filename guess
- `guessFromFilename(fn)` — keyword matching fallback

### M2 Empty Rooms
- `genEmpty(roomId)` — calls OpenAI inpainting or canvas fallback
- `uploadEmptyPhoto(roomId, input)` — upload your own empty photo
- `applyEmptyRoomEffect(imgEl)` — canvas desaturate/brighten fallback

### M3 AI Design
- `generateAfter()` — builds stacked prompt, calls OpenAI, saves to active view
- `getMoodPrompt(level)` — returns lighting atmosphere text for slider position
- `onCoreToggle()` — enables/disables Revelere Core prompt
- `addView()` — adds a second/third angle for a room
- `setActiveView(i)` — switches active view
- `uploadAfterPhoto(input)` — upload your own after photo

### M4 Sourcing
- `buildSourcingForRoom(room)` — generates item list from catalogue + refs
- `generateAlternativeItem(oldItem, room)` — returns different item from ALTERNATIVE_POOL
- `normalizeRetailItem(raw, overrides)` — enforces full item schema
- `getFallbackImage(item)` — category-specific fallback image URL
- `getSearchUrl(item)` — builds Amazon or Google Shopping search URL
- `toggleRoomItem(roomId, itemId, btn)` — accept/pending toggle
- `rejectRoomItem(roomId, itemId, btn)` — reject toggle
- `swapRoomItem(roomId, itemId)` — replace with alternative from pool
- `saveCustomItem()` — adds user_added item to active room

### M5 Design Book
- `buildDesignBook()` — async, generates all pages, writes to preview
- `generateRoomNotes(room)` — calls Claude API for editorial copy
- `getDefaultNotes(room)` — preset-aware fallback copy
- `toImgSrc(dataUrl)` — converts base64 to blob URL for rendering
- `exportBookPDF()` — opens print-ready window as blob URL

### Utilities
- `makeItemId()` — generates unique item ID
- `getEmptySrc(room)` — returns best available empty image for a room
- `resizeToExact(dataUrl, w, h)` — canvas resize for OpenAI pixel limits
- `convertToPng(dataUrl)` — ensures PNG format for OpenAI
- `showToast(message, isError)` — brief notification
- `loadSavedKeys()` — restores API keys from localStorage
- `updateTopbarKeyStatus()` — updates topbar key indicator pills
- `openKeyModal()` / `saveModalKeys()` — key entry modal

---

## Data Catalogues

### Room types (TYPES array)
Living Room, Primary Suite, Kitchen, Guest Bedroom, Office, Dining Room, Outdoor Space, Bathroom, Media Room, Entryway

### SOURCING_CATALOGUE
10 room types × 6–8 items each. Every item has:
- category, name, vendor, price, comm, emoji
- image: Unsplash CDN URL (realistic category-appropriate photo)
- link: real vendor category page (not specific product — see open items)
- rationale: design-aware copy explaining why this item was selected

### ALTERNATIVE_POOL
7 categories × 2–4 items each. Used by `generateAlternativeItem()` to swap in a different vendor/style at similar price point.

### SIGNATURE_ITEMS
One per room type. Prepended to sourcing list when Signature Moment is enabled. Higher price point, distinctive items.

### CATEGORY_FALLBACK_IMAGES
Category-specific Unsplash images used when item.image is empty.

---

## Open Items / Next Steps

### High priority
- [ ] **Real product links** — catalogue items point to category pages, not specific products. Need Mantis API connection or manual curation of real product URLs per item
- [ ] **Supabase migration** — move from in-memory state to persistent database so projects survive page reload
- [ ] **User auth** — login so Amy can have multiple properties saved
- [ ] **HEIC support** — iOS camera photos in HEIC format need conversion before canvas processing

### Medium priority
- [ ] **Mantis API** — confirm if API exists for live product sourcing. If not, build CSV import workflow
- [ ] **Canva API push** — test Canva API template auto-populate capability for Design Book
- [ ] **Server-side PDF** — Puppeteer on Vercel for pixel-perfect Design Book PDF (replaces browser print)
- [ ] **Batch room generation** — generate all rooms simultaneously instead of one at a time
- [ ] **Pinterest scraping** — auto-populate S.pinterestRefs from a Pinterest board URL

### Nice to have (v2)
- [ ] Multi-property dashboard with real project cards
- [ ] Live affiliate API (instead of static commission estimates)
- [ ] Client portal — view-only Design Book share link
- [ ] Mobile-responsive layout
- [ ] Property cover photo upload (for Design Book cover)

---

## Production Migration Plan

### Phase 1 — Deploy prototype as-is
1. GitHub repo: `revelere-studio`, file as `index.html` at root
2. Connect to Vercel — auto-deploys on push
3. Custom domain: `studio.revelere.com` (eventually)
4. Keys now persist properly tied to the domain (not a local file)

### Phase 2 — Add persistence (Supabase)
1. Create Supabase project
2. Tables: `properties`, `rooms`, `sourcing_items`, `design_notes`
3. Storage bucket: `room-images` (store base64 → actual files)
4. Auth: email magic link for Amy's login
5. Port state management to Supabase client calls

### Phase 3 — Next.js migration
1. Create Next.js app
2. Port each module to a React component
3. API routes replace direct browser API calls (hides API keys server-side)
4. Keep all existing logic — just wrap in components

### Phase 4 — Live sourcing
1. Mantis API or CSV pipeline for real product data
2. Amazon affiliate API for real commission tracking
3. Pinterest API for board scraping

---

## Known Bugs / Quirks

1. **localStorage cleared on new file download** — when `index.html` is re-downloaded, the browser treats it as a new origin and clears localStorage. Fixed by deploying to a real URL (Phase 1).

2. **Canvas-based empty room effect is obviously fake** — the grayscale/brighten canvas effect is a visual placeholder. The real OpenAI inpainting looks dramatically better. Always demo with a real API key.

3. **base64 → blob URL conversion** — photos stored as base64 strings need `toImgSrc()` before being written into Design Book `innerHTML`, or browsers block rendering. This is handled — but if images ever stop showing in the book, check that `toImgSrc()` is being called.

4. **OpenAI image format** — `gpt-image-1` requires PNG format. `convertToPng()` handles this. If you change the image pipeline, keep this conversion.

5. **120s timeout on generation** — OpenAI renders can take 30–90 seconds. There's an AbortController timeout at 120s that surfaces a clean error. Don't lower this.

6. **Multiple views init** — `room.views` is lazily initialised on first access (not created at upload time). Code that accesses `room.views` must check for null first.

---

## File Structure (prototype)

```
index.html          — The entire app. ~3,300 lines.
  ├── <style>       — All CSS (~230 lines)
  ├── HTML          — All page markup (~430 lines)  
  └── <script>      — All JavaScript (~2,640 lines)
      ├── State     — S object, TYPES array
      ├── Nav       — navigation, toast
      ├── API keys  — modal, topbar status, localStorage
      ├── M1        — room detection, upload handling
      ├── M2        — empty room generation, canvas effect
      ├── M3        — prompt system, generateAfter, view management
      ├── M4        — sourcing catalogues, generation, UI
      ├── M5        — Design Book builder, PDF export
      └── Dashboard — progress tracking
```

---

## How to Continue in Claude Code

1. Read this entire file first
2. Open `index.html` — the full working prototype is there
3. For any feature work, search for the relevant function name (all documented above)
4. Test changes by opening `index.html` in a browser — no build step needed
5. When migrating to Next.js, port module by module, starting with M1

The app works. The prototype is complete. Your job is to productionise it, not rebuild it.

---

*Revelere Studio — Cinematic. Intentional. Unforgettable.*
*Built with Claude · April 2026*
