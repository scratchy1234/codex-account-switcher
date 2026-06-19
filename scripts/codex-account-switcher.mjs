#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const AUTH_PATH = process.env.CODEX_AUTH_PATH || path.join(CODEX_HOME, "auth.json");
const STATE_ROOT = process.env.CODEX_ACCOUNT_SWITCHER_HOME || path.join(CODEX_HOME, "account-switcher");
const PROFILE_ROOT = process.env.CODEX_ACCOUNT_PROFILE_ROOT || path.join(STATE_ROOT, "profiles");
const BACKUP_ROOT = path.join(STATE_ROOT, "backups");
const MANIFEST_PATH = process.env.CODEX_ACCOUNT_MANIFEST || path.join(STATE_ROOT, "profiles.json");
const ACTIVE_PATH = path.join(STATE_ROOT, "active-profile");
const LAST_BACKUP_PATH = path.join(STATE_ROOT, "last-backup");

function die(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  codex-account-switcher init
  codex-account-switcher doctor
  codex-account-switcher list
  codex-account-switcher current
  codex-account-switcher capture <profile> [--slot <number>] [--replace] [--dry-run]
  codex-account-switcher import-auth-json <profile> <json-file-or-folder> [--slot <number>] [--replace] [--dry-run]
  codex-account-switcher switch [--no-sync] [--dry-run] <profile-or-slot>
  codex-account-switcher login-slot [--dry-run] <profile-or-slot>
  codex-account-switcher backups
  codex-account-switcher rollback [--dry-run] [latest|backup-path]
  codex-account-switcher path
  codex-account-switcher questions

Notes:
  - Does not print tokens, cookies, auth headers, API keys, or full auth JSON.
  - Set CODEX_HOME or CODEX_AUTH_PATH to operate on a non-default Codex profile.
  - Use --dry-run to preview profile writes, auth switches, login-slot clearing, or rollback.
`);
}

function ensureDirs() {
  fs.mkdirSync(PROFILE_ROOT, { recursive: true, mode: 0o700 });
  fs.mkdirSync(BACKUP_ROOT, { recursive: true, mode: 0o700 });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writePrivateFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, content, { mode: 0o600 });
}

function writeJson(file, value) {
  writePrivateFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { version: 1, accounts: [] };
  const manifest = readJson(MANIFEST_PATH);
  if (!Array.isArray(manifest.accounts)) manifest.accounts = [];
  return manifest;
}

function saveManifest(manifest) {
  manifest.version = 1;
  manifest.accounts = [...manifest.accounts].sort((a, b) => {
    const as = Number.isFinite(a.slot) ? a.slot : Number.MAX_SAFE_INTEGER;
    const bs = Number.isFinite(b.slot) ? b.slot : Number.MAX_SAFE_INTEGER;
    return as - bs || String(a.profile).localeCompare(String(b.profile));
  });
  writeJson(MANIFEST_PATH, manifest);
}

function profileName(raw) {
  const name = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!name || name === "." || name === ".." || name.startsWith(".")) die("invalid profile name");
  if (name.length > 80) die("profile name must be 80 characters or fewer");
  return name;
}

function parseSlot(value) {
  if (value == null) return null;
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 0 || slot > 999) die("slot must be an integer from 0 to 999");
  return slot;
}

function parseOptions(args) {
  const rest = [];
  const options = { replace: false, noSync: false, slot: null, dryRun: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--replace") options.replace = true;
    else if (arg === "--no-sync") options.noSync = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--slot") {
      i += 1;
      if (i >= args.length) die("--slot requires a value");
      options.slot = parseSlot(args[i]);
    } else if (arg.startsWith("--")) die(`unknown option: ${arg}`);
    else rest.push(arg);
  }
  return { options, rest };
}

function profileAuthPath(profile) {
  return path.join(PROFILE_ROOT, profile, "auth.json");
}

function currentActive() {
  if (!fs.existsSync(ACTIVE_PATH)) return "";
  return fs.readFileSync(ACTIVE_PATH, "utf8").trim();
}

function recordActive(profile) {
  writePrivateFile(ACTIVE_PATH, `${profile}\n`);
}

function authSummary(auth) {
  const tokens = auth?.tokens || {};
  return {
    hasAccountId: Boolean(tokens.account_id),
    hasIdToken: Boolean(tokens.id_token),
    hasAccessToken: Boolean(tokens.access_token),
    hasRefreshToken: Boolean(tokens.refresh_token),
  };
}

function normalizeAuth(input) {
  const source = input?.accounts && Array.isArray(input.accounts) ? input.accounts[0] : input;
  if (source?.auth_mode && source?.tokens) return source;
  const tokens = source?.tokens || source || {};
  if (
    tokens.access_token || tokens.accessToken ||
    tokens.refresh_token || tokens.refreshToken ||
    tokens.id_token || tokens.idToken ||
    tokens.account_id || tokens.accountId
  ) {
    return {
      auth_mode: "chatgpt",
      tokens: {
        id_token: tokens.id_token || tokens.idToken || "",
        access_token: tokens.access_token || tokens.accessToken || "",
        refresh_token: tokens.refresh_token || tokens.refreshToken || "",
        account_id: tokens.account_id || tokens.accountId || "",
      },
    };
  }
  return input;
}

function validateAuth(auth) {
  if (!auth || typeof auth !== "object") die("auth JSON must be an object");
  const tokens = auth.tokens;
  if (!tokens || typeof tokens !== "object") die("auth JSON is missing tokens object");
  if (!tokens.access_token && !tokens.refresh_token && !tokens.id_token) {
    die("auth JSON does not contain recognizable token fields");
  }
}

function findJsonCandidate(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return inputPath;
  if (!stat.isDirectory()) die("input path must be a JSON file or folder");
  const candidates = fs.readdirSync(inputPath)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => path.join(inputPath, name))
    .filter((file) => fs.statSync(file).isFile());
  if (candidates.length !== 1) die("folder import requires exactly one direct JSON file");
  return candidates[0];
}

function nextManifest(profile, slot, replace) {
  const manifest = loadManifest();
  const existingProfile = manifest.accounts.find((item) => item.profile === profile);
  const existingSlot = slot == null ? null : manifest.accounts.find((item) => item.slot === slot && item.profile !== profile);
  if (existingProfile && !replace) die(`profile already exists: ${profile}; use --replace to overwrite`);
  if (existingSlot && !replace) die(`slot ${slot} already belongs to ${existingSlot.profile}; use --replace to overwrite`);
  const without = manifest.accounts.filter((item) => item.profile !== profile && (slot == null || item.slot !== slot));
  without.push({ kind: "Auth", profile, ...(slot == null ? {} : { slot }) });
  manifest.accounts = without;
  return manifest;
}

function updateManifest(profile, slot, replace) {
  const manifest = nextManifest(profile, slot, replace);
  saveManifest(manifest);
}

function resolveProfile(value) {
  const raw = String(value || "").trim();
  if (!raw) die("missing profile or slot");
  const manifest = loadManifest();
  if (/^\d+$/.test(raw)) {
    const account = manifest.accounts.find((item) => String(item.slot) === raw);
    if (!account?.profile) die(`slot ${raw} is not configured`);
    return account.profile;
  }
  return profileName(raw);
}

function backupCurrent(label = "auth") {
  if (!fs.existsSync(AUTH_PATH)) return "";
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "-").replace("T", "-").replace("Z", "");
  const backup = path.join(BACKUP_ROOT, `${label}.${stamp}.${process.pid}.json`);
  fs.copyFileSync(AUTH_PATH, backup);
  fs.chmodSync(backup, 0o600);
  writePrivateFile(LAST_BACKUP_PATH, `${backup}\n`);
  return backup;
}

function captureHint(profile, slot, replace) {
  const slotPart = slot == null ? "" : ` --slot ${slot}`;
  const replacePart = replace ? " --replace" : "";
  return `node scripts/codex-account-switcher.mjs capture ${profile}${slotPart}${replacePart}`;
}

function syncActiveProfile() {
  const active = currentActive();
  if (!active || !fs.existsSync(AUTH_PATH)) return false;
  const auth = normalizeAuth(readJson(AUTH_PATH));
  validateAuth(auth);
  writeJson(profileAuthPath(active), auth);
  return true;
}

function commandInit() {
  ensureDirs();
  if (!fs.existsSync(MANIFEST_PATH)) saveManifest({ version: 1, accounts: [] });
  console.log(`initialized=${STATE_ROOT}`);
}

function commandDoctor() {
  const manifest = fs.existsSync(MANIFEST_PATH) ? loadManifest() : { accounts: [] };
  const active = currentActive() || "-";
  console.log("doctor=ok");
  console.log(`codex_home=${CODEX_HOME}`);
  console.log(`state_present=${fs.existsSync(STATE_ROOT) ? "yes" : "no"}`);
  console.log(`auth_present=${fs.existsSync(AUTH_PATH) ? "yes" : "no"}`);
  console.log(`profiles=${manifest.accounts.length}`);
  console.log(`active=${active}`);
}

function commandList() {
  const manifest = loadManifest();
  const active = currentActive();
  console.log("No   Active  Profile                         Status");
  console.log("---  ------  ------------------------------  ----------");
  for (const item of manifest.accounts) {
    const profile = item.profile || "-";
    const authPath = profileAuthPath(profile);
    const status = fs.existsSync(authPath) ? "saved" : "missing";
    const slot = item.slot == null ? "-" : String(item.slot);
    console.log(`${slot.padEnd(3)}  ${(profile === active ? "*" : "").padEnd(6)}  ${profile.padEnd(30)}  ${status}`);
  }
}

function commandCurrent() {
  const active = currentActive();
  console.log(`active=${active || "-"}`);
  console.log(`auth_present=${fs.existsSync(AUTH_PATH) ? "yes" : "no"}`);
}

function saveProfileFromAuth(profile, slot, replace, dryRun = false) {
  if (!fs.existsSync(AUTH_PATH)) die(`auth file not found: ${AUTH_PATH}`);
  const auth = normalizeAuth(readJson(AUTH_PATH));
  validateAuth(auth);
  const target = profileAuthPath(profile);
  if (fs.existsSync(target) && !replace) die(`profile already exists: ${profile}; use --replace to overwrite`);
  nextManifest(profile, slot, replace);
  const summary = authSummary(auth);
  if (dryRun) {
    console.log(`would_capture=${profile}`);
    console.log(`slot=${slot == null ? "-" : slot}`);
    console.log(`target_exists=${fs.existsSync(target) ? "yes" : "no"}`);
    console.log("would_write_profile=yes");
    console.log("would_update_manifest=yes");
    console.log(`has_account_id=${summary.hasAccountId ? "yes" : "no"}`);
    console.log(`has_refresh_token=${summary.hasRefreshToken ? "yes" : "no"}`);
    return;
  }
  writeJson(target, auth);
  updateManifest(profile, slot, replace);
  console.log(`captured=${profile}`);
  console.log(`slot=${slot == null ? "-" : slot}`);
  console.log(`has_account_id=${summary.hasAccountId ? "yes" : "no"}`);
  console.log(`has_refresh_token=${summary.hasRefreshToken ? "yes" : "no"}`);
}

function commandCapture(args) {
  const { options, rest } = parseOptions(args);
  if (rest.length < 1) die("capture requires a profile name");
  saveProfileFromAuth(profileName(rest[0]), options.slot, options.replace, options.dryRun);
}

function commandImport(args) {
  const { options, rest } = parseOptions(args);
  if (rest.length < 2) die("import-auth-json requires a profile and path");
  const profile = profileName(rest[0]);
  const source = findJsonCandidate(path.resolve(rest[1]));
  const auth = normalizeAuth(readJson(source));
  validateAuth(auth);
  const target = profileAuthPath(profile);
  if (fs.existsSync(target) && !options.replace) die(`profile already exists: ${profile}; use --replace to overwrite`);
  nextManifest(profile, options.slot, options.replace);
  const summary = authSummary(auth);
  if (options.dryRun) {
    console.log(`would_import=${profile}`);
    console.log(`slot=${options.slot == null ? "-" : options.slot}`);
    console.log("source_checked=yes");
    console.log(`target_exists=${fs.existsSync(target) ? "yes" : "no"}`);
    console.log("would_write_profile=yes");
    console.log("would_update_manifest=yes");
    console.log(`has_account_id=${summary.hasAccountId ? "yes" : "no"}`);
    console.log(`has_refresh_token=${summary.hasRefreshToken ? "yes" : "no"}`);
    return;
  }
  writeJson(target, auth);
  updateManifest(profile, options.slot, options.replace);
  console.log(`imported=${profile}`);
  console.log(`slot=${options.slot == null ? "-" : options.slot}`);
  console.log(`has_account_id=${summary.hasAccountId ? "yes" : "no"}`);
  console.log(`has_refresh_token=${summary.hasRefreshToken ? "yes" : "no"}`);
}

function commandSwitch(args) {
  const { options, rest } = parseOptions(args);
  if (rest.length < 1) die("switch requires a profile or slot");
  ensureDirs();
  const profile = resolveProfile(rest[0]);
  const source = profileAuthPath(profile);
  if (!fs.existsSync(source)) die(`profile is missing auth.json: ${profile}`);
  const auth = normalizeAuth(readJson(source));
  validateAuth(auth);
  if (options.dryRun) {
    const wouldSync = !options.noSync && Boolean(currentActive()) && fs.existsSync(AUTH_PATH);
    console.log(`would_switch=${profile}`);
    console.log("source_profile_saved=yes");
    console.log(`would_sync_active=${wouldSync ? "yes" : "no"}`);
    console.log(`would_backup_current=${fs.existsSync(AUTH_PATH) ? "yes" : "no"}`);
    console.log("would_write_auth=yes");
    console.log("would_record_active=yes");
    console.log("restart=manual_if_needed");
    return;
  }
  if (!options.noSync) {
    try {
      syncActiveProfile();
    } catch (error) {
      console.error(`Warning: active profile sync skipped: ${error.message}`);
    }
  }
  const backup = backupCurrent("auth");
  writeJson(AUTH_PATH, auth);
  recordActive(profile);
  console.log(`switched=${profile}`);
  if (backup) console.log(`backup=${backup}`);
  console.log("restart=manual_if_needed");
}

function commandLoginSlot(args) {
  const { options, rest } = parseOptions(args);
  if (rest.length < 1) die("login-slot requires a future profile or slot");
  ensureDirs();
  const raw = rest[0];
  const manifest = loadManifest();
  const isNumeric = /^\d+$/.test(raw);
  const bySlot = isNumeric ? manifest.accounts.find((item) => String(item.slot) === raw) : null;
  if (isNumeric && !bySlot) die(`slot ${raw} is not configured`);
  const requestedProfile = bySlot?.profile || profileName(raw);
  const existingProfile = manifest.accounts.find((item) => item.profile === requestedProfile);
  const profile = requestedProfile;
  const slot = bySlot?.slot ?? existingProfile?.slot ?? options.slot;
  const replaceNeeded = Boolean(existingProfile);
  const afterLogin = captureHint(profile, slot, replaceNeeded);
  if (options.dryRun) {
    console.log(`would_prepare_login_slot=${profile}`);
    console.log(`would_backup_current=${fs.existsSync(AUTH_PATH) ? "yes" : "no"}`);
    console.log(`would_remove_auth=${fs.existsSync(AUTH_PATH) ? "yes" : "no"}`);
    console.log(`would_clear_active=${fs.existsSync(ACTIVE_PATH) ? "yes" : "no"}`);
    console.log(`after_login=${afterLogin}`);
    return;
  }
  const backup = backupCurrent(`auth-login-slot-${profile}`);
  if (fs.existsSync(AUTH_PATH)) fs.rmSync(AUTH_PATH);
  if (fs.existsSync(ACTIVE_PATH)) fs.rmSync(ACTIVE_PATH);
  console.log(`prepared_login_slot=${profile}`);
  if (backup) console.log(`backup=${backup}`);
  console.log(`after_login=${afterLogin}`);
}

function commandBackups() {
  if (!fs.existsSync(BACKUP_ROOT)) return;
  for (const file of fs.readdirSync(BACKUP_ROOT).filter((name) => name.endsWith(".json")).sort().slice(-20)) {
    console.log(path.join(BACKUP_ROOT, file));
  }
}

function resolveBackup(target = "latest") {
  ensureDirs();
  let backup = target;
  if (target === "latest") {
    if (fs.existsSync(LAST_BACKUP_PATH)) backup = fs.readFileSync(LAST_BACKUP_PATH, "utf8").trim();
    else {
      const files = fs.readdirSync(BACKUP_ROOT).filter((name) => name.endsWith(".json")).sort();
      backup = files.length ? path.join(BACKUP_ROOT, files.at(-1)) : "";
    }
  }
  if (!backup || !fs.existsSync(backup)) die("backup not found");
  return backup;
}

function commandRollback(args = []) {
  const { options, rest } = parseOptions(args);
  const backup = resolveBackup(rest[0] || "latest");
  const auth = normalizeAuth(readJson(backup));
  validateAuth(auth);
  if (options.dryRun) {
    console.log("would_rollback=ok");
    console.log(`would_restore=${backup}`);
    console.log(`would_backup_current=${fs.existsSync(AUTH_PATH) ? "yes" : "no"}`);
    return;
  }
  const previous = backupCurrent("pre-rollback");
  writeJson(AUTH_PATH, auth);
  console.log("rollback=ok");
  console.log(`restored=${backup}`);
  if (previous) console.log(`previous_backup=${previous}`);
}

function commandPath() {
  console.log(`codex_home=${CODEX_HOME}`);
  console.log(`auth=${AUTH_PATH}`);
  console.log(`state=${STATE_ROOT}`);
  console.log(`profiles=${PROFILE_ROOT}`);
  console.log(`manifest=${MANIFEST_PATH}`);
}

function commandQuestions() {
  console.log("questions=see references/onboarding.md");
  console.log("first_install=storage, first account source, profile naming");
  console.log("switching=target profile, sync current auth, restart plan");
  console.log("recovery=backup target, known-good profile, keep broken auth");
}

const [command = "help", ...args] = process.argv.slice(2);
try {
  switch (command) {
    case "init": commandInit(); break;
    case "doctor": commandDoctor(); break;
    case "list": commandList(); break;
    case "current": commandCurrent(); break;
    case "capture": commandCapture(args); break;
    case "import-auth-json": commandImport(args); break;
    case "switch": commandSwitch(args); break;
    case "login-slot": commandLoginSlot(args); break;
    case "backups": commandBackups(); break;
    case "rollback": commandRollback(args); break;
    case "path": commandPath(); break;
    case "questions": commandQuestions(); break;
    case "help":
    case "-h":
    case "--help":
      usage();
      break;
    default:
      usage();
      process.exit(2);
  }
} catch (error) {
  die(error.message);
}
