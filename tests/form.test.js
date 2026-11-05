// The page: questions, branching, stored values, the version rule and preview.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const { page, pageKeys, fingerprint, receiver, HTML, CODE, ROOT } = require("./harness");

const CORE = { org_name: "Example Community Foundation", contact_name: "Dana Lee", contact_email: "dana@example.org",
  timezone: "America/Chicago", mail_system: "microsoft365" };

test("every question has a unique id, a known type and options where it needs them", () => {
  const p = page();
  const qs = p.val("STEPS.flatMap(s => s.qs || [])");
  const ids = qs.map(q => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const q of qs) {
    assert.ok(["text", "email", "tel", "date", "textarea", "choice", "multi", "select"].includes(q.type), q.id);
    if (["choice", "multi", "select"].includes(q.type)) assert.ok(p.ev(`optsOf(STEPS.flatMap(s => s.qs || []).find(q => q.id === "${q.id}")).length`) > 0, q.id);
  }
});

test("the core is the same for everyone; suite sections appear only when chosen", () => {
  const p = page();
  p.set(CORE);
  assert.deepEqual(p.steps(), ["about", "org", "mail", "mailboxes", "hosting", "suites", "security", "review"]);
  p.set({ ...CORE, suites: ["memory"] });
  assert.deepEqual(p.steps(), ["about", "org", "mail", "mailboxes", "hosting", "suites", "memory", "reminders", "security", "review"]);
  p.set({ ...CORE, suites: ["continuity", "clarity"] });
  assert.deepEqual(p.steps(), ["about", "org", "mail", "mailboxes", "hosting", "suites", "continuity", "clarity", "reminders", "security", "review"]);
  p.set({ ...CORE, suites: ["not_sure"] });
  assert.ok(!p.steps().includes("reminders"));
});

test("the deal-journey section appears only when asked for, under Continuity", () => {
  const p = page();
  p.set({ ...CORE, suites: ["continuity"] });
  assert.ok(!p.steps().includes("deal_journey"));
  p.set({ ...CORE, suites: ["continuity"], deal_journey: "yes" });
  assert.ok(p.steps().includes("deal_journey"));
  p.set({ ...CORE, suites: ["memory"], deal_journey: "yes" });
  assert.ok(!p.steps().includes("deal_journey"));
  assert.match(p.ev('STEPS.find(s => s.id === "deal_journey").intro'), /nothing here is built yet/);
});

test("Clarity is marked available soon", () => {
  const p = page();
  const opt = p.question("suites").options.find(o => o[0] === "clarity");
  assert.match(opt[1], /available soon/i);
  assert.match(p.ev('STEPS.find(s => s.id === "clarity").intro'), /^Available soon/);
});

test("summaries of emails with a contact are under Continuity, not Memory", () => {
  const p = page();
  assert.ok(p.question("continuity_services").options.some(o => o[0] === "summary"));
  assert.ok(!p.question("memory_services").options.some(o => /summar/i.test(o[1])));
  p.set({ ...CORE, suites: ["continuity"], continuity_services: ["summary"] });
  assert.ok(p.qs("continuity").includes("summary_contacts"));
  assert.ok(!p.qs("continuity").includes("handover_who"));
});

test("questions dropped or moved to the kickoff call are gone", () => {
  const p = page();
  for (const id of ["ms_licence", "g_edition", "release_statement", "redaction", "redaction_tool", "recipients",
    "disclaimers", "log_viewers", "reply_time", "notify", "change_windows", "services"]) {
    assert.equal(p.question(id), undefined, id);
  }
});

test("the time zone is stored as an IANA area and place, with its label", () => {
  const p = page();
  p.set({ ...CORE, timezone: "America/New_York" });
  let r = p.record();
  assert.equal(r.timezone, "America/New_York");
  assert.equal(r.timezone_label, "Eastern");
  assert.ok(!("timezone_other" in r));
  p.set({ ...CORE, timezone: "other", timezone_other: "Europe/Lisbon" });
  r = p.record();
  assert.equal(r.timezone, "Europe/Lisbon");
  assert.equal(r.timezone_label, "");
});

test("every time zone offered is a real IANA zone, not an old alias; never UTC or EST alone", () => {
  const p = page();
  const listed = p.val("ZONES.map(z => z[0])").concat(p.val("otherZones().map(z => z[0])"));
  assert.ok(listed.length > 400, `${listed.length} zones`);
  for (const z of listed) {
    assert.match(z, /^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/[A-Za-z0-9_+\-\/]+$/, z);
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: z }), z);
  }
  assert.ok(listed.includes("Etc/UTC"));
  assert.equal(new Set(listed).size, listed.length, "a zone is offered twice");
  // Old aliases browsers still list, which the platform refuses where its time-zone data has no aliases.
  for (const old of ["UTC", "EST", "GMT", "US/Eastern", "Asia/Calcutta", "Europe/Kiev", "America/Buenos_Aires",
    "America/Indianapolis", "Asia/Saigon", "Australia/Canberra"]) assert.ok(!listed.includes(old), old);
  for (const now of ["Asia/Kolkata", "Europe/Kyiv", "America/Argentina/Buenos_Aires", "America/Indiana/Indianapolis"]) {
    assert.ok(listed.includes(now), now);
  }
});

test("the other time zones are a real list control, required once shown", () => {
  const p = page();
  p.set({ ...CORE, timezone: "other" });
  p.ev('st.step = "org"; render();');
  const sel = p.w.document.querySelector("select#timezone_other");
  assert.ok(sel);
  assert.equal(p.w.document.querySelector('label[for="timezone_other"]').textContent.replace("*", "").trim(), "Which time zone?");
  sel.value = "Asia/Tokyo";
  sel.dispatchEvent(new p.w.Event("change", { bubbles: true }));
  assert.equal(p.record().timezone, "Asia/Tokyo");
  p.set({ ...CORE, timezone: "other" });
  p.ev('st.step = "org"');
  assert.deepEqual(p.val("missing()"), ["Which time zone?"]);
});

test("organization type: 'Something else' is stored as to confirm at onboarding, never non-profit", () => {
  const p = page();
  const vals = p.question("org_type").options.map(o => o[0]);
  assert.deepEqual(vals, ["nonprofit", "business", "public", "to confirm at onboarding"]);
  p.set({ ...CORE, org_type: "to confirm at onboarding" });
  assert.equal(p.record().org_type, "to confirm at onboarding");
  p.set({ ...CORE, org_type: "public" });
  assert.equal(p.record().org_type, "public");
  p.set(CORE);
  assert.equal(p.record().org_type, "");
});

test("mail system and hosting are stored as the settings' values", () => {
  const p = page();
  p.set({ ...CORE, mail_system: "google_workspace", hosting: "local" });
  const r = p.record();
  assert.equal(r.mail_system, "google_workspace");
  assert.equal(r.hosting, "local");
  assert.ok("g_delegation" in r && !("ms_setup" in r));
});

test("answers saved under the earlier version's values are carried over", () => {
  const p = page({ answers: { ...CORE, mail_system: "google", hosting: "onsite", org_type: "other" } });
  const a = p.val("st.a");
  assert.equal(a.mail_system, "google_workspace");
  assert.equal(a.hosting, "local");
  assert.equal(a.org_type, "to confirm at onboarding");
});

test("device encryption asks who checked it and when, only on site and only after yes", () => {
  const p = page();
  p.set({ ...CORE, hosting: "s3", device_encryption: "yes" });
  assert.ok(!p.qs("hosting").includes("encryption_checked_by"));
  p.set({ ...CORE, hosting: "local", device_encryption: "no" });
  assert.ok(!p.qs("hosting").includes("encryption_checked_by"));
  p.set({ ...CORE, hosting: "local", device_encryption: "yes" });
  assert.ok(p.qs("hosting").includes("encryption_checked_by") && p.qs("hosting").includes("encryption_checked_on"));
  assert.ok(!p.qs("hosting").includes("budget"));
});

test("retention states the standard periods and asks only about changes", () => {
  const p = page();
  const label = p.question("retention_change").label;
  for (const words of ["90 days", "35 days", "365 days"]) assert.ok(label.includes(words), words);
  p.set({ ...CORE, retention_change: "no" });
  assert.ok(!p.qs("security").includes("retention_detail"));
  p.set({ ...CORE, retention_change: "yes" });
  assert.ok(p.qs("security").includes("retention_detail"));
});

test("the action-item reminders section asks its follow-ups only after yes", () => {
  const p = page();
  assert.equal(p.ev('STEPS.find(s => s.id === "reminders").title'), "Action-item reminders");
  p.set({ ...CORE, suites: ["clarity"], reminders: "no" });
  assert.deepEqual(p.qs("reminders"), ["reminders"]);
  p.set({ ...CORE, suites: ["clarity"], reminders: "yes" });
  assert.deepEqual(p.qs("reminders"), ["reminders", "reminder_kinds", "reminder_every", "fiscal_year_start", "reminder_recipients"]);
});

test("version rule: these questions are recorded under FORM_VERSION, and no version is reused", () => {
  const p = page();
  const version = p.ev("FORM_VERSION");
  assert.match(version, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!isNaN(Date.parse(version + "T00:00:00Z")));
  const history = JSON.parse(fs.readFileSync(path.join(__dirname, "form-version.json"), "utf8"));
  const versions = history.map(h => h.version);
  assert.equal(new Set(versions).size, versions.length, "a version is recorded twice");
  const mine = history.find(h => h.version === version);
  assert.ok(mine, `FORM_VERSION ${version} is not recorded: run node update-version.js`);
  assert.equal(fingerprint(p), mine.fingerprint,
    `The questions changed but FORM_VERSION is still ${version}: set a new FORM_VERSION, then run node update-version.js`);
});

test("the receiver lists exactly the keys this version of the page can send", () => {
  const p = page(), r = receiver();
  const listed = r.val(`VERSIONS[${JSON.stringify(p.ev("FORM_VERSION"))}]`).sort();
  assert.deepEqual(listed, pageKeys(p));
});

test("SUBMIT_CODE is the same in the page and the receiver", () => {
  const p = page(), r = receiver();
  assert.equal(p.ev("SUBMIT_CODE"), r.get("SUBMIT_CODE"));
});

test("walking through every step and sending gives a row the receiver accepts", async () => {
  const p = page({ url: "https://wilshem.github.io/ijgb-pilot-discovery/?client=example-foundation" });
  const all = { ...CORE, suites: ["memory", "continuity", "clarity"], memory_services: ["records"],
    continuity_services: ["summary", "handover", "readiness"], deal_journey: "yes", reminders: "yes",
    hosting: "local", device_encryption: "yes", encryption_checked_by: "A. Admin, IT lead",
    encryption_checked_on: "2026-11-04", org_type: "nonprofit", retention_change: "yes", retention_detail: "=1+1" };
  p.set(all);
  const d = p.w.document;
  let guard = 0;
  while (p.ev("st.step") !== "review" && guard++ < 30) {
    d.getElementById("stepform").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
  }
  assert.equal(p.ev("st.step"), "review");
  d.querySelector('[data-act="submit"]').click();
  await new Promise(res => setTimeout(res, 20));
  assert.equal(p.sent.length, 1);
  const row = JSON.parse(p.sent[0].opts.body);
  assert.equal(row.client, "example-foundation");
  assert.equal(row.timezone, "America/Chicago");
  const r = receiver();
  assert.equal(r.post(row), "ok");
  const h = r.header(), written = r.rows[0];
  assert.equal(written[h.indexOf("retention_detail")], "'=1+1");
  assert.ok(h.includes("dj_success") && h.includes("reminder_recipients"));
  assert.ok(d.getElementById("app").textContent.includes("Thank you"));
});

test("away from the live site, Send shows the row and sends nothing", async () => {
  for (const url of ["https://raw.githack.com/wilshem/ijgb-pilot-discovery/branch/index.html", "http://localhost:8000/"]) {
    const p = page({ url });
    p.set(CORE);
    p.ev('st.step = "review"; render();');
    assert.match(p.w.document.getElementById("app").textContent, /Preview copy/);
    p.w.document.querySelector('[data-act="submit"]').click();
    await new Promise(res => setTimeout(res, 20));
    assert.equal(p.sent.length, 0, url);
    const shown = JSON.parse(p.w.document.getElementById("preview-row").textContent);
    assert.equal(shown.code, "(hidden)");
    assert.equal(shown.org_name, CORE.org_name);
  }
  const live = page();
  live.set(CORE);
  live.ev('st.step = "review"; render();');
  assert.doesNotMatch(live.w.document.getElementById("app").textContent, /Preview copy/);
});

test("no internal platform name in any public file", () => {
  const files = ["index.html", "Code.gs", "README.md"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8"));
  for (const text of files) {
    assert.doesNotMatch(text, /private\s+intelligence/i);
    assert.doesNotMatch(text, /\bPIP\b/);
    assert.doesNotMatch(text, /private-intelligence-platform/i);
  }
});
