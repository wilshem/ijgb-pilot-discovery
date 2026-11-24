// Sends one row from the live discovery form, as a person would, and passes only if the page shows
// "Thank you" (which it does only when Code.gs replies "ok"). Run by .github/workflows/live-submit.yml:
// `node live-submit.js <commit>`. It first waits until the live site serves that commit's index.html,
// so after a merge it tests the new page. The answers are invented and tagged client=ijgb-live-test,
// which the dashboard leaves out; the row stays in the sheet (remove it there by hand if wanted).
// The answers are put in the page's own saved state, opening it at Review; the only click is Send.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const CLIENT = "ijgb-live-test";
const SITE = "https://wilshem.github.io/ijgb-pilot-discovery/";
const ANSWERS = {
  org_name: "IJGB live test (automated)", contact_name: "Live Test", contact_email: "live-test@example.org",
  timezone: "America/New_York", mail_system: "microsoft365",
  anything_else: "Automated weekly check of the live form (live-submit workflow). Not a client.",
};
// A unique query string, so the site's cache serves the current page.
const liveUrl = tag => `${SITE}?client=${CLIENT}&check=${encodeURIComponent(tag)}`;
const stored = () => ({ ["ijgb-discovery:" + CLIENT]: JSON.stringify({ step: "review", a: ANSWERS, submitted: false }) });

async function waitForPage(commit, minutes) {
  const want = execFileSync("git", ["show", `${commit}:index.html`], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
  const until = Date.now() + minutes * 60000;
  for (let n = 1; ; n++) {
    try {
      const res = await fetch(liveUrl(`${commit}-${n}`), { signal: AbortSignal.timeout(30000) });
      if (res.ok && (await res.text()) === want) return;
    } catch (e) { /* try again */ }
    if (Date.now() > until) throw new Error(`the live site did not serve index.html from ${commit} within ${minutes} minutes`);
    await new Promise(r => setTimeout(r, 20000));
  }
}

async function main() {
  const commit = process.argv[2] || "HEAD";
  const started = Date.now();
  await waitForPage(commit, 10);
  console.log(`the live site serves index.html from ${commit}`);
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, stored());
    const page = await context.newPage();
    await page.goto(liveUrl(`${commit}-send`), { waitUntil: "load" });
    await page.click('[data-act="submit"]');
    const result = await Promise.race([
      page.getByRole("heading", { name: "Thank you" }).waitFor({ timeout: 60000 }).then(() => "ok"),
      page.locator("#not-sent").waitFor({ timeout: 60000 }).then(async () => "error: " + (await page.locator("#not-sent").innerText())),
    ]).catch(e => "error: no answer within 60 seconds (" + e.message.split("\n")[0] + ")");
    if (result !== "ok") { console.error("FAIL: the live form did not say Thank you. " + result); process.exitCode = 1; return; }
    console.log(`OK: the live form sent a row tagged ${CLIENT} and showed Thank you (${Math.round((Date.now() - started) / 1000)} s).`);
  } finally { await browser.close(); }
}

if (require.main === module) main().catch(e => { console.error("FAIL: " + e.message); process.exit(1); });
module.exports = { ANSWERS, CLIENT, liveUrl, stored };
