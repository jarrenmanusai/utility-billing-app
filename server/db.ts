import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  apkReleases,
  authLogs,
  billItems,
  bills,
  blocklist,
  conversations,
  InsertApkRelease,
  InsertAuthLog,
  InsertBill,
  InsertBillItem,
  InsertConversation,
  InsertMessage,
  InsertNotification,
  InsertPayment,
  InsertResetToken,
  InsertUser,
  InsertUtility,
  messages,
  notifications,
  payments,
  resetTokens,
  settings,
  users,
  utilities,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

// ============================================================
// USERS
// ============================================================

/** Upsert from Manus OAuth (admin only path). */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      values.status = "active";
      updateSet.role = "admin";
      updateSet.status = "active";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUser(data: InsertUser): Promise<number> {
  const db = await requireDb();
  if (data.email) data.email = data.email.toLowerCase();
  const res = await db.insert(users).values(data);
  return Number((res as any)[0]?.insertId ?? (res as any).insertId);
}

export async function updateUser(
  id: number,
  patch: Partial<InsertUser>,
): Promise<void> {
  const db = await requireDb();
  if (patch.email) patch.email = patch.email.toLowerCase();
  await db.update(users).set(patch).where(eq(users.id, id));
}

export async function listTenantsByLandlord(landlordId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(users)
    .where(
      and(
        eq(users.landlordId, landlordId),
        eq(users.role, "tenant"),
        or(isNull(users.deletedAt), eq(users.status, "active"), eq(users.status, "frozen")),
      ),
    )
    .orderBy(desc(users.createdAt));
}

export async function listLandlords(status?: "pending" | "active" | "frozen" | "deleted") {
  const db = await requireDb();
  if (status) {
    return db
      .select()
      .from(users)
      .where(and(eq(users.role, "landlord"), eq(users.status, status)))
      .orderBy(desc(users.createdAt));
  }
  return db.select().from(users).where(eq(users.role, "landlord")).orderBy(desc(users.createdAt));
}

export async function countPendingLandlords(): Promise<number> {
  const db = await requireDb();
  const res = await db
    .select({ c: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "landlord"), eq(users.status, "pending")));
  return Number(res[0]?.c ?? 0);
}

// ============================================================
// UTILITIES
// ============================================================

export async function listUtilities(landlordId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(utilities)
    .where(eq(utilities.landlordId, landlordId))
    .orderBy(utilities.name);
}

export async function createUtility(data: InsertUtility) {
  const db = await requireDb();
  const res = await db.insert(utilities).values(data);
  return Number((res as any)[0]?.insertId ?? (res as any).insertId);
}

export async function updateUtility(id: number, patch: Partial<InsertUtility>) {
  const db = await requireDb();
  await db.update(utilities).set(patch).where(eq(utilities.id, id));
}

export async function deleteUtility(id: number) {
  const db = await requireDb();
  await db.delete(utilities).where(eq(utilities.id, id));
}

export async function getUtility(id: number) {
  const db = await requireDb();
  const r = await db.select().from(utilities).where(eq(utilities.id, id)).limit(1);
  return r[0];
}

// ============================================================
// BILLS
// ============================================================

export async function createBill(data: InsertBill) {
  const db = await requireDb();
  const res = await db.insert(bills).values(data);
  return Number((res as any)[0]?.insertId ?? (res as any).insertId);
}

export async function updateBill(id: number, patch: Partial<InsertBill>) {
  const db = await requireDb();
  await db.update(bills).set(patch).where(eq(bills.id, id));
}

export async function getBill(id: number) {
  const db = await requireDb();
  const r = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
  return r[0];
}

export async function listBillsByLandlord(landlordId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      id: bills.id,
      landlordId: bills.landlordId,
      tenantId: bills.tenantId,
      status: bills.status,
      totalAmount: bills.totalAmount,
      dueDate: bills.dueDate,
      meterPhotoUrl: bills.meterPhotoUrl,
      notes: bills.notes,
      createdAt: bills.createdAt,
      paidAt: bills.paidAt,
      tenantName: users.name,
      tenantEmail: users.email,
    })
    .from(bills)
    .leftJoin(users, eq(users.id, bills.tenantId))
    .where(eq(bills.landlordId, landlordId))
    .orderBy(desc(bills.createdAt));
  return rows;
}

export async function listBillsByTenant(tenantId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(bills)
    .where(and(eq(bills.tenantId, tenantId), or(eq(bills.status, "deployed"), eq(bills.status, "paid"))!))
    .orderBy(desc(bills.createdAt));
}

export async function deleteBill(id: number) {
  const db = await requireDb();
  await db.delete(billItems).where(eq(billItems.billId, id));
  await db.delete(payments).where(eq(payments.billId, id));
  await db.delete(bills).where(eq(bills.id, id));
}

export async function listBillItems(billId: number) {
  const db = await requireDb();
  return db.select().from(billItems).where(eq(billItems.billId, billId));
}

export async function replaceBillItems(billId: number, items: InsertBillItem[]) {
  const db = await requireDb();
  await db.delete(billItems).where(eq(billItems.billId, billId));
  if (items.length > 0) {
    await db.insert(billItems).values(items.map((it) => ({ ...it, billId })));
  }
}

/** A1: Find the previous reading for a given (tenant, utility) — i.e., the
 * currentReading of the most recent deployed/paid bill that included this utility. */
export async function getLatestReadingForTenantUtility(
  tenantId: number,
  utilityId: number,
): Promise<number | null> {
  const db = await requireDb();
  const result = await db
    .select({
      currentReading: billItems.currentReading,
      createdAt: bills.createdAt,
    })
    .from(billItems)
    .innerJoin(bills, eq(billItems.billId, bills.id))
    .where(
      and(
        eq(bills.tenantId, tenantId),
        eq(billItems.utilityId, utilityId),
        or(eq(bills.status, "deployed"), eq(bills.status, "paid")),
      ),
    )
    .orderBy(desc(bills.createdAt))
    .limit(1);
  if (result.length === 0) return null;
  return Number(result[0].currentReading);
}

// ============================================================
// PAYMENTS
// ============================================================

export async function createPayment(data: InsertPayment) {
  const db = await requireDb();
  const res = await db.insert(payments).values(data);
  return Number((res as any)[0]?.insertId ?? (res as any).insertId);
}

export async function getPaymentsForBill(billId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(payments)
    .where(eq(payments.billId, billId))
    .orderBy(desc(payments.uploadedAt));
}

// ============================================================
// CONVERSATIONS & MESSAGES
// ============================================================

export async function getOrCreateConversation(
  landlordId: number,
  tenantId: number,
): Promise<number> {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.landlordId, landlordId), eq(conversations.tenantId, tenantId)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const res = await db.insert(conversations).values({ landlordId, tenantId });
  return Number((res as any)[0]?.insertId ?? (res as any).insertId);
}

export async function listConversationsForLandlord(landlordId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.landlordId, landlordId))
    .orderBy(desc(conversations.lastMessageAt));
}

export async function listConversationsForTenant(tenantId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.tenantId, tenantId))
    .orderBy(desc(conversations.lastMessageAt));
}

export async function getConversation(id: number) {
  const db = await requireDb();
  const r = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return r[0];
}

export async function listMessages(conversationId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function createMessage(data: InsertMessage) {
  const db = await requireDb();
  const res = await db.insert(messages).values(data);
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, data.conversationId));
  return Number((res as any)[0]?.insertId ?? (res as any).insertId);
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export async function createNotification(data: InsertNotification) {
  const db = await requireDb();
  await db.insert(notifications).values(data);
}

export async function listNotifications(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
}

export async function markAllNotificationsRead(userId: number) {
  const db = await requireDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/**
 * Mark a single notification as read. Owner-scoped: only the recipient can
 * mark their own notifications. Idempotent — calling twice is a no-op.
 */
export async function markNotificationRead(userId: number, id: number) {
  const db = await requireDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
}

// ============================================================
// AUTH LOGS / BLOCKLIST / SETTINGS
// ============================================================

export async function logAuthAttempt(data: InsertAuthLog) {
  const db = await requireDb();
  await db.insert(authLogs).values(data);
}

export async function listRecentAuthLogs(limit = 50) {
  const db = await requireDb();
  return db.select().from(authLogs).orderBy(desc(authLogs.attemptedAt)).limit(limit);
}

export async function listBlocklist() {
  const db = await requireDb();
  return db.select().from(blocklist).orderBy(blocklist.domain);
}

export async function isDomainBlocked(domain: string): Promise<boolean> {
  const db = await requireDb();
  const r = await db.select().from(blocklist).where(eq(blocklist.domain, domain.toLowerCase())).limit(1);
  return r.length > 0;
}

export async function addBlockedDomain(domain: string) {
  const db = await requireDb();
  await db.insert(blocklist).values({ domain: domain.toLowerCase() });
}

export async function removeBlockedDomain(domain: string) {
  const db = await requireDb();
  await db.delete(blocklist).where(eq(blocklist.domain, domain.toLowerCase()));
}

export async function getSettings() {
  const db = await requireDb();
  const r = await db.select().from(settings).limit(1);
  if (r.length > 0) return r[0];
  await db.insert(settings).values({ pendingLandlordCap: 100 });
  const r2 = await db.select().from(settings).limit(1);
  return r2[0];
}

export async function updateSettings(patch: { pendingLandlordCap?: number }) {
  const db = await requireDb();
  const s = await getSettings();
  await db.update(settings).set(patch).where(eq(settings.id, s.id));
}

// ============================================================
// APK RELEASES
// ============================================================

export async function listApkReleases() {
  const db = await requireDb();
  return db.select().from(apkReleases).orderBy(desc(apkReleases.uploadedAt));
}

export async function createApkRelease(data: InsertApkRelease) {
  const db = await requireDb();
  const res = await db.insert(apkReleases).values(data);
  return Number((res as any)[0]?.insertId ?? (res as any).insertId);
}

export async function publishApkRelease(id: number) {
  const db = await requireDb();
  // Unpublish all others first, then publish this one
  await db.update(apkReleases).set({ isLive: false }).where(eq(apkReleases.isLive, true));
  await db
    .update(apkReleases)
    .set({ isLive: true, publishedAt: new Date() })
    .where(eq(apkReleases.id, id));
}

export async function deleteApkRelease(id: number) {
  const db = await requireDb();
  await db.delete(apkReleases).where(eq(apkReleases.id, id));
}

export async function getLiveApkRelease() {
  const db = await requireDb();
  const r = await db.select().from(apkReleases).where(eq(apkReleases.isLive, true)).limit(1);
  return r[0];
}

/**
 * Look up an APK release by id (used when admin publishes a specific record so
 * we can include the version + notes in the fan-out notification body).
 */
export async function getApkReleaseById(id: number) {
  const db = await requireDb();
  const r = await db.select().from(apkReleases).where(eq(apkReleases.id, id)).limit(1);
  return r[0];
}

/**
 * List the user-ids of every currently-active landlord or tenant. Used to
 * fan-out an `app_update` notification when a new APK release is published
 * by the admin. Excludes admins (who deployed the update themselves) and any
 * pending/frozen/deleted accounts.
 */
export async function listActiveLandlordAndTenantIds(): Promise<number[]> {
  const db = await requireDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        or(eq(users.role, "landlord"), eq(users.role, "tenant")),
        eq(users.status, "active"),
      ),
    );
  return rows.map((r) => Number(r.id));
}

// ============================================================
// RESET TOKENS
// ============================================================

export async function createResetToken(data: InsertResetToken) {
  const db = await requireDb();
  await db.insert(resetTokens).values(data);
}

export async function getValidResetToken(token: string) {
  const db = await requireDb();
  const r = await db
    .select()
    .from(resetTokens)
    .where(and(eq(resetTokens.token, token), isNull(resetTokens.usedAt), gt(resetTokens.expiresAt, new Date())))
    .limit(1);
  return r[0];
}

export async function markResetTokenUsed(id: number) {
  const db = await requireDb();
  await db.update(resetTokens).set({ usedAt: new Date() }).where(eq(resetTokens.id, id));
}

// ============================================================
// STATS
// ============================================================

export async function getPlatformStats() {
  const db = await requireDb();
  const [landlordCount, tenantCount, billCount, revenueRow, pendingRow, frozenRow] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "landlord"), eq(users.status, "active"))),
    db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "tenant"), eq(users.status, "active"))),
    db.select({ c: sql<number>`count(*)` }).from(bills),
    db
      .select({ total: sql<number>`coalesce(sum(${bills.totalAmount}), 0)` })
      .from(bills)
      .where(eq(bills.status, "paid")),
    db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "landlord"), eq(users.status, "pending"))),
    db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "landlord"), eq(users.status, "frozen"))),
  ]);
  return {
    landlords: Number(landlordCount[0]?.c ?? 0),
    tenants: Number(tenantCount[0]?.c ?? 0),
    bills: Number(billCount[0]?.c ?? 0),
    revenue: Number(revenueRow[0]?.total ?? 0),
    pendingLandlords: Number(pendingRow[0]?.c ?? 0),
    frozenLandlords: Number(frozenRow[0]?.c ?? 0),
  };
}

/** List soft-deleted landlords (deletedAt in last 30 days). */
export async function listTrashedLandlords() {
  const db = await requireDb();
  return db
    .select()
    .from(users)
    .where(and(eq(users.role, "landlord"), eq(users.status, "deleted")))
    .orderBy(desc(users.deletedAt));
}

// ----- Cascade delete helpers (admin) -----

/**
 * Soft-delete a landlord and all of their tenants.
 * Marks landlord + tenants as status="deleted" so they can no longer sign in.
 * Bills/messages remain so the admin can still see history; they become orphans
 * but are visible only via the trashed user.
 */
export async function softDeleteLandlordCascade(landlordId: number) {
  const db = await requireDb();
  const now = new Date();
  // Soft-delete tenants of this landlord
  await db
    .update(users)
    .set({ status: "deleted", deletedAt: now })
    .where(and(eq(users.role, "tenant"), eq(users.landlordId, landlordId)));
  // Soft-delete the landlord
  await db
    .update(users)
    .set({ status: "deleted", deletedAt: now })
    .where(eq(users.id, landlordId));
}

/**
 * Permanently delete a landlord and EVERYTHING associated:
 * tenants, utilities, bills, bill items, payments, conversations, messages,
 * notifications, and reset tokens. Returns counts for confirmation.
 */
export async function permanentDeleteLandlordCascade(landlordId: number) {
  const db = await requireDb();

  // 1. Find all tenants of this landlord
  const tenantRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "tenant"), eq(users.landlordId, landlordId)));
  const tenantIds = tenantRows.map((r) => r.id);

  // 2. Find all bills of this landlord
  const billRows = await db
    .select({ id: bills.id })
    .from(bills)
    .where(eq(bills.landlordId, landlordId));
  const billIds = billRows.map((r) => r.id);

  // 3. Delete bill items + payments for these bills
  if (billIds.length > 0) {
    await db.delete(billItems).where(inArray(billItems.billId, billIds));
    await db.delete(payments).where(inArray(payments.billId, billIds));
    await db.delete(bills).where(inArray(bills.id, billIds));
  }

  // 4. Conversations + messages
  const convRows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.landlordId, landlordId));
  const convIds = convRows.map((r) => r.id);
  if (convIds.length > 0) {
    await db.delete(messages).where(inArray(messages.conversationId, convIds));
    await db.delete(conversations).where(inArray(conversations.id, convIds));
  }

  // 5. Utilities
  await db.delete(utilities).where(eq(utilities.landlordId, landlordId));

  // 6. Notifications and reset tokens for landlord + tenants
  const allUserIds = [landlordId, ...tenantIds];
  if (allUserIds.length > 0) {
    await db.delete(notifications).where(inArray(notifications.userId, allUserIds));
    await db.delete(resetTokens).where(inArray(resetTokens.userId, allUserIds));
  }

  // 7. Finally remove tenants and landlord
  if (tenantIds.length > 0) {
    await db.delete(users).where(inArray(users.id, tenantIds));
  }
  await db.delete(users).where(eq(users.id, landlordId));

  return {
    tenants: tenantIds.length,
    bills: billIds.length,
    conversations: convIds.length,
  };
}
