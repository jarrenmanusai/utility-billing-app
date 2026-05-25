import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow. Used by both Manus OAuth (admin only via OWNER_OPEN_ID)
 * and custom email/password auth for landlords and tenants.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId). Populated only for admin (the owner). Optional for landlords/tenants. */
  openId: varchar("openId", { length: 64 }).unique(),
  /** Email is the primary identifier for custom auth (landlords and tenants). */
  email: varchar("email", { length: 320 }).unique(),
  /** bcrypt hash for password-based auth (landlords/tenants). NULL for OAuth-only admin. */
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /**
   * Philippine mobile number, normalised to E.164 (+63XXXXXXXXXX, 13 chars).
   * Required at landlord registration; optional for tenants/admin (NULL).
   */
  phone: varchar("phone", { length: 20 }),
  /** Role determines the home screen and permissions. */
  role: mysqlEnum("role", ["landlord", "tenant", "admin"]).default("landlord").notNull(),
  /** Status: pending = awaiting admin approval, active = approved, frozen = blocked, deleted = soft-deleted. */
  status: mysqlEnum("status", ["pending", "active", "frozen", "deleted"]).default("pending").notNull(),
  /** For tenants, the ID of the landlord who created them. NULL for landlords/admin. */
  landlordId: int("landlordId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** When the user was soft-deleted (for 30-day restore window). */
  deletedAt: timestamp("deletedAt"),
});

/** Utility types defined by each landlord (Electric, Water, Internet, etc.) */
export const utilities = mysqlTable("utilities", {
  id: int("id").autoincrement().primaryKey(),
  landlordId: int("landlordId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull().default("unit"),
  defaultRate: decimal("defaultRate", { precision: 12, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Bills issued to a tenant by a landlord. */
export const bills = mysqlTable("bills", {
  id: int("id").autoincrement().primaryKey(),
  landlordId: int("landlordId").notNull(),
  tenantId: int("tenantId").notNull(),
  status: mysqlEnum("status", ["draft", "deployed", "paid"]).default("draft").notNull(),
  totalAmount: decimal("totalAmount", { precision: 14, scale: 2 }).notNull().default("0"),
  dueDate: timestamp("dueDate"),
  meterPhotoUrl: varchar("meterPhotoUrl", { length: 500 }),
  notes: text("notes"),
  deployedAt: timestamp("deployedAt"),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Line items on a bill (one per utility). */
export const billItems = mysqlTable("bill_items", {
  id: int("id").autoincrement().primaryKey(),
  billId: int("billId").notNull(),
  utilityId: int("utilityId").notNull(),
  previousReading: decimal("previousReading", { precision: 14, scale: 4 }).notNull().default("0"),
  currentReading: decimal("currentReading", { precision: 14, scale: 4 }).notNull().default("0"),
  rate: decimal("rate", { precision: 12, scale: 4 }).notNull().default("0"),
  consumption: decimal("consumption", { precision: 14, scale: 4 }).notNull().default("0"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"),
});

/** Payment proofs uploaded by tenants. */
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  billId: int("billId").notNull(),
  tenantId: int("tenantId").notNull(),
  proofUrl: varchar("proofUrl", { length: 500 }).notNull(),
  note: text("note"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  verifiedAt: timestamp("verifiedAt"),
});

/** 1:1 conversation between a landlord and a tenant. */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  landlordId: int("landlordId").notNull(),
  tenantId: int("tenantId").notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
});

/** Chat messages — supports text + optional attachment. */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId").notNull(),
  body: text("body"),
  attachmentUrl: varchar("attachmentUrl", { length: 500 }),
  attachmentType: varchar("attachmentType", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
});

/** In-app notifications. */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  payload: text("payload"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Auth attempt log for anti-spam dashboard (last 50). */
export const authLogs = mysqlTable("auth_logs", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }),
  ip: varchar("ip", { length: 64 }),
  success: boolean("success").notNull().default(false),
  action: varchar("action", { length: 32 }).notNull().default("login"),
  attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
});

/** Email domain blocklist managed by admin. */
export const blocklist = mysqlTable("blocklist", {
  id: int("id").autoincrement().primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Platform settings (singleton row id=1). */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  pendingLandlordCap: int("pendingLandlordCap").notNull().default(100),
});

/** APK releases. */
export const apkReleases = mysqlTable("apk_releases", {
  id: int("id").autoincrement().primaryKey(),
  version: varchar("version", { length: 32 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 500 }).notNull(),
  notes: text("notes"),
  isLive: boolean("isLive").notNull().default(false),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  publishedAt: timestamp("publishedAt"),
});

/** 24-hour password reset tokens. */
export const resetTokens = mysqlTable("reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ----- Types -----
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Utility = typeof utilities.$inferSelect;
export type InsertUtility = typeof utilities.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type InsertBill = typeof bills.$inferInsert;
export type BillItem = typeof billItems.$inferSelect;
export type InsertBillItem = typeof billItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type AuthLog = typeof authLogs.$inferSelect;
export type InsertAuthLog = typeof authLogs.$inferInsert;
export type Blocklist = typeof blocklist.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type ApkRelease = typeof apkReleases.$inferSelect;
export type InsertApkRelease = typeof apkReleases.$inferInsert;
export type ResetToken = typeof resetTokens.$inferSelect;
export type InsertResetToken = typeof resetTokens.$inferInsert;
