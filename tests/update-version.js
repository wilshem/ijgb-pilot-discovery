// Records the questions' fingerprint under the current FORM_VERSION. Run it after changing the
// questions and setting a new FORM_VERSION (README, "When the questions change"). It refuses to
// record changed questions under a version already recorded: that is what makes the version change.
const fs = require("fs"), path = require("path");
const { page, fingerprint } = require("./harness");
const file = path.join(__dirname, "form-version.json");
const history = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
const p = page();
const version = p.ev("FORM_VERSION"), print = fingerprint(p);
const known = history.find(h => h.version === version);
if (known && known.fingerprint !== print) {
  console.error(`The questions changed but FORM_VERSION is still ${version}: set a new FORM_VERSION first.`);
  process.exit(1);
}
if (!known) history.push({ version, fingerprint: print });
fs.writeFileSync(file, JSON.stringify(history, null, 2) + "\n");
console.log(`form-version.json: ${version} ${print}`);
