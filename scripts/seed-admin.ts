/**
 * scripts/seed-admin.ts
 *
 * One-shot CLI that prepares a brand-new database for production use:
 *
 *   1. Wipes every existing user (and dependent rows) so no demo
 *      landlord/tenant/admin survives from a previous environment.
 *   2. Creates exactly ONE admin account using the project's real auth
 *      helpers (`server/auth.ts -> hashPassword` and `server/db.ts ->
 *      createUser`).
 *   3. Verifies the result by querying back and printing a summary.
 *
 * The default credentials below are *bootstrap-only* and MUST be rotated
 * by the operator on first sign-in (Settings -> Security inside the app).
 *
 * Usage:
 *   pnpm seed:admin
 *
 *   # or override via env vars:
 *   ADMIN_EMAIL=foo@bar.com ADMIN_PASSWORD='secret' pnpm seed:admin
 *
 * Safety:
 *   - Refuses to run if NODE_ENV=production unless ALLOW_PROD_SEED=1 is set.
 *     This prevents an accidental wipe of a live database.
 *   - The wipe respects MySQL FK constraints by deleting child rows in
 *     dependency order. We also toggle FOREIGN_KEY_CHECKS as a safety net
 *     for any FK we don't know about (e.g. additions in newer migrations).
 */
import "dotenv/config";

import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { hashPassword } from "../server/auth";
import { createUser, getUserByEmail } from "../server/db";
import {
  apkReleases,
  authLogs,
  billItems,
  bills,
  blocklist,
  conversations,
  messages,
  notifications,
  payments,
  resetTokens,
  settings,
  users,
  utilities,
} from "../drizzle/schema";

// ---------- defaults (override via env) ----------
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "jarren.manusai@outlook.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "030921manusai!@!";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Jarren (Admin)";
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "+639000000000";

function ensureSafe() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    throw new Error(
      "[seed-admin] NODE_ENV=production. Refusing to seed without ALLOW_PROD_SEED=1.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("[seed-admin] DATABASE_URL is not set.");
  }
}

async function wipeAll() {
  // Bring up our own drizzle handle so we can issue raw SQL alongside
  // the table-level deletes. Reusing the server's exported `_db` cache
  // would also work, but a fresh handle keeps this script self-contained.
  const db = drizzle(process.env.DATABASE_URL!);

  console.log("[seed-admin] Wiping every existing row (users + dependents)...");
  // Drop FK enforcement for the duration of the wipe. Even with the
  // dependency order below, brand-new migrations could add a FK we don't
  // know about — this guarantees the wipe still completes.
  try {
    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  } catch (e) {
    console.warn("[seed-admin] Could not toggle FOREIGN_KEY_CHECKS:", e);
  }

  // child-first order for environments where FK toggling is forbidden
  await db.delete(messages);
  await db.delete(conversations);
  await db.delete(payments);
  await db.delete(billItems);
  await db.delete(bills);
  await db.delete(utilities);
  await db.delete(notifications);
  await db.delete(resetTokens);
  await db.delete(authLogs);
  await db.delete(blocklist);
  await db.delete(apkReleases);
  await db.delete(settings);
  await db.delete(users);

  try {
    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
  } catch {
    // ignore
  }
}

async function seedAdmin(): Promise<number> {
  console.log(`[seed-admin] Hashing password (bcrypt cost 10)...`);
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  console.log(`[seed-admin] Creating admin: ${ADMIN_EMAIL}`);
  const id = await createUser({
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    phone: ADMIN_PHONE,
    passwordHash,
    role: "admin",
    status: "active",
    loginMethod: "email_password",
  });

  console.log(`[seed-admin] Inserted user id=${id}`);
  return id;
}

async function verify() {
  const adminUser = await getUserByEmail(ADMIN_EMAIL);
  if (!adminUser) {
    throw new Error("[seed-admin] Verification failed — admin row not found.");
  }
  if (adminUser.role !== "admin" || adminUser.status !== "active") {
    throw new Error(
      `[seed-admin] Verification failed — role=${adminUser.role} status=${adminUser.status}`,
    );
  }
  console.log("[seed-admin] Verified ✓");
  console.log("[seed-admin] ----- summary -----");
  console.log(`  email   : ${adminUser.email}`);
  console.log(`  role    : ${adminUser.role}`);
  console.log(`  status  : ${adminUser.status}`);
  console.log(`  id      : ${adminUser.id}`);
  console.log("");
  console.log("Sign in at /login and rotate the password from Settings -> Security.");
}

async function main() {
  ensureSafe();
  await wipeAll();
  await seedAdmin();
  await verify();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-admin] FATAL", err);
  process.exit(1);
});
