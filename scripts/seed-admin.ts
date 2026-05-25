/**
 * Seed an admin user into the database.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts --email admin@example.com --password yourpassword --name "Admin"
 *
 * Requires DATABASE_URL to be set in .env or environment.
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema.js";
import bcrypt from "bcryptjs";

async function main() {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf("--email");
  const passwordIdx = args.indexOf("--password");
  const nameIdx = args.indexOf("--name");

  const email = emailIdx >= 0 ? args[emailIdx + 1] : undefined;
  const password = passwordIdx >= 0 ? args[passwordIdx + 1] : undefined;
  const name = nameIdx >= 0 ? args[nameIdx + 1] : "Admin";

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/seed-admin.ts --email <email> --password <password> [--name <name>]");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL);
  const passwordHash = await bcrypt.hash(password, 10);

  // Check if admin already exists
  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  if (existing.length > 0) {
    // Update existing user to admin
    await db
      .update(users)
      .set({ role: "admin", status: "active", passwordHash, name })
      .where(eq(users.email, email.toLowerCase()));
    console.log(`✓ Updated existing user "${email}" to admin role.`);
  } else {
    // Create new admin
    await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: "admin",
      status: "active",
      loginMethod: "email",
    });
    console.log(`✓ Created admin user "${email}".`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed admin:", err);
  process.exit(1);
});
