// Code.gs against hostile input: malformed or deeply nested JSON, wrong types, odd Unicode and control
// characters, version strings that are not versions, and floods. Each is refused and writes nothing, or, if
// the form could have sent it, is written as exactly one row of plain text. Invented data only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { receiver } = require("./harness");

const CODE = "ijgb-discovery-26";
const good = (extra = {}) => ({ code: CODE, client: "example-foundation", form_version: "2026-11-06.2",
  submitted_at: "2026-11-06T15:04:05.123Z", org_name: "Example Community Foundation", contact_name: "Dana Lee",
  contact_email: "dana@example.org", ...extra });
const json = g => JSON.stringify(g);

function refused(body, why) {
  const r = receiver();
  assert.equal(r.post(body), "rejected", why);
  assert.equal(r.rows.length, 0, why);
  assert.deepEqual(r.header(), [], why);
}

// ---------------------------------------------------------------- malformed JSON
const malformed = {
  "cut off mid-way": json(good()).slice(0, 60),
  "trailing text after the object": json(good()) + "x",
  "two objects": json(good()) + json(good()),
  "a trailing comma": json(good()).replace(/}$/, ",}"),
  "single quotes": json(good()).replace(/"/g, "'"),
  "a comment": "/* hi */" + json(good()),
  "a byte-order mark first": "﻿" + json(good()),
  "NaN as a value": json(good()).replace(/}$/, ',"users":NaN}'),
  "a lone quote": "\"",
  "only white space": " \n\t ",
  "a JSON string": json("org_name"),
  "a JSON number": "42",
  "JSON true": "true",
};
for (const [name, body] of Object.entries(malformed)) {
  test(`malformed JSON is refused, nothing written: ${name}`, () => refused(body, name));
}

test("deeply nested JSON is refused without an error escaping", () => {
  for (const depth of [100, 10000, 49000]) {  // 49,000 pairs of brackets stays under the 100,000 limit
    refused(json(good()).replace(/}$/, ',"users":' + "[".repeat(depth) + "]".repeat(depth) + "}"), `list ${depth}`);
    refused(json(good()).replace(/}$/, ',"users":' + '{"a":'.repeat(Math.min(depth, 16000)) + "1"
      + "}".repeat(Math.min(depth, 16000)) + "}"), `object ${depth}`);
  }
});

// ---------------------------------------------------------------- wrong types
const wrongTypes = {
  "true for an answer": good({ users: true }),
  "null for an answer": good({ users: null }),
  "an object for an answer": good({ users: { n: "3" } }),
  "a number for the code": good({ code: 26 }),
  "a list holding the right code": good({ code: [CODE] }),
  "a number for the version": good({ form_version: 20261106 }),
  // ["2026-11-06.2"] names the version when used as a key; it must still be refused as not text
  "a list holding a real version": good({ form_version: ["2026-11-06.2"] }),
  "a number for the client tag": good({ client: 7 }),
  "null for the client tag": good({ client: null }),
  "an object for the submitted time": good({ submitted_at: { t: 1 } }),
  "a list for the contact email": good({ contact_email: ["dana@example.org"] }),
};
for (const [name, body] of Object.entries(wrongTypes)) {
  test(`a wrong type is refused, nothing written: ${name}`, () => refused(body, name));
}

// ---------------------------------------------------------------- versions that are not versions
const notVersions = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "", " 2026-11-06.2",
  "2026-11-06.2 ", "2026-11-06.2\u0000", "2026‐11‐06.2", "２０２６-11-06.2", "2026-11-06.20",
  "2026-11-06", "2026-11-06.2\n"];
for (const v of notVersions) {
  test(`a version name that is not one of the form's is refused: ${JSON.stringify(v)}`, () => {
    refused(json(good({ form_version: v })), v);
  });
}

test("a key that is a JavaScript built-in name is refused, and nothing is polluted", () => {
  for (const k of ["constructor", "toString", "hasOwnProperty", "prototype", "__defineGetter__"]) {
    refused(json(good({ [k]: "x" })), k);
  }
  refused('{"code":"' + CODE + '","form_version":"2026-11-06.2","org_name":"a","contact_name":"b",'
    + '"contact_email":"c@d.org","client":"","submitted_at":"2026-11-06T15:04:05Z","constructor":{"prototype":{"x":"1"}}}',
  "constructor.prototype");
  const r = receiver();
  assert.equal(r.post(good()), "ok");  // the same deployment still works after the attempts above
  assert.equal(r.get("({}).x"), undefined);
});

// ---------------------------------------------------------------- keys with odd characters
const oddKeys = ["org_name\u0000", "org_name ", " org_name", "ORG_NAME", "org​name", "org_nаme" /* Cyrillic а */,
  "users\n", "", "\uD800"];
for (const k of oddKeys) {
  test(`a key that only looks like a question is refused: ${JSON.stringify(k)}`, () => {
    refused(json(good({ [k]: "x" })), JSON.stringify(k));
  });
}

// ---------------------------------------------------------------- odd Unicode and control characters
test("an answer in any script, with emoji, joiners and right-to-left text, is stored exactly as sent", () => {
  const r = receiver();
  const answers = {
    anything_else: "Fundación Ejemplo · مؤسسة مثال · 例の財団 · 🧑🏽‍🤝‍🧑🏻 · é · ‮reversed‬",
    success: "line one\nline two\r\nline three\ttabbed",
    terms: "\u0000\u0007\u001B[31m odd controls \u007F",
    mailboxes: "\uD800 a lone surrogate",
  };
  assert.equal(r.post(good(answers)), "ok");
  const h = r.header(), row = r.rows[0];
  for (const [k, v] of Object.entries(answers)) assert.equal(row[h.indexOf(k)], v, k);
  assert.equal(r.rows.length, 1);
});

test("odd characters around a formula sign never make an answer a formula", () => {
  const r = receiver();
  const answers = { anything_else: "=1+1", users: "+1", mailboxes: "-1", terms: "@SUM(A1)",
    success: "​=1+1", sensitive_list: "﻿=1", first_request: "＝1+1" };
  assert.equal(r.post(good(answers)), "ok");
  const h = r.header(), row = r.rows[0];
  for (const k of ["anything_else", "users", "mailboxes", "terms"]) assert.equal(row[h.indexOf(k)], "'" + answers[k], k);
  // a zero-width space, a byte-order mark or a full-width equals sign first: the sheet reads text, not a
  // formula, and the receiver leaves them as sent
  for (const k of ["success", "sensitive_list", "first_request"]) assert.equal(row[h.indexOf(k)], answers[k], k);
});

// OWASP lists a tab and a carriage return as spreadsheet formula starters too, so they are escaped as well
// (Better's decision, 2026-11-24).
test("a tab or carriage return first is stored as text", () => {
  const r = receiver();
  const answers = { anything_else: "\t=1+1", success: "\r=1+1", terms: "\tplain text" };
  assert.equal(r.post(good(answers)), "ok");
  const h = r.header(), row = r.rows[0];
  for (const [k, v] of Object.entries(answers)) assert.equal(row[h.indexOf(k)], "'" + v, k);
});

test("odd characters in the client tag, email or time are refused", () => {
  for (const g of [good({ client: "example\u0000" }), good({ client: "exаmple" /* Cyrillic а */ }),
    good({ client: "example\n" }), good({ client: "例" }), good({ contact_email: "dana@exam\nple.org" }),
    good({ contact_email: "dana @example.org" }), good({ submitted_at: "2026-11-06T15:04:05.123Z\n" }),
    good({ submitted_at: "２０２６-11-06T15:04:05Z" }), good({ submitted_at: "2026-11-06T15:04:05.123\u0000Z" })]) {
    refused(json(g), JSON.stringify(g).slice(0, 120));
  }
});

test("white space around the contact email is allowed, as the receiver trims it before checking", () => {
  // Code.gs checks contact_email.trim(), like the required answers, and stores what was sent
  const r = receiver();
  assert.equal(r.post(good({ contact_email: " dana@example.org\n" })), "ok");
  assert.equal(r.rows[0][r.header().indexOf("contact_email")], " dana@example.org\n");
});

test("an answer at exactly 5,000 characters is kept whole, counted as the script counts", () => {
  const r = receiver();
  const emoji = "😀".repeat(2500);  // 2,500 emoji are 5,000 UTF-16 units: the limit
  assert.equal(r.post(good({ anything_else: emoji })), "ok");
  assert.equal(r.rows[0][r.header().indexOf("anything_else")], emoji);
  refused(json(good({ anything_else: emoji + "😀" })), "one emoji over");
});

// ---------------------------------------------------------------- floods
test("a flood of refused posts writes nothing and leaves the receiver working", () => {
  const r = receiver();
  const junk = [good({ code: "guess" }), good({ shoe_size: "9" }), "{", good({ form_version: "2099-01-01" })];
  for (let i = 0; i < 2000; i++) assert.equal(r.post(junk[i % junk.length]), "rejected");
  assert.equal(r.rows.length, 0);
  assert.deepEqual(r.header(), []);
  assert.equal(r.post(good()), "ok");
  assert.equal(r.rows.length, 1);
});

test("the same submission posted again adds a row each time and never a column", () => {
  // Code.gs keeps every post (nothing is merged or dropped); duplicates are left for the reviewer to spot by
  // submitted_at. A guard against repeats would be a Code.gs change.
  const r = receiver();
  for (let i = 0; i < 300; i++) assert.equal(r.post(good({ users: "12" })), "ok");
  assert.equal(r.rows.length, 300);
  const width = r.header().length;
  assert.ok(r.rows.every(row => row.length === width));
  assert.equal(new Set(r.rows.map(row => row.join("\u0001"))).size, 1);
});

test("posts that each fill different allowed questions grow the header only to the version's questions", () => {
  const r = receiver();
  const allowed = r.val('VERSIONS["2026-11-06.2"]');
  for (const k of allowed) assert.equal(r.post(good({ [k]: k === "contact_email" ? "x@example.org" : "x" })), "ok", k);
  const extra = r.header().filter(h => !allowed.includes(h) && !["submitted_at", "client", "form_version"].includes(h));
  assert.deepEqual(extra, []);
  assert.equal(new Set(r.header()).size, r.header().length, "no column twice");
});

test("every allowed question filled to the limit is over the body limit, and refused whole", () => {
  const r = receiver();
  const allowed = r.val('VERSIONS["2026-11-06.2"]');
  const g = good(Object.fromEntries(allowed.filter(k => !["org_name", "contact_name", "contact_email"].includes(k))
    .map(k => [k, "x".repeat(5000)])));
  assert.ok(json(g).length > 100000);
  refused(json(g), "flood of full answers");
});
