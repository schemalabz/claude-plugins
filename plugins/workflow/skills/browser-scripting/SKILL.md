---
name: browser-scripting
description: Access the web programmatically — READ a page's content as clean markdown, or OPERATE a real browser (navigate, click, screenshot, intercept network). Use when reading a JS-heavy page, verifying browser behaviour, or scripting a browser.
---

# Web access: read vs operate

Pick by intent:

- **Read a page's content** (article, docs, product info) → `page-read <url>` — cheap, clean markdown; renders JS only when needed. Add `--json` for `{markdown, title, tier}`. Replaces fetcher.
- **Operate / observe** (click, fill, screenshot, intercept network) → write an ESM script and run it with `playwright-run script.mjs`.

Neither defeats bot-managed sites: Cloudflare/DataDome challenge pages ("Just a moment…", "Verify you are human") come back regardless of tool or IP — that's the site blocking automation, not a bug. Don't loop retrying; note it and move on.

## Runtime

Both commands come from the team toolkit flake. Resolve them in this order:

1. **Already on `PATH`** (`command -v page-read`) — use directly. NixOS machines
   install them into the system profile, so there is no per-call overhead.
2. **Otherwise via nix** — prefix every invocation:
   `nix run github:schemalabz/toolkit/v2026.8.1#page-read -- <url>`
   `nix run github:schemalabz/toolkit/v2026.8.1#playwright-run -- script.mjs`
3. **No nix at all** — stop and tell the user to install it, then retry:
   `curl -fsSL https://install.determinate.systems/nix | sh -s -- install`
   Do NOT install Playwright yourself, and do NOT run `npx playwright install`.

The first `nix run` downloads ~240 MB of prebuilt browsers, once; afterwards it
is store-cached. To skip flake resolution entirely:
`nix profile install github:schemalabz/toolkit/v2026.8.1#page-read` — which
promotes you to case 1.

## playwright-run

`playwright-run script.mjs [args...]` — node + a matched nix Playwright + Chromium, sanitized env so the browser launches even inside a project `nix develop`.

Import via the env var (ESM ignores NODE_PATH):

    const pw = await import(process.env.PLAYWRIGHT);
    const { chromium } = pw.default ?? pw;
    const browser = await chromium.launch();       // { headless: false } to watch
    const page = await browser.newPage();
    page.on('request', (r) => { if (r.url().includes('_rsc=')) console.log('RSC', r.url()); });
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    console.log(await page.title());
    await browser.close();

Notes:

- Scripts are `.mjs`; top-level await is fine. The browser is nix-provided — don't `npx playwright install`.
- **Dev servers compile routes on first hit** — after navigate/click, wait for `networkidle` (or the "Compiling…" overlay to clear) before screenshotting, or you capture a half-rendered page.
- Screenshot loop for feature work: a small `shot.mjs` that navigates then `page.screenshot({ path, fullPage: true })`, then `Read` the PNG.
- Selectors: prefer `href`/role locators; some "cards" are `div`s with onClick, not anchors.
- Live/map pages never reach `networkidle`; use `domcontentloaded` + explicit waits.

## Attaching images/videos to a GitHub comment

Uploading media to a GitHub PR/issue comment needs a logged-in browser session (the user-attachments CDN has no API). See `references/github-image-upload.md` for the hybrid recipe — scrape the hosted URLs via Playwright, then post the comment with `gh api` — plus the bundled `scripts/gh-login.mjs`, `gh-upload.mjs`, and `gh-verify.mjs`.
