// IJGB Pilot Discovery: receives a client's answers and adds one row per submission.
// Setup: paste this into Extensions > Apps Script in the discovery Google Sheet, then
// Deploy > New deployment > Web app (README, steps 2 to 4).

const SUBMIT_CODE = "ijgb-discovery-26"; // Must match SUBMIT_CODE in index.html
const SHEET_NAME = "Responses";
const FIRST = ["submitted_at", "client", "org_name", "contact_name", "contact_email", "form_version"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.code !== SUBMIT_CODE) return out("rejected");
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

// Stops text that starts with = + - @ from running as a formula in the sheet.
function clean(v) {
  const s = v === undefined || v === null ? "" : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function out(msg) {
  return ContentService.createTextOutput(msg);
}
