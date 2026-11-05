// Loads the page in jsdom, and Code.gs in a sandbox with stand-ins for Google's services.
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const CODE = fs.readFileSync(path.join(ROOT, "Code.gs"), "utf8");
const LIVE = "https://wilshem.github.io/ijgb-pilot-discovery/";

// The page at a URL (the live site by default). fetch is replaced so nothing leaves the machine;
// sent holds each request the page made.
function page({ url = LIVE, answers = null } = {}) {
  const sent = [];
  const dom = new JSDOM(HTML, {
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
    w, sent, ev, val,
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

// What identifies the questions: their ids, types, words, options and when they show. Any change
// to these needs a new FORM_VERSION.
function fingerprint(p) {
  const text = p.ev(`JSON.stringify({
    steps: STEPS.map(s => ({ id: s.id, title: s.title, intro: s.intro || "", show: s.show ? String(s.show) : "",
      qs: (s.qs || []).map(q => ({ id: q.id, type: q.type, label: q.label, hint: q.hint || "", req: !!q.req,
        store: q.store || "", show: q.show ? String(q.show) : "",
        options: typeof q.options === "function" ? String(q.options) : (q.options || []) })) })),
    zones: ZONES, names: ZONE_NAMES })`);
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
