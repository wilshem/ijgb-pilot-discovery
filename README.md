# IJGB Pilot Discovery

The questionnaire a prospective client fills in during the engagement phase, before a pilot of
IJGB's records service. It is one page (`index.html`) published with GitHub Pages; the
answers go to a Google Sheet that IJGB owns, through a small Google Apps Script (`Code.gs`).

- **Clients need no account.** They open a link, answer step by step, review, and send.
- **Questions branch on earlier answers.** Everyone answers a short core (about 13 minutes); each
  suite chosen (Memory, Continuity, Clarity) adds about 3 minutes, and a client choosing two takes
  about 20. A Microsoft 365 client never sees the Google questions, and the deal-journey questions
  appear only for a client who asks about it.
- **Approvals are not asked here.** Written approvals (AI use, sensitive mailboxes, domain
  ownership, per-person figures, reminder recipients and details, who may send requests) are
  gathered in the onboarding paperwork, with a named person and a date.
- **Progress is saved in the client's browser,** so they can stop and finish later on the same device.
- **This repository holds no client answers.** They go only to the Google Sheet.

## Set up the answers sheet (once)

1. In Google Drive (IJGB's Workspace account), create a new blank Google Sheet, for example
   **IJGB Pilot Discovery Responses**. Use a new sheet, not the intern questionnaire's.
2. In that sheet: **Extensions > Apps Script**. Delete what is in the editor, paste the whole of
   `Code.gs`, and save.
3. **Deploy > New deployment**. Click the gear next to "Select type" and choose **Web app**. Set
   **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Approve the permissions
   Google asks for (it writes only to this sheet).
4. Copy the **Web app URL** (it ends in `/exec`) and put it in `SHEET_URL` near the top of the
   script in `index.html`, then commit. Until it is set, the form still works, but tells clients to
   copy their answers and email them instead of sending.

Keep the sheet itself shared only with IJGB staff. "Anyone" in step 3 only lets the form send a row
to the script; it does not let anyone open or read the sheet.

If you change `Code.gs` later: **Deploy > Manage deployments**, edit the deployment, choose
**New version**, and deploy. The URL stays the same. `Code.gs` accepts the current form version and
the previous one, so it can be deployed before or after the page changes go live.

## Send it to a client

Give each client their own link, with a short tag for them:

```
https://wilshem.github.io/ijgb-pilot-discovery/?client=acme-foundation
```

The tag (letters, digits and hyphens) appears in the `client` column of every row they send, and
keeps their saved progress separate from any other link opened on the same computer. A link without
`?client=` works too; the client column is then blank.

Each submission is one row. If a client sends twice, both rows are kept; the later one is current.

## What the sheet receives

One column per question, in plain words (for example "Daily", not a code), plus `submitted_at`,
`client` and `form_version`. A few answers are stored as the value the platform's settings take:

- `timezone`: an IANA area and place, such as `America/New_York` (never "UTC" or "EST" alone; UTC
  is `Etc/UTC`), with `timezone_label` ("Eastern"; blank for a zone not on the short list).
- `org_type`: `nonprofit`, `business`, `public`, or `to confirm at onboarding` for "Something
  else" (never assumed to be non-profit).
- `mail_system`: `microsoft365` or `google_workspace` (or `other`, `not_sure`).
- `hosting`: `s3` (hosted by IJGB) or `local` (a device at the office), or `not_sure`.

On-site clients give who checked the disk encryption and when (`encryption_checked_by`,
`encryption_checked_on`): together, the settings' `storage.disk_encryption_confirmed_by`.

A question that did not apply to that client (the Google questions for a Microsoft client) is left
out of that row. Adding a question to the form adds a column automatically the first time someone
answers it; earlier rows are left blank there.

Text that starts with `=`, `+`, `-` or `@` is stored with a leading apostrophe so the sheet never
runs it as a formula.

`Code.gs` refuses a row (and writes nothing) unless it is one the form could have sent: a JSON
object with the submit code; a `form_version` listed in `VERSIONS`, and only that version's keys
(so a stray request cannot add columns); at most 200 keys, every value text of at most 5,000
characters, and at most 100,000 characters in all; an organization name, a contact name and an
email address that looks like one; a `client` tag of letters, digits and hyphens, or none; and a
real `submitted_at` time. The page cannot see the reply, so a refused row still shows "Thank you":
keep `VERSIONS` in step with the page (the tests check it).

## Change the questions

Questions are the `STEPS` list in `index.html`. Each has an `id` (its column name), a `type`
(`text`, `email`, `tel`, `date`, `textarea`, `choice` for one answer, `multi` for several, `select`
for a long list), a `label`, an optional `hint`, `options` for choices, `req: true` for required,
`store: "value"` to send the option's value instead of its words, and an optional `show(a)` that
hides it until earlier answers make it relevant. Keep an `id` the same once clients have answered
it, so the column carries on.

**When the questions change:** set `FORM_VERSION` to the day's date, add that version's list of
question ids to `VERSIONS` in `Code.gs`, run `node update-version.js` in `tests/` to record the new
fingerprint, run the tests, and redeploy `Code.gs`. The tests fail if the questions change while
`FORM_VERSION` stays the same, or if `VERSIONS` and the page disagree.

## Preview a change

Anywhere but the live site (`wilshem.github.io`), the page is a preview: it says so at the bottom,
and **Send** shows the row it would send instead of sending it. To see a branch before it is merged:

- `https://raw.githack.com/wilshem/ijgb-pilot-discovery/<branch>/index.html`, or
- on your own computer: `python3 -m http.server 8000` in this folder, then open
  `http://localhost:8000/`.

## Tests

`tests/` holds offline tests (Node and jsdom) of the page and of `Code.gs`, which they run with
stand-ins for Google's services. They also run on every pull request
(`.github/workflows/tests.yml`).

```
cd tests && npm ci && npm test
```

`SUBMIT_CODE` must be the same in `index.html` and `Code.gs`. It is visible in the page, so it is
not a password: it only stops stray requests from adding rows.

## Accessibility

Every question is a labelled form control (choices are real radio buttons and checkboxes grouped
with a legend), focus is always visible, the page follows the system's light or dark setting, and
nothing moves for people who ask for reduced motion. Full WCAG 2.1 AA has not been audited.
