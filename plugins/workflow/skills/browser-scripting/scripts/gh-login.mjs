// Capture a GitHub browser session (storageState) for later automated uploads.
// Usage: DISPLAY=:0 playwright-run gh-login.mjs [out-session.json]   (headed; log in when the window opens)
const pw = await import(process.env.PLAYWRIGHT);
const { chromium } = pw.default ?? pw;
const out = process.argv[2] || ".scratch/gh-session.json";

const b = await chromium.launch({ headless: false });
const c = await b.newContext();
const p = await c.newPage();
await p.goto("https://github.com/login", { waitUntil: "domcontentloaded" });

for (let i = 0; i < 120; i++) {
  await p.waitForTimeout(2000);
  const ck = await c.cookies("https://github.com");
  if (ck.some((x) => x.name === "logged_in" && x.value === "yes") && ck.some((x) => x.name === "user_session")) {
    await c.storageState({ path: out });
    console.log("SESSION SAVED -> " + out);
    break;
  }
}
await b.close();
