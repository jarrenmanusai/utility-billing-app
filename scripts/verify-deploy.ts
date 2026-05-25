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
  if (!process.env.DATABASE_URL) return fail("DATABASE_URL set", "missing");
  ok("DATABASE_URL set");

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return fail("JWT_SECRET set & strong", `len=${(process.env.JWT_SECRET || "").length} (require ≥32 chars)`);
  }
  ok("JWT_SECRET set & strong");

  if (process.env.OAUTH_SERVER_URL || process.env.OWNER_OPEN_ID) {
    return fail(
      "OAuth disabled",
      `OAUTH_SERVER_URL=${process.env.OAUTH_SERVER_URL || "(unset)"}, OWNER_OPEN_ID=${process.env.OWNER_OPEN_ID || "(unset)"} — both must be unset`,
    );
  }
  ok("OAuth disabled (no OAUTH_SERVER_URL / OWNER_OPEN_ID)");
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

  // Best-effort live probe of /api/version. Skipped if the URL is
  // localhost or otherwise clearly not yet deployed; failures here are a
  // soft warning rather than a hard fail because the server may not be
  // running at audit time.
  if (/^https:\/\//i.test(chosen) && !/localhost|127\.0\.0\.1/.test(chosen)) {
    try {
      const res = await fetch(`${chosen.replace(/\/+$/, "")}/api/version`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        ok(
          `live /api/version probe returned HTTP ${res.status} (server may not be deployed yet — OK to ignore pre-publish)`,
        );
      } else {
        const body = (await res.json().catch(() => ({}))) as { version?: string };
        if (body.version) {
          ok(`live /api/version reports ${body.version}`);
        } else {
          ok("live /api/version reachable but response did not include `version`");
        }
      }
    } catch (err) {
      ok(
        `live /api/version probe skipped: ${(err as Error).message} (OK pre-deploy)`,
      );
    }
  }
}

async function main() {
  console.log("== verify-deploy ==");
  try {
    await checkEnv();
    await checkSchema();
    await checkAdmin();
    await checkVersionFiles();
    await checkApiUrlEnv();
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
