// Does the deployed Code.gs accept what the pages send? Run by CI (.github/workflows/deployed-script.yml)
// on every pull request, after each merge and daily: `node check-deployed.js`. It asks the deployed
// script for its versions (Code.gs doGet) and fails when
//   - a page (this checkout's index.html, or the live site) sends a FORM_VERSION it does not accept,
//   - Code.gs in this checkout lists a version the deployed script lacks (Code.gs not redeployed),
//   - the script has no version list (an old deployment), or
//   - its reply lacks Access-Control-Allow-Origin, so the page could not read "ok" and would show an error.
// It only reads: a GET, which writes nothing to the sheet.
const fs = require("fs"), path = require("path");

const LIVE = "https://wilshem.github.io/ijgb-pilot-discovery/";
const PAGE_ORIGIN = "https://wilshem.github.io";
const REDEPLOY = "Redeploy Code.gs (README, \"If you change Code.gs later\"), then run this check again.";

const constant = (html, name) => { const m = html.match(new RegExp(`const ${name} = "([^"]*)"`)); return m ? m[1] : null; };

// pages: { label: html }, codeVersions: the VERSIONS keys in this checkout's Code.gs,
// get(url, headers): a fetch-like GET. Returns a list of problems (empty when all is well).
async function checkDeployed({ pages, codeVersions, get }) {
  const problems = [];
  const urls = [...new Set(Object.values(pages).map(h => constant(h, "SHEET_URL")).filter(Boolean))];
  if (urls.length !== 1) return [`expected one SHEET_URL in the pages, found ${urls.length}`];
  let res, body;
  try {
    res = await get(urls[0], { Origin: PAGE_ORIGIN });
    body = await res.text();
  } catch (e) { return [`could not reach the deployed script: ${e.message}`]; }
  const acao = res.headers.get("access-control-allow-origin");
  if (acao !== "*" && acao !== PAGE_ORIGIN) {
    problems.push(`the deployed script's reply has no Access-Control-Allow-Origin for ${PAGE_ORIGIN} (got ${acao}): the page could not read it`);
  }
  let deployed;
  try { deployed = JSON.parse(body).versions; } catch (e) { deployed = null; }
  if (!Array.isArray(deployed)) {
    problems.push(`the deployed script has no version list (HTTP ${res.status}); it is older than this check. ${REDEPLOY}`);
    return problems;
  }
  for (const [label, html] of Object.entries(pages)) {
    const v = constant(html, "FORM_VERSION");
    if (!v) problems.push(`${label}: no FORM_VERSION found`);
    else if (!deployed.includes(v)) problems.push(`${label} sends FORM_VERSION ${v}, which the deployed script does not accept (it accepts ${deployed.join(", ")}): its rows are refused. ${REDEPLOY}`);
  }
  const missing = codeVersions.filter(v => !deployed.includes(v));
  if (missing.length) problems.push(`Code.gs here lists ${missing.join(", ")}, which the deployed script lacks. ${REDEPLOY}`);
  return problems;
}

async function main() {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const code = fs.readFileSync(path.join(root, "Code.gs"), "utf8");
  const block = code.slice(code.indexOf("const VERSIONS = {"), code.indexOf("\n};", code.indexOf("const VERSIONS = {")));
  const codeVersions = [...block.matchAll(/^  "([^"]+)": \[/gm)].map(m => m[1]);
  const get = (url, headers) => fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(30000) });
  const pages = { "this checkout's index.html": html };
  try {
    const live = await get(LIVE, {});
    if (live.ok) pages["the live site"] = await live.text();
    else console.log(`note: the live site answered HTTP ${live.status}; checking this checkout only`);
  } catch (e) { console.log(`note: could not read the live site (${e.message}); checking this checkout only`); }
  const problems = await checkDeployed({ pages, codeVersions, get });
  for (const label of Object.keys(pages)) console.log(`${label}: FORM_VERSION ${constant(pages[label], "FORM_VERSION")}`);
  console.log(`Code.gs here: ${codeVersions.join(", ")}`);
  if (problems.length) { for (const p of problems) console.error("FAIL: " + p); process.exit(1); }
  console.log("OK: the deployed script accepts every version above, and the page can read its replies.");
}

if (require.main === module) main();
module.exports = { checkDeployed };
