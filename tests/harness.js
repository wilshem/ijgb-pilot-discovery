// Loads the page in jsdom, and Code.gs in a sandbox with stand-ins for Google's services.
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const CODE = fs.readFileSync(path.join(ROOT, "Code.gs"), "utf8");
const LIVE = "https://wilshem.github.io/ijgb-pilot-discovery/";

// The page at a URL (the live site by default). fetch is replaced so nothing leaves the machine;
// sent holds each request the page made.
function page({ url = LIVE, answers = null, html = HTML } = {}) {
  const sent = [];
  const dom = new JSDOM(html, {
    url, runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = async (u, opts) => { sent.push({ url: u, opts }); return { ok: true }; };
      w.scrollTo = () => {};
      if (answers) w.localStorage.setItem("ijgb-discovery:general", JSON.stringify({ step: "about", a: answers, submitted: false }));
    },
  });
  const w = dom.window;
  const ev = s => w.eval(s);
  // Values from the page, as plain data from this side (jsdom's arrays belong to another realm).
  const val = s => { const t = w.eval(`JSON.stringify(${s})`); return t === undefined ? undefined : JSON.parse(t); };
  return {
    w, sent, ev, val, html,
    set(a) { w.eval(`st.a = ${JSON.stringify(a)}; render();`); },
    steps() { return val("visibleSteps().map(s => s.id)"); },
    qs(step) { return val(`visibleQs(STEPS.find(s => s.id === ${JSON.stringify(step)})).map(q => q.id)`); },
    record() { return JSON.parse(w.eval("JSON.stringify(record())")); },
    question(id) { return val(`STEPS.flatMap(s => s.qs || []).find(q => q.id === ${JSON.stringify(id)})`); },
  };
}

// Every question id the page can put in a row: timezone_other is folded into timezone, and
// timezone_label is added.
function pageKeys(p) {
  const ids = p.val("STEPS.flatMap(s => (s.qs || []).map(q => q.id))");
  return ids.filter(i => i !== "timezone_other").concat(["timezone_label"]).sort();
}

// What identifies the questions: the page's whole question section, from "// ---- questions ----" to
// "// ---- state ----": the shared helpers that decide what shows (has, wants, usesRecords, anySuite, ...),
// the time zones and every step with its title, intro, note and questions. Lines that are only comments,
// and spacing, are left out. Any other change there needs a new FORM_VERSION.
function fingerprint(p) {
  const start = p.html.indexOf("// ---- questions ----"), end = p.html.indexOf("// ---- state ----");
  if (start < 0 || end < start) throw new Error("index.html lost its question section markers");
  const text = p.html.slice(start, end).split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//"))
    .join("\n").replace(/[ \t]+/g, " ");
  return crypto.createHash("sha256").update(text).digest("hex");
}

function receiver() {
  let header = [];
  const rows = [];
  const sheet = {
    getLastRow: () => (header.length ? 1 + rows.length : 0),
    getLastColumn: () => header.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => [header.slice(0, nc)],
      setValues: v => { header = header.slice(0, c - 1).concat(v[0]); },
    }),
    setFrozenRows() {},
    appendRow: r => rows.push(r),
  };
  const ctx = vm.createContext({
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    ContentService: { createTextOutput: m => m },
  });
  vm.runInContext(CODE, ctx);
  return {
    post: body => ctx.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } }),
    rows, header: () => header,
    get: name => vm.runInContext(name, ctx),
    val: name => JSON.parse(vm.runInContext(`JSON.stringify(${name})`, ctx)),
  };
}

module.exports = { page, pageKeys, fingerprint, receiver, HTML, CODE, LIVE, ROOT };
