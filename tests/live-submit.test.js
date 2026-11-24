// Offline checks of the live submission test (live-submit.js and .github/workflows/live-submit.yml).
// The live test itself sends one row to the real sheet; these make sure it would be a row Code.gs
// accepts, tagged so the dashboard leaves it out, and that the workflow runs when it should.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const { page, receiver, ROOT } = require("./harness");
const { ANSWERS, CLIENT, liveUrl, stored } = require("./live-submit");

test("the live test uses the client tag the dashboard leaves out, and invented answers only", () => {
  assert.equal(CLIENT, "ijgb-live-test");
  assert.match(liveUrl("abc"), /^https:\/\/wilshem\.github\.io\/ijgb-pilot-discovery\/\?client=ijgb-live-test&/);
  assert.match(ANSWERS.contact_email, /@example\.org$/);
  assert.match(ANSWERS.org_name, /test/i);
});

test("the stored answers open the live page at Review, and Send gives a row Code.gs accepts", async () => {
  const p = page({ url: liveUrl("abc"), stored: stored(), reply: "ok" });
  assert.equal(p.ev("st.step"), "review");
  assert.equal(p.ev("CLIENT"), CLIENT);
  p.w.document.querySelector('[data-act="submit"]').click();
  await new Promise(res => setTimeout(res, 20));
  assert.equal(p.sent.length, 1);
  const row = JSON.parse(p.sent[0].opts.body);
  assert.equal(row.client, CLIENT);
  assert.equal(row.org_name, ANSWERS.org_name);
  assert.equal(receiver().post(row), "ok");
  assert.match(p.w.document.getElementById("app").textContent, /Thank you/);
});

test("if Code.gs refused the row, the live test would not see Thank you", async () => {
  const p = page({ url: liveUrl("abc"), stored: stored(), reply: "rejected" });
  p.w.document.querySelector('[data-act="submit"]').click();
  await new Promise(res => setTimeout(res, 20));
  assert.doesNotMatch(p.w.document.getElementById("app").textContent, /Thank you/);
});

test("the workflow runs weekly, on demand and after each Pages deployment of main, and never sends from a fork", () => {
  const y = fs.readFileSync(path.join(ROOT, ".github", "workflows", "live-submit.yml"), "utf8");
  assert.match(y, /^\s+schedule:\n\s+- cron: "[^"]+"/m);
  assert.match(y, /^\s+workflow_dispatch:/m);
  assert.match(y, /workflow_run:\n\s+workflows: \["pages-build-deployment", "pages build and deployment"\]\n\s+types: \[completed\]/);
  assert.match(y, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(y, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(y, /github\.repository == 'wilshem\/ijgb-pilot-discovery'/);
  assert.match(y, /node live-submit\.js/);
});

test("the README says scheduled runs stop after 60 days without commits", () => {
  const r = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.match(r, /60 days/);
  assert.match(r, /live-submit/);
});
