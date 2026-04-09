# Revelere Studio

> AI-powered STR interior design workflow — from property photos to branded Design Book.

## What it does

1. **Upload** property photos — Claude Vision auto-labels each room
2. **Empty rooms** — OpenAI removes all furniture, leaving the architectural shell
3. **AI Design** — stacked prompt system generates luxury after renders (Revelere Core + style variants + mood control)
4. **Source** — room-aware product sourcing with affiliate scoring, Pinterest refs, past purchases
5. **Design Book** — AI-written design notes, 3 themes, PDF export

## Quick start

Open `index.html` in any modern browser. No build step, no server needed.

Add your API keys via the status pills in the top right corner:
- **OpenAI key** — required for image generation (M2 + M3)
- **Anthropic key** — optional, for Claude Vision room detection (M1)

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect this repo to [vercel.com](https://vercel.com) for automatic deploys on push.

## Project structure

```
index.html    — Complete app (HTML + CSS + JS, ~3,300 lines)
CLAUDE.md     — Full technical handoff for Claude Code
vercel.json   — Vercel deployment config
package.json  — Project metadata
```

## For Claude Code

Read `CLAUDE.md` first. It contains the complete architecture, every function documented, all open items, and the production migration plan.

---

*Revelere — Cinematic. Intentional. Unforgettable.*
