import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// We test the cascade-delete db helpers by mocking the drizzle factory so that
// the internal `requireDb` returns our spy db. This guards against regressions
// where soft-delete forgets tenants, or permanent-delete forgets dependent rows.

const deleteCalls: { table: string }[] = [];
const updateCalls: { table: string; setValues: any }[] = [];
const selectCalls: { table: string }[] = [];

const fakeDb = {
  select: (_cols?: any) => ({
    from: (table: any) => ({
      where: (_w: any) => {
        selectCalls.push({ table: table.__table });
        if (table.__table === "users") return Promise.resolve([{ id: 201 }, { id: 202 }]);
        if (table.__table === "bills") return Promise.resolve([{ id: 901 }, { id: 902 }]);
        if (table.__table === "conversations") return Promise.resolve([{ id: 701 }]);
        return Promise.resolve([]);
      },
    }),
  }),
  update: (table: any) => ({
    set: (setValues: any) => ({
      where: (_w: any) => {
        updateCalls.push({ table: table.__table, setValues });
        return Promise.resolve();
      },
    }),
  }),
  delete: (table: any) => ({
    where: (_w: any) => {
      deleteCalls.push({ table: table.__table });
      return Promise.resolve();
    },
  }),
};

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => fakeDb,
}));

vi.mock("../drizzle/schema", () => {
  const tag = (name: string) => ({ __table: name });
  return {
    users: { ...tag("users"), id: "id", role: "role", landlordId: "landlordId", status: "status" },
    utilities: { ...tag("utilities"), landlordId: "landlordId" },
    bills: { ...tag("bills"), id: "id", landlordId: "landlordId" },
    billItems: { ...tag("bill_items"), billId: "billId" },
    payments: { ...tag("payments"), billId: "billId" },
    conversations: { ...tag("conversations"), id: "id", landlordId: "landlordId" },
    messages: { ...tag("messages"), conversationId: "conversationId" },
    notifications: { ...tag("notifications"), userId: "userId" },
    resetTokens: { ...tag("reset_tokens"), userId: "userId" },
    apkReleases: tag("apk_releases"),
    authLogs: tag("auth_logs"),
    blocklist: tag("blocklist"),
    settings: tag("settings"),
  };
});

vi.mock("drizzle-orm", () => {
  const wrap = (label: string) => (...args: any[]) => ({ __op: label, args });
  return {
    and: wrap("and"),
    desc: wrap("desc"),
    eq: wrap("eq"),
    gt: wrap("gt"),
    inArray: wrap("inArray"),
    isNull: wrap("isNull"),
    lt: wrap("lt"),
    or: wrap("or"),
    sql: Object.assign(wrap("sql"), { raw: wrap("sql.raw") }),
  };
});

beforeAll(() => {
  process.env.DATABASE_URL = "mysql://fake:fake@localhost/fake";
});

beforeEach(() => {
  deleteCalls.length = 0;
  updateCalls.length = 0;
  selectCalls.length = 0;
});

describe("cascade delete helpers", () => {
  it("softDeleteLandlordCascade marks both landlord and tenants as deleted", async () => {
    const { softDeleteLandlordCascade } = await import("../server/db");
    await softDeleteLandlordCascade(100);
    expect(updateCalls.length).toBe(2);
    expect(updateCalls.every((c) => c.table === "users")).toBe(true);
    expect(updateCalls.every((c) => c.setValues.status === "deleted")).toBe(true);
    expect(updateCalls.every((c) => c.setValues.deletedAt instanceof Date)).toBe(true);
  });

  it("permanentDeleteLandlordCascade removes utilities, bills, items, payments, convs, messages, notifications, tokens, users", async () => {
    const { permanentDeleteLandlordCascade } = await import("../server/db");
    const result = await permanentDeleteLandlordCascade(100);

    expect(result.tenants).toBe(2);
    expect(result.bills).toBe(2);
    expect(result.conversations).toBe(1);

    const deletedTables = deleteCalls.map((c) => c.table);
    expect(deletedTables).toContain("bill_items");
    expect(deletedTables).toContain("payments");
    expect(deletedTables).toContain("bills");
    expect(deletedTables).toContain("messages");
    expect(deletedTables).toContain("conversations");
    expect(deletedTables).toContain("utilities");
    expect(deletedTables).toContain("notifications");
    expect(deletedTables).toContain("reset_tokens");
    // Two user deletes: tenants in bulk + landlord
    expect(deletedTables.filter((t) => t === "users").length).toBe(2);
  });
});
