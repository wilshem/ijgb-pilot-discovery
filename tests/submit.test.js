// What the person sees after Send: "Thank you" only when the receiver says the row was saved.
const test = require("node:test");
const assert = require("node:assert/strict");
const { page, receiver } = require("./harness");
const { checkDeployed } = require("./check-deployed");

const CORE = { org_name: "Example Community Foundation", contact_name: "Dana Lee", contact_email: "dana@example.org",
  timezone: "America/Chicago", mail_system: "microsoft365" };

async function send(reply) {
  const p = page({ reply });
  p.set(CORE);
  p.ev('st.step = "review"; render();');
  p.w.document.querySelector('[data-act="submit"]').click();
  await new Promise(res => setTimeout(res, 20));
  return p;
}
const text = p => p.w.document.getElementById("app").textContent;

test("the page reads the receiver's reply (no no-cors), as a simple request with no preflight", async () => {
  const p = await send("ok");
  assert.equal(p.sent.length, 1);
  assert.notEqual(p.sent[0].opts.mode, "no-cors");
  assert.equal(p.sent[0].opts.headers["Content-Type"], "text/plain;charset=utf-8");
});

test("a saved row shows Thank you", async () => {
  const p = await send("ok");
  assert.match(text(p), /Thank you/);
  assert.equal(p.ev("st.submitted"), true);
});

for (const [reply, why] of [["rejected", "refused"], ["error", "the sheet failed"], ["", "an empty reply"],
  ["<html>Script function not found</html>", "an unexpected page"]]) {
  test(`${why}: no Thank you, a clear error with the contact, and the answers are kept`, async () => {
    const p = await send(reply);
    assert.doesNotMatch(text(p), /Thank you/);
    assert.equal(p.ev("st.submitted"), false);
    const alert = p.w.document.querySelector('[role="alert"]');
    assert.ok(alert, "an alert the person (and a screen reader) is told about");
    assert.match(alert.textContent, /not saved|couldn't confirm/i);
    const mail = alert.querySelector('a[href^="mailto:"]');
    assert.ok(mail, "a way to reach IJGB");
    assert.equal(mail.getAttribute("href").split("?")[0], "mailto:" + p.ev("CONTACT_EMAIL"));
    assert.ok(p.w.document.querySelector('[data-act="copy"]'), "Copy my answers is offered");
    assert.equal(p.val("st.a.org_name"), CORE.org_name);
    const btn = p.w.document.querySelector('[data-act="submit"]');
    assert.equal(btn.disabled, false, "they can try again");
  });
}

test("no connection, or a reply the browser hides: the same error, not Thank you", async () => {
  const p = await send(new TypeError("Failed to fetch"));
  assert.doesNotMatch(text(p), /Thank you/);
  const alert = p.w.document.querySelector('[role="alert"]');
  assert.match(alert.textContent, /couldn't confirm/i);
  assert.ok(alert.querySelector('a[href^="mailto:"]'));
});

test("a refused row really is refused by the receiver, so the error is what the person must see", () => {
  assert.equal(receiver().post({ ...CORE, code: "wrong" }), "rejected");
});

test("Code.gs answers GET with the form versions it accepts, and nothing else", () => {
  const r = receiver();
  const got = JSON.parse(r.get("doGet()"));
  assert.deepEqual(Object.keys(got), ["versions"]);
  assert.deepEqual(got.versions, Object.keys(r.val("VERSIONS")));
});

// The deployed-script check (check-deployed.js), with stand-in replies.
const html = v => `<script>const SHEET_URL = "https://script.google.com/macros/s/X/exec";\nconst FORM_VERSION = "${v}";</script>`;
const reply = (body, acao = "*") => async () => ({ ok: true, status: 200, headers: { get: h => (h.toLowerCase() === "access-control-allow-origin" ? acao : null) }, text: async () => body });

test("check-deployed passes when the deployed script accepts the page's version and every version in Code.gs", async () => {
  const problems = await checkDeployed({ pages: { "this branch": html("2026-11-23"), "live site": html("2026-11-22") },
    codeVersions: ["2026-11-22", "2026-11-23"], get: reply('{"versions":["2026-11-22","2026-11-23"]}') });
  assert.deepEqual(problems, []);
});

test("check-deployed fails when the deployed script does not accept a page's version", async () => {
  const problems = await checkDeployed({ pages: { "live site": html("2026-11-24") },
    codeVersions: ["2026-11-24"], get: reply('{"versions":["2026-11-22","2026-11-23"]}') });
  assert.ok(problems.some(m => /live site sends FORM_VERSION 2026-11-24.*not accept/i.test(m)), problems.join("\n"));
  assert.ok(problems.some(m => /redeploy/i.test(m)));
});

test("check-deployed fails when Code.gs in the repo has a version the deployed script lacks", async () => {
  const problems = await checkDeployed({ pages: { "live site": html("2026-11-23") },
    codeVersions: ["2026-11-23", "2026-11-24"], get: reply('{"versions":["2026-11-23"]}') });
  assert.ok(problems.some(m => /2026-11-24/.test(m)), problems.join("\n"));
});

test("check-deployed fails on an old script with no version list, and on a reply the page can't read", async () => {
  let problems = await checkDeployed({ pages: { "live site": html("2026-11-23") }, codeVersions: ["2026-11-23"],
    get: reply("<html>Script function not found: doGet</html>") });
  assert.ok(problems.some(m => /no version list/i.test(m)), problems.join("\n"));
  problems = await checkDeployed({ pages: { "live site": html("2026-11-23") }, codeVersions: ["2026-11-23"],
    get: reply('{"versions":["2026-11-23"]}', null) });
  assert.ok(problems.some(m => /Access-Control-Allow-Origin/.test(m)), problems.join("\n"));
  problems = await checkDeployed({ pages: { "live site": html("2026-11-23") }, codeVersions: ["2026-11-23"],
    get: async () => { throw new Error("timed out"); } });
  assert.ok(problems.some(m => /timed out/.test(m)), problems.join("\n"));
});
