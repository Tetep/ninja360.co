// GI — Who Looked (private sheet). The Dojo site adds one row here each time someone signed in
// with a partner login opens a page behind the login: when, who, which page, what device, IP and
// location (city, region, country).
//
// One-time setup, in the sheet "GI — Who Looked (private)":
//   1. Extensions > Apps Script. Delete what's there, paste this whole file, click Save.
//   2. Deploy > New deployment > gear icon > Web app.
//      Execute as: Me.   Who has access: Anyone.   Deploy, and allow access when Google asks.
//   3. Copy the Web app URL (ends in /exec). In Cloudflare: Pages > ninja360-co > Settings >
//      Variables and Secrets, add GI_LOG_URL = that URL (Production), then redeploy.
// "Anyone" only means the site's server can post without a Google sign-in. The URL lives in
// Cloudflare and is never sent to a browser; the sheet itself stays shared with no one.

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Views');
  sheet.appendRow([new Date(d.when), text(d.who), text(d.page), text(d.device), text(d.ip), text(d.location)]);
  return ContentService.createTextOutput('ok');
}

// Plain text only: a value can never turn into a formula.
function text(v) {
  v = String(v == null ? '' : v).slice(0, 200);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
