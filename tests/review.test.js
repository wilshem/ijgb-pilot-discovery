// The 2026-11-06 review of PR #2: what is offered must be what works today.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const { page, fingerprint, ROOT } = require("./harness");

const CORE = { org_name: "Example Community Foundation", contact_name: "Dana Lee", contact_email: "dana@example.org",
  timezone: "America/Chicago", mail_system: "microsoft365" };
const SOON = /available soon/i;

test("transition readiness is marked available soon, and its questions sit under that label", () => {
  const p = page();
  const suite = p.question("suites").options.find(o => o[0] === "continuity");
  assert.match(suite[2], /leadership change, grant audit or sale \(available soon\)/);
  const opt = p.question("continuity_services").options.find(o => o[0] === "readiness");
  assert.match(opt[1], SOON);
  p.set({ ...CORE, suites: ["continuity"], continuity_services: ["readiness"] });
  assert.deepEqual(p.steps().slice(6, 9), ["continuity", "readiness", "reminders"]);
  const step = p.val('STEPS.find(s => s.id === "readiness")');
  assert.match(step.title, /^Transition readiness \(available soon\)$/);
  assert.match(step.intro, /^Available soon/);
  const follow = ["readiness_review", "org_chart", "accounts_list", "staff_questionnaire", "event_dates",
    "key_relationships", "disclosures", "readiness_confirmer"];
  assert.deepEqual(p.qs("readiness").filter(id => follow.includes(id)), follow);
  for (const id of follow) assert.ok(!p.qs("continuity").includes(id), id);
  p.set({ ...CORE, suites: ["continuity"], continuity_services: ["handover"] });
  assert.ok(!p.steps().includes("readiness"));
});

test("reminders: only waiting on a reply works today; the rest are available soon; email only", () => {
  const p = page();
  const opts = p.question("reminder_kinds").options;
  for (const [v, label] of opts) {
    if (v === "waiting") assert.doesNotMatch(label, SOON);
    else assert.match(label, SOON, v);
  }
  assert.deepEqual(opts.map(o => o[0]).sort(), ["deadline", "decision", "ending", "waiting"]);
  assert.match(p.question("reminders").hint, /by email only/i);
});

test("signature text, junk senders and senders to leave out are left for the kickoff call", () => {
  const p = page();
  for (const id of ["signature_text", "junk_senders", "ignore_senders"]) assert.equal(p.question(id), undefined, id);
  assert.match(p.val('STEPS[0].intro'), /about 20 to 30 minutes for most organizations/);
});

test("the email summary says the written summary uses AI only with written approval", () => {
  const p = page();
  const opt = p.question("continuity_services").options.find(o => o[0] === "summary");
  assert.match(opt[2], /AI/);
  assert.match(opt[2], /written approval/);
});

test("retention periods are shown only to clients IJGB hosts", () => {
  const p = page();
  for (const [hosting, shown] of [["s3", true], ["local", false], ["not_sure", false], [undefined, false]]) {
    p.set({ ...CORE, hosting, retention_change: "yes" });
    assert.equal(p.qs("security").includes("retention_change"), shown, String(hosting));
    assert.equal(p.qs("security").includes("retention_detail"), shown, String(hosting));
  }
});

test("Clarity says hosted agreements are processed on IJGB's encrypted work machine", () => {
  const p = page();
  const intro = p.val('STEPS.find(s => s.id === "clarity").intro');
  assert.match(intro, /IJGB's own encrypted work machine/);
  assert.match(intro, /not in the dedicated cloud account/);
  assert.doesNotMatch(intro, /own (cloud |AWS )?account/i);
});

test("America/Coyhaique is offered", () => {
  const p = page();
  assert.ok(p.val("ZONE_NAMES").includes("America/Coyhaique"));
});

test("the version fingerprint covers the shared helpers and each step's note", () => {
  const base = fingerprint(page());
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const [a, b] of [
    ['const isMs = a => a.mail_system === "microsoft365";', 'const isMs = a => a.mail_system === "microsoft";'],
    ['const anySuite = a => ["memory", "continuity", "clarity"]', 'const anySuite = a => ["memory", "continuity"]'],
    ['note: "Your progress is saved in this browser', 'note: "Your answers are saved in this browser'],
  ]) {
    assert.equal(html.split(a).length, 2, a);
    assert.notEqual(fingerprint(page({ html: html.replace(a, b) })), base, b);
  }
  // A comment or blank line alone does not change it.
  assert.equal(fingerprint(page({ html: html.replace("// ---- questions ----", "// ---- questions ----\n// a note\n") })), base);
});

test("recheck: reminders are offered with some plans, confirmed at the kickoff call, about waiting replies", () => {
  const p = page();
  const q = p.question("reminders");
  assert.doesNotMatch(q.label, /deadline/i);
  assert.match(q.label, /repl(y|ies)/i);
  assert.match(q.hint, /offered with some plans/);
  assert.match(q.hint, /confirmed at the kickoff call/);
  assert.match(q.hint, /email only/);
  const kinds = p.question("reminder_kinds").options;
  assert.equal(kinds[0][0], "waiting");
  for (const [v, label] of kinds.slice(1)) assert.match(label, /\(available soon\)$/, v);
});

test("recheck: the intro gives the time for most organizations", () => {
  const p = page();
  assert.match(p.val("STEPS[0].intro"),
    /about 20 to 30 minutes for most organizations; longer if you add detail or choose every suite\./);
});

test("a second version on one day is written YYYY-MM-DD.N", () => {
  const p = page();
  assert.match(p.ev("FORM_VERSION"), /^\d{4}-\d{2}-\d{2}(\.[2-9]|\.[1-9]\d+)?$/);
});
