# IJGB Pilot Discovery

The questionnaire a prospective client fills in during the engagement phase, before a pilot of the
IJGB Private Intelligence Platform. It is one page (`index.html`) published with GitHub Pages; the
answers go to a Google Sheet that IJGB owns, through a small Google Apps Script (`Code.gs`).

- **Clients need no account.** They open a link, answer step by step, review, and send.
- **Questions branch on earlier answers.** A Microsoft 365 client never sees the Google questions;
  contract and readiness questions appear only for clients who want those services.
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
**New version**, and deploy. The URL stays the same.

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

One column per question, in plain words (for example "Microsoft 365", not a code), plus
`submitted_at`, `client` and `form_version`. A question that did not apply to that client (the
Google questions for a Microsoft client) is left out of that row. Adding a question to the form adds
a column automatically the first time someone answers it; earlier rows are left blank there.

Text that starts with `=`, `+`, `-` or `@` is stored with a leading apostrophe so the sheet never
runs it as a formula.

## Change the questions

Questions are the `STEPS` list in `index.html`. Each has an `id` (its column name), a `type`
(`text`, `email`, `tel`, `date`, `textarea`, `choice` for one answer, `multi` for several), a
`label`, an optional `hint`, `options` for choices, `req: true` for required, and an optional
`show(a)` that hides it until earlier answers make it relevant. Keep an `id` the same once clients
have answered it, so the column carries on. Change `FORM_VERSION` when the questions change.

`SUBMIT_CODE` must be the same in `index.html` and `Code.gs`. It is visible in the page, so it is
not a password: it only stops stray requests from adding rows.

## Accessibility

Every question is a labelled form control (choices are real radio buttons and checkboxes grouped
with a legend), focus is always visible, the page follows the system's light or dark setting, and
nothing moves for people who ask for reduced motion. Full WCAG 2.1 AA has not been audited.
