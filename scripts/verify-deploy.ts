/**
 * scripts/verify-deploy.ts
 *
 * One-shot pre-deploy auditor. Runs every check from MANUS_HANDOFF.txt
 * Section 9 (A-H) that can be evaluated without a real Android device.
 *
 * Exit code 0 → all checks passed; safe to ship.
 * Exit code 1 → at least one check failed; STOP and fix before shipping.
 *
 * Usage:
 *   pnpm verify:deploy
 */
import "dotenv/config";

import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

const REQUIRED_TABLES = [
  "apk_releases",
  "auth_logs",
  "bill_items",
  "bills",
  "blocklist",
  "conversations",
  "messages",
  "notifications",
  "payments",
  "reset_tokens",
  "settings",
  "users",
  "utilities",
];

type CheckResult = { name: string; ok: boolean; detail?: string };
const results: CheckResult[] = [];

function ok(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
}
function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
}

async function checkEnv() {
  // NOTE: this function intentionally collects ALL env failures rather than
  // bailing on the first one — that way the agent sees the full set of
  // overrides it needs to apply via webdev_request_secrets in a single shot,
  // not three iterations of (fix → re-run → see next fail).
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL set", "missing");
  } else {
    ok("DATABASE_URL set");
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    fail(
      "JWT_SECRET set & strong",
      `len=${(process.env.JWT_SECRET || "").length} (require ≥32 chars)\n` +
        `         FIX: The Manus runtime auto-injects a short JWT_SECRET. Override it with:\n` +
        `           webdev_request_secrets({\n` +
        `             secrets: [{\n` +
        `               key: "JWT_SECRET",\n` +
        `               value: <96-char random hex>,   // node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))'\n` +
        `               preventMatching: true,\n` +
        `               description: "Production JWT signing secret (overrides built-in)"\n` +
        `             }]\n` +
        `           })\n` +
        `         DO NOT edit scripts/load-env.js to delete or override env vars at runtime.`,
    );
  } else {
    ok("JWT_SECRET set & strong");
  }

  if (process.env.OAUTH_SERVER_URL || process.env.OWNER_OPEN_ID) {
    fail(
      "OAuth disabled",
      `OAUTH_SERVER_URL=${process.env.OAUTH_SERVER_URL || "(unset)"}, OWNER_OPEN_ID=${process.env.OWNER_OPEN_ID || "(unset)"} — both must be empty/unset.\n` +
        `         FIX: The Manus runtime auto-injects these. Override BOTH to empty strings via webdev_request_secrets with preventMatching:true:\n` +
        `           webdev_request_secrets({\n` +
        `             secrets: [\n` +
        `               { key: "OAUTH_SERVER_URL", value: "", preventMatching: true,\n` +
        `                 description: "MUST be empty per MANUS_HANDOFF.txt §1 — disables Manus OAuth" },\n` +
        `               { key: "OWNER_OPEN_ID",    value: "", preventMatching: true,\n` +
        `                 description: "MUST be empty per MANUS_HANDOFF.txt §1 — disables Manus OAuth" }\n` +
        `             ]\n` +
        `           })\n` +
        `         The OAuth gate in server/_core/index.ts treats empty strings as 'unset'. Restart the dev server after applying.\n` +
        `         DO NOT edit scripts/load-env.js to delete these vars at runtime — that hides config drift and breaks debug.`,
    );
  } else {
    ok("OAuth disabled (no OAUTH_SERVER_URL / OWNER_OPEN_ID)");
  }
}

async function checkEasProjectId() {
  const fs = await import("node:fs/promises");
  const cfg = await fs.readFile("app.config.ts", "utf-8");
  const m = cfg.match(/projectId\s*:\s*['"`]([^'"`]+)['"`]/);
  if (!m) {
    return fail(
      "EAS projectId configured",
      `app.config.ts has no extra.eas.projectId.\n` +
        `         The first 'eas build' will fail in --non-interactive mode without one.\n` +
        `         FIX (one-time, run on operator's local machine — NOT in this sandbox):\n` +
        `           export EXPO_TOKEN=<your-token>\n` +
        `           npx eas-cli init           # creates project on expo.dev, injects projectId\n` +
        `           git add app.config.ts && git commit -m 'chore: add eas projectId' && git push\n` +
        `         Then re-run this audit. The agent can never bootstrap this from a sandbox\n` +
        `         because eas init requires an interactive TTY for the project-naming prompt.`,
    );
  }
  ok(`EAS projectId configured (${m[1].slice(0, 8)}…)`);
}

async function checkSchema() {
  const db = drizzle(process.env.DATABASE_URL!);
  const tablesRow: any = await db.execute(sql`SHOW TABLES`);
  const rows = Array.isArray(tablesRow) ? tablesRow[0] : tablesRow;
  const list = (rows as any[]).map((r) => Object.values(r)[0] as string);

  for (const t of REQUIRED_TABLES) {
    if (!list.includes(t)) {
      fail(`Table exists: ${t}`, "missing");
      return;
    }
  }
  ok(`All ${REQUIRED_TABLES.length} required tables exist`);

  // users.phone must exist (migration 0002)
  const cols: any = await db.execute(sql`SHOW COLUMNS FROM users LIKE 'phone'`);
  const colsRows = (Array.isArray(cols) ? cols[0] : cols) as any[];
  if (!colsRows || colsRows.length === 0) {
    return fail("users.phone column", "missing — run drizzle/0002 migration");
  }
  ok("users.phone column exists");
}

async function checkAdmin() {
  const db = drizzle(process.env.DATABASE_URL!);
  const adminRows: any = await db.execute(
    sql`SELECT email, role, status FROM users WHERE role = 'admin'`,
  );
  const rows = (Array.isArray(adminRows) ? adminRows[0] : adminRows) as any[];
  if (!rows || rows.length === 0) {
    return fail("admin user seeded", "no admin row — run pnpm seed:admin");
  }
  if (rows.length > 1) {
    return fail("exactly one admin", `${rows.length} admins found — keep only one`);
  }
  const a = rows[0];
  if (a.status !== "active") {
    return fail("admin active", `status=${a.status}`);
  }
  ok(`exactly one active admin: ${a.email}`);

  // No demo landlord/tenant should remain.
  const others: any = await db.execute(
    sql`SELECT COUNT(*) AS c FROM users WHERE role <> 'admin'`,
  );
  const otherRows = (Array.isArray(others) ? others[0] : others) as any[];
  const c = Number(otherRows[0]?.c ?? 0);
  if (c > 0) {
    // Not a hard fail — operator may have onboarded real users already —
    // but warn so a fresh-deploy mistake is visible.
    ok(`additional users present: ${c} (OK if you've onboarded real users; should be 0 on a fresh deploy)`);
  } else {
    ok("no demo/leftover landlord or tenant rows");
  }
}

async function checkVersionFiles() {
  const fs = await import("node:fs/promises");
  const versionFile = await fs.readFile("constants/app-version.ts", "utf-8");
  const m = versionFile.match(/APP_VERSION\s*=\s*"([^"]+)"/);
  if (!m) return fail("APP_VERSION readable", "constants/app-version.ts could not be parsed");
  const appVer = m[1];
  ok(`APP_VERSION = ${appVer}`);

  const cfg = await fs.readFile("app.config.ts", "utf-8");
  const m2 = cfg.match(/version:\s*"([^"]+)"/);
  if (!m2) return fail("app.config.ts version readable", "could not parse");
  if (m2[1] !== appVer) {
    return fail(
      "version files agree",
      `constants/app-version.ts=${appVer}  ≠  app.config.ts=${m2[1]} — bump in lock-step`,
    );
  }
  ok(`app.config.ts version matches (${m2[1]})`);

  // package.json version — used by the Manus Publish Mobile App card and by
  // EAS Build as the Android versionName / iOS CFBundleShortVersionString.
  const pkg = await fs.readFile("package.json", "utf-8");
  const pkgJson = JSON.parse(pkg) as { version?: string };
  if (!pkgJson.version) return fail("package.json version readable", "missing version field");
  if (pkgJson.version !== appVer) {
    return fail(
      "package.json version agrees",
      `package.json=${pkgJson.version}  ≠  APP_VERSION=${appVer} — bump in lock-step (this is what the Publish card shows)`,
    );
  }
  ok(`package.json version matches (${pkgJson.version})`);
}

async function checkApiUrlEnv() {
  const url = process.env.EXPO_PUBLIC_API_URL;
  const legacy = process.env.EXPO_PUBLIC_API_BASE_URL;

  if (!url && !legacy) {
    // Not strictly fatal here — dev runs can derive the URL from
    // window.location — but for a real deploy this should be set.
    ok(
      "EXPO_PUBLIC_API_URL not set (OK for local dev; REQUIRED for EAS production build)",
    );
    return;
  }

  const chosen = url ?? legacy!;
  if (!/^https?:\/\//i.test(chosen)) {
    return fail(
      "EXPO_PUBLIC_API_URL is a valid URL",
      `value=${chosen.slice(0, 64)}… — must start with http:// or https://`,
    );
  }
  // Catch ephemeral sandbox URLs that would brick an APK after sandbox
  // hibernation (~30 min). These are recognizable by the *.manus.computer
  // domain that Manus webdev exposes for live preview. Production must use
  // *.manus.space (Manus Cloud) or a custom HTTPS domain.
  if (/\.manus\.computer\b/i.test(chosen)) {
    return fail(
      "EXPO_PUBLIC_API_URL is not an ephemeral sandbox URL",
      `value=${chosen}\n` +
        `         This is a Manus webdev sandbox preview URL. It will stop\n` +
        `         resolving when the sandbox hibernates (~30 min idle), and any\n` +
        `         APK shipped with this URL will be permanently dead.\n` +
        `         FIX: Click "Publish" in the Manus webdev UI to provision a\n` +
        `         persistent *.manus.space domain, then set:\n` +
        `           webdev_request_secrets({\n` +
        `             secrets: [{\n` +
        `               key: "EXPO_PUBLIC_API_URL",\n` +
        `               value: "https://<your-app>.manus.space",\n` +
        `               preventMatching: true\n` +
        `             }]\n` +
        `           })\n` +
        `         Then restart the dev server and re-run this audit.`,
    );
  }

  if (/^http:\/\//i.test(chosen)) {
    ok(`EXPO_PUBLIC_API_URL set (⚠  http:// — production should use https://): ${chosen}`);
  } else {
    ok(`EXPO_PUBLIC_API_URL set: ${chosen}`);
  }

  if (url && legacy && url !== legacy) {
    return fail(
      "EXPO_PUBLIC_API_URL and EXPO_PUBLIC_API_BASE_URL agree",
      `_API_URL=${url}  ≠  _API_BASE_URL=${legacy} — unset one or make them equal`,
    );
  }

  // M-1: Server-side API_BASE_URL (used by the tRPC server itself for
  // self-referential URLs in emails, redirects, etc.) should agree with
  // the mobile EXPO_PUBLIC_API_URL. They are independent envs and easy
  // to drift apart.
  const serverApi = process.env.API_BASE_URL;
  if (serverApi && serverApi !== chosen) {
    ok(
      `API_BASE_URL=${serverApi} differs from EXPO_PUBLIC_API_URL=${chosen} ` +
        `(non-fatal but worth confirming both point at the same deployment)`,
    );
  }

  // Best-effort live probe of /api/version. Skipped if the URL is
  // localhost or otherwise clearly not yet deployed; failures here are a
  // soft warning rather than a hard fail because the server may not be
  // running at audit time.
  // M-3: 3-attempt retry with exponential backoff (250ms, 500ms, 1000ms).
  // Cloud Run cold starts and intermittent network blips otherwise produce
  // false-positive "server not deployed" warnings during cutover.
  if (/^https:\/\//i.test(chosen) && !/localhost|127\.0\.0\.1/.test(chosen)) {
    let lastErr: Error | null = null;
    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt - 1)));
      }
      try {
        const res = await fetch(`${chosen.replace(/\/+$/, "")}/api/version`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        const body = (await res.json().catch(() => ({}))) as { version?: string };
        if (body.version) {
          ok(`live /api/version reports ${body.version} (attempt ${attempt + 1}/3)`);
        } else {
          ok(
            `live /api/version reachable but response did not include \`version\` (attempt ${attempt + 1}/3)`,
          );
        }
        success = true;
      } catch (err) {
        lastErr = err as Error;
      }
    }
    if (!success) {
      ok(
        `live /api/version probe skipped after 3 attempts: ${lastErr?.message ?? "unknown"} (OK pre-deploy)`,
      );
    }
  }
}

async function checkKeystoreChoice() {
  // H-3: KEYSTORE_CHOICE is only a hint string, but a typo silently lets
  // the EAS build pick the wrong keystore. Validate strictly.
  const v = (process.env.KEYSTORE_CHOICE ?? "").trim().toUpperCase();
  if (!v) {
    // Soft warn only; the build CLI will fall back to interactive prompt
    // (which the agent's non-interactive flag will then refuse).
    ok("KEYSTORE_CHOICE set", "unset (operator must answer at build time)");
    return;
  }
  if (!/^[ABC]$/.test(v)) {
    fail(
      "KEYSTORE_CHOICE valid",
      `value '${process.env.KEYSTORE_CHOICE}' is not one of A,B,C. ` +
        `A = let EAS manage; B = upload existing; C = generate new local keystore.`
    );
    return;
  }
  ok("KEYSTORE_CHOICE valid", v);
}

async function checkTestSnapshot() {
  // H-2: Compare runtime test count against tests/SNAPSHOT.txt to catch
  // accidental test deletions or silently-skipped suites.
  const fs = await import("fs");
  if (!fs.existsSync("tests/SNAPSHOT.txt")) {
    fail("test snapshot present", "tests/SNAPSHOT.txt missing");
    return;
  }
  // Cheap delegation: shell-out to verify:tests so we share one parser.
  // verify-tests.ts exits 0 / 1 / non-zero with a clear message.
  const { execSync } = await import("child_process");
  try {
    execSync("pnpm --silent verify:tests", { stdio: "pipe" });
    ok("test snapshot matches");
  } catch (e: any) {
    const stderr = (e.stderr ?? "").toString();
    const stdout = (e.stdout ?? "").toString();
    const last = (stderr + stdout).split("\n").filter(Boolean).pop() ?? "verify-tests failed";
    fail("test snapshot matches", last);
  }
}

async function main() {
  console.log("== verify-deploy ==");
  console.log("   (Tip: run `pnpm check:env` first if you suspect runtime-injected env conflicts — see MANUS_HANDOFF.txt §4b)\n");
  try {
    await checkEnv();
    await checkSchema();
    await checkAdmin();
    await checkVersionFiles();
    await checkEasProjectId();
    await checkApiUrlEnv();
    await checkKeystoreChoice();
    await checkTestSnapshot();
  } catch (err) {
    fail("unexpected error", String(err));
  }

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const tag = r.ok ? "✓" : "✗";
    console.log(`  ${tag}  ${r.name}${r.detail ? "  — " + r.detail : ""}`);
    r.ok ? passed++ : failed++;
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
