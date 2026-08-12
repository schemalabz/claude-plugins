// Verify user-attachments URLs resolve, via an authenticated GitHub session.
// (Anonymous curl 404s until the referencing comment is posted — this uses the session instead.)
// Usage: playwright-run gh-verify.mjs <session.json> <url> [url...]
const pw = await import(process.env.PLAYWRIGHT);
const { chromium } = pw.default ?? pw;
const [session, ...urls] = process.argv.slice(2);
if (!session || !urls.length) {
  console.error("usage: gh-verify.mjs <session.json> <url> [url...]");
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: session });
for (const u of urls) {
  const r = await ctx.request.get(u);
  console.log(`${r.status()}\t${r.headers()["content-type"] || ""}\t${u}`);
}
await browser.close();
