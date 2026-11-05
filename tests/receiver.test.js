// Code.gs: a row the form could have sent is written; anything else is refused and writes nothing.
const test = require("node:test");
const assert = require("node:assert/strict");
const { receiver } = require("./harness");

const CODE = "ijgb-discovery-26";
const good = (extra = {}) => ({ code: CODE, client: "example-foundation", form_version: "2026-11-05",
  submitted_at: "2026-11-05T15:04:05.123Z", org_name: "Example Community Foundation", contact_name: "Dana Lee",
  contact_email: "dana@example.org", timezone: "America/New_York", timezone_label: "Eastern", ...extra });

test("a well-formed row is written, with the fixed columns first", () => {
  const r = receiver();
  assert.equal(r.post(good()), "ok");
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.header().slice(0, 6), ["submitted_at", "client", "org_name", "contact_name", "contact_email", "form_version"]);
  assert.ok(!r.header().includes("code"));
});

test("a row from the previous form version is still accepted, so deploy order does not matter", () => {
  const r = receiver();
  const old = good({ form_version: "2026-10-20", services: "Searching email", ms_licence: "E3" });
  delete old.timezone_label;  // the earlier page never sent it
  assert.equal(r.post(old), "ok");
  assert.equal(r.rows.length, 1);
  assert.equal(r.post(good({ form_version: "2026-10-20" })), "rejected", "a key the earlier version never sent");
});

test("a client tag may be blank", () => {
  const r = receiver();
  assert.equal(r.post(good({ client: "" })), "ok");
});

test("text that could run as a formula is stored as text", () => {
  const r = receiver();
  r.post(good({ anything_else: "=HYPERLINK(\"x\")", users: "+1", mailboxes: "@x", terms: "-y" }));
  const h = r.header(), row = r.rows[0];
  for (const k of ["anything_else", "users", "mailboxes", "terms"]) assert.ok(row[h.indexOf(k)].startsWith("'"), k);
});

const bad = {
  "an empty body": "",
  "text that is not JSON": "org_name=x",
  "a JSON list": "[1,2]",
  "JSON null": "null",
  "the wrong code": good({ code: "guess" }),
  "no code": (() => { const g = good(); delete g.code; return g; })(),
  "an unknown form version": good({ form_version: "2099-01-01" }),
  "no form version": (() => { const g = good(); delete g.form_version; return g; })(),
  "a key the version does not ask": good({ shoe_size: "9" }),
  "a key from another version": good({ ms_licence: "E3" }),
  "a key like __proto__": '{"code":"' + CODE + '","form_version":"2026-11-05","__proto__":"x","org_name":"a","contact_name":"b","contact_email":"c@d.org","client":"","submitted_at":"2026-11-05T15:04:05Z"}',
  "a number for an answer": good({ users: 3 }),
  "a list for an answer": good({ suites: ["memory"] }),
  "an answer over 5,000 characters": good({ anything_else: "x".repeat(5001) }),
  "no organization name": good({ org_name: "" }),
  "a blank contact name": good({ contact_name: "   " }),
  "no contact email": (() => { const g = good(); delete g.contact_email; return g; })(),
  "an email that is not an address": good({ contact_email: "dana at example" }),
  "a client tag with spaces": good({ client: "acme foundation" }),
  "a client tag in capitals": good({ client: "ACME" }),
  "a client tag over 64 characters": good({ client: "a".repeat(65) }),
  "no submitted time": (() => { const g = good(); delete g.submitted_at; return g; })(),
  "a submitted time that is not a time": good({ submitted_at: "yesterday" }),
  "a date that does not exist": good({ submitted_at: "2026-02-30T10:00:00Z" }),
};
// A body over the limit, built from allowed keys and answers under 5,000 characters, so only its size is wrong.
bad["a body over 100,000 characters"] = (() => {
  const fill = ["mailboxes", "users", "success", "terms", "signature_text", "junk_senders", "first_request",
    "summary_contacts", "deal_words", "ignore_senders", "event_dates", "key_relationships", "disclosures",
    "dj_deal_types", "dj_meetings", "dj_success", "agreements_other", "personnel_sources", "former_names",
    "compare_agreements", "anything_else"];
  return JSON.stringify(good(Object.fromEntries(fill.map(k => [k, "x".repeat(4900)]))));
})();

test("the oversized body is over the limit only by its size", () => {
  const body = bad["a body over 100,000 characters"];
  assert.ok(body.length > 100000);
  assert.ok(Object.values(JSON.parse(body)).every(v => v.length <= 5000));
});

for (const [name, body] of Object.entries(bad)) {
  test(`refused, nothing written: ${name}`, () => {
    const r = receiver();
    assert.equal(r.post(body), "rejected");
    assert.equal(r.rows.length, 0);
    assert.deepEqual(r.header(), []);
  });
}

test("more than 200 keys is refused", () => {
  const r = receiver();
  const allowed = r.val('VERSIONS["2026-11-05"]');
  assert.ok(allowed.length < 200, "the limit must stay above the form's own questions");
  const g = good();
  const body = JSON.stringify(Object.assign(g, Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, ""]))));
  assert.equal(r.post(body), "rejected");
  assert.equal(r.rows.length, 0);
});

test("a missing body (no postData) is refused", () => {
  const r = receiver();
  assert.equal(r.get("doPost")({}), "rejected");
  assert.equal(r.get("doPost")(undefined), "rejected");
});
