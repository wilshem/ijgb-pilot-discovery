// IJGB Pilot Discovery: receives a client's answers and adds one row per submission.
// Setup: paste this into Extensions > Apps Script in the discovery Google Sheet, then
// Deploy > Manage deployments > Edit > New version (README, steps 2 to 4).

const SUBMIT_CODE = "ijgb-discovery-26"; // Must match SUBMIT_CODE in index.html
const SHEET_NAME = "Responses";
const FIRST = ["submitted_at", "client", "org_name", "contact_name", "contact_email", "form_version"];
const META = ["code", "client", "form_version", "submitted_at"];
const REQUIRED = ["org_name", "contact_name", "contact_email"];
const MAX_BODY = 100000;  // characters in one submission
const MAX_VALUE = 5000;   // characters in one answer
const MAX_KEYS = 200;

// The questions each form version may send. A row from any other version, or with any other key, is
// refused, so a stray request cannot add columns. Add the new version's list here whenever FORM_VERSION
// changes in index.html (the tests compare them), and keep the previous one for a while: a client may
// still have the earlier page open.
const VERSIONS = {
  "2026-10-20": [
    "org_name", "contact_name", "contact_role", "contact_email", "contact_phone", "org_type",
    "email_domains", "timezone", "records_contact", "prompt", "prompt_other", "success", "pilot_start",
    "first_deadline", "services", "first_request", "request_volume", "request_reach", "mail_system",
    "admin_who", "admin_contact", "ms_licence", "ms_setup", "ms_archive", "ms_retention", "ms_hold",
    "ms_outlook", "g_edition", "g_delegation", "other_system", "other_export", "mailboxes",
    "shared_mailboxes", "sensitive", "sensitive_list", "departed", "archive_start", "deleted_mail",
    "languages", "languages_which", "mailbox_size", "old_systems", "old_systems_detail", "old_formats",
    "hosting", "budget", "device_encryption", "residency", "users", "restrict", "access_approver",
    "sync_freq", "terms", "signature_text", "disclaimers", "recipients", "reviewers", "redaction",
    "redaction_tool", "release_statement", "junk_senders", "agreements_where", "agreements_other",
    "former_names", "notice_address", "payments_file", "scanned", "ai_reader", "contracts_confirmer",
    "readiness_review", "org_chart", "accounts_list", "staff_questionnaire", "chart_of_accounts",
    "readiness_confirmer", "handover_who", "handover_when", "handover_since", "handover_contacts", "crm",
    "crm_export", "other_domains", "handover_reviewer", "security_review", "security_review_detail",
    "regulated", "staff_policy", "log_viewers", "retention", "end_of_pilot", "accessibility",
    "accessibility_detail", "support_contact", "incident_contact", "reply_time", "staff_changes", "notify",
    "change_windows", "anything_else"
  ],
  "2026-11-05": [
    "org_name", "contact_name", "contact_role", "contact_email", "contact_phone", "org_type",
    "email_domains", "timezone", "timezone_label", "records_contact", "prompt", "prompt_other", "success",
    "pilot_start", "first_deadline", "mail_system", "admin_who", "admin_contact", "ms_setup", "ms_archive",
    "ms_outlook", "ms_retention", "ms_hold", "g_delegation", "other_system", "other_export", "mailboxes",
    "sensitive", "sensitive_list", "departed", "archive_start", "deleted_mail", "languages",
    "languages_which", "mailbox_size", "old_systems", "old_systems_detail", "old_formats", "hosting",
    "budget", "device_encryption", "encryption_checked_by", "encryption_checked_on", "residency", "users",
    "access_approver", "sync_freq", "suites", "memory_services", "first_request", "request_reach", "terms",
    "signature_text", "junk_senders", "reviewers", "request_form", "continuity_services", "summary_contacts",
    "handover_who", "handover_when", "handover_since", "handover_contacts", "crm", "crm_export",
    "deal_words", "ignore_senders", "handover_reviewer", "readiness_review", "org_chart", "accounts_list",
    "staff_questionnaire", "chart_of_accounts", "event_dates", "key_relationships", "disclosures",
    "readiness_confirmer", "deal_journey", "dj_stage_history", "dj_deal_types", "dj_volume", "dj_meetings",
    "dj_folder_listing", "dj_hr_folders", "dj_success", "agreements_where", "agreements_other",
    "personnel_sources", "former_names", "notice_address", "payments_file", "scanned", "ai_reader",
    "compare_agreements", "contracts_confirmer", "reminders", "reminder_kinds", "reminder_every",
    "fiscal_year_start", "reminder_recipients", "security_review", "security_review_detail", "regulated",
    "staff_policy", "retention_change", "retention_detail", "end_of_pilot", "accessibility",
    "accessibility_detail", "support_contact", "incident_contact", "anything_else"
  ],
};

function doPost(e) {
  const data = check(e && e.postData ? e.postData.contents : "");
  if (!data) return out("rejected");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    delete data.code;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // Columns: the first few fixed, then one per question in the order it was first seen. A question
    // added to the form later gets a new column; old rows leave it blank.
    let headers = sheet.getLastRow() === 0 ? [] : sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const wanted = FIRST.concat(Object.keys(data).filter(k => FIRST.indexOf(k) < 0));
    const added = wanted.filter(k => headers.indexOf(k) < 0);
    if (added.length) {
      sheet.getRange(1, headers.length + 1, 1, added.length).setValues([added]);
      headers = headers.concat(added);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow(headers.map(h => clean(data[h])));
    return out("ok");
  } catch (err) {
    return out("error");
  } finally {
    lock.releaseLock();
  }
}

// The submission as an object, or null if it is not one the form could have sent.
function check(body) {
  if (typeof body !== "string" || body.length === 0 || body.length > MAX_BODY) return null;
  let data;
  try { data = JSON.parse(body); } catch (err) { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.code !== SUBMIT_CODE) return null;
  const allowed = Object.prototype.hasOwnProperty.call(VERSIONS, data.form_version) ? VERSIONS[data.form_version] : null;
  if (!allowed) return null;
  const keys = Object.keys(data);
  if (keys.length > MAX_KEYS) return null;
  for (const k of keys) {
    if (META.indexOf(k) < 0 && allowed.indexOf(k) < 0) return null;
    if (typeof data[k] !== "string" || data[k].length > MAX_VALUE) return null;
  }
  for (const k of REQUIRED) if (!data[k] || !data[k].trim()) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email.trim())) return null;
  if (typeof data.client !== "string" || !/^(|[a-z0-9][a-z0-9-]{0,63})$/.test(data.client)) return null;
  // A real moment: 2026-02-30 would otherwise roll over to March 2.
  if (typeof data.submitted_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(data.submitted_at)) return null;
  const at = new Date(data.submitted_at);
  if (isNaN(at.getTime()) || at.toISOString().slice(0, 19) !== data.submitted_at.slice(0, 19)) return null;
  return data;
}

// Stops text that starts with = + - @ from running as a formula in the sheet.
function clean(v) {
  const s = v === undefined || v === null ? "" : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function out(msg) {
  return ContentService.createTextOutput(msg);
}
