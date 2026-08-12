// Upload files into a GitHub PR/issue comment box, scrape their user-attachments URLs, abandon the draft.
// Nothing is posted — the assets persist on GitHub's CDN once uploaded; embed the URLs in a comment via `gh api`.
// Usage: playwright-run gh-upload.mjs <session.json> <pr-or-issue-url> <file> [file...]
const pw = await import(process.env.PLAYWRIGHT);
const { chromium } = pw.default ?? pw;
const [session, url, ...files] = process.argv.slice(2);
if (!session || !url || !files.length) {
  console.error("usage: gh-upload.mjs <session.json> <pr-or-issue-url> <file> [file...]");
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: session });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

const ta = page.locator('#new_comment_field, textarea[name="comment[body]"]').last();
await ta.scrollIntoViewIfNeeded().catch(() => {});
await ta.click().catch(() => {});

const re = /https:\/\/github\.com\/user-attachments\/assets\/[\w-]+/;
const out = {};
for (const f of files) {
  const before = await ta.inputValue();
  await page.locator("input[type=file]").last().setInputFiles(f);
  let got = null;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const added = (await ta.inputValue()).slice(before.length);
    const m = added.match(re);
    if (m && !added.includes("Uploading")) { got = m[0]; break; }
  }
  out[f] = got;
  console.log(`${f}\t${got || "FAILED"}`);
}
await ta.fill(""); // abandon draft — nothing is posted; uploaded assets stay live
await browser.close();
console.log("JSON " + JSON.stringify(out));
