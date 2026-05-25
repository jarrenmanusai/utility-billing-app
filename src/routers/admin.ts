/**
 * Admin router — endpoints for moderation, anti-spam, and platform stats.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addBlockedDomain,
  createNotification,
  getPlatformStats,
  getSettings,
  getUserById,
  listActiveLandlordAndTenantIds,
  listBlocklist,
  listLandlords,
  listRecentAuthLogs,
  listTrashedLandlords,
  permanentDeleteLandlordCascade,
  removeBlockedDomain,
  softDeleteLandlordCascade,
  updateSettings,
  updateUser,
} from "../db/index.js";
import { adminProcedure, router } from "../middlewares/trpc.js";

export const adminRouter = router({
  // ============================================================
  // MODERATION
  // ============================================================

  /**
   * List landlords, optionally filtered by status.
   */
  listLandlords: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "active", "frozen", "deleted"]).optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      return listLandlords(input?.status);
    }),

  /**
   * Approve a pending landlord — sets status to "active".
   */
  approveLandlord: adminProcedure
    .input(z.object({ landlordId: z.number() }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.landlordId);
      if (!user || user.role !== "landlord") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Landlord not found" });
      }
      if (user.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending landlords can be approved" });
      }

      await updateUser(input.landlordId, { status: "active" });

      await createNotification({
        userId: input.landlordId,
        type: "account_approved",
        title: "Account Approved",
        body: "Your landlord account has been approved. You can now start managing your properties.",
      });

      return { success: true };
    }),

  /**
   * Reject a pending landlord — permanently deletes the account.
   */
  rejectLandlord: adminProcedure
    .input(z.object({ landlordId: z.number() }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.landlordId);
      if (!user || user.role !== "landlord") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Landlord not found" });
      }
      if (user.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending landlords can be rejected" });
      }

      await permanentDeleteLandlordCascade(input.landlordId);
      return { success: true };
    }),

  /**
   * Freeze a landlord — sets status to "frozen" (cannot log in).
   */
  freezeLandlord: adminProcedure
    .input(z.object({ landlordId: z.number() }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.landlordId);
      if (!user || user.role !== "landlord") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Landlord not found" });
      }
      await updateUser(input.landlordId, { status: "frozen" });
      return { success: true };
    }),

  /**
   * Unfreeze a landlord — sets status back to "active".
   */
  unfreezeLandlord: adminProcedure
    .input(z.object({ landlordId: z.number() }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.landlordId);
      if (!user || user.role !== "landlord" || user.status !== "frozen") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Frozen landlord not found" });
      }
      await updateUser(input.landlordId, { status: "active" });
      return { success: true };
    }),

  /**
   * Soft-delete a landlord and all their tenants.
   */
  softDeleteLandlord: adminProcedure
    .input(z.object({ landlordId: z.number() }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.landlordId);
      if (!user || user.role !== "landlord") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Landlord not found" });
      }
      await softDeleteLandlordCascade(input.landlordId);
      return { success: true };
    }),

  /**
   * Permanently delete a landlord and ALL associated data.
   */
  permanentDeleteLandlord: adminProcedure
    .input(z.object({ landlordId: z.number() }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.landlordId);
      if (!user || user.role !== "landlord") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Landlord not found" });
      }
      const result = await permanentDeleteLandlordCascade(input.landlordId);
      return { success: true, deleted: result };
    }),

  /**
   * List soft-deleted landlords (trash).
   */
  listTrashedLandlords: adminProcedure.query(async () => {
    return listTrashedLandlords();
  }),

  /**
   * Restore a soft-deleted landlord.
   */
  restoreLandlord: adminProcedure
    .input(z.object({ landlordId: z.number() }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.landlordId);
      if (!user || user.role !== "landlord" || user.status !== "deleted") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deleted landlord not found" });
      }
      await updateUser(input.landlordId, { status: "active", deletedAt: null });
      return { success: true };
    }),

  // ============================================================
  // ANTI-SPAM
  // ============================================================

  listAuthLogs: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input }) => {
      return listRecentAuthLogs(input?.limit ?? 50);
    }),

  listBlocklist: adminProcedure.query(async () => {
    return listBlocklist();
  }),

  addBlockedDomain: adminProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await addBlockedDomain(input.domain);
      return { success: true };
    }),

  removeBlockedDomain: adminProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await removeBlockedDomain(input.domain);
      return { success: true };
    }),

  // ============================================================
  // SETTINGS
  // ============================================================

  getSettings: adminProcedure.query(async () => {
    return getSettings();
  }),

  updateSettings: adminProcedure
    .input(z.object({ pendingLandlordCap: z.number().min(1).optional() }))
    .mutation(async ({ input }) => {
      await updateSettings(input);
      return { success: true };
    }),

  // ============================================================
  // PLATFORM STATS
  // ============================================================

  stats: adminProcedure.query(async () => {
    return getPlatformStats();
  }),

  // ============================================================
  // BROADCAST NOTIFICATION
  // ============================================================

  broadcastNotification: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        type: z.string().default("announcement"),
      }),
    )
    .mutation(async ({ input }) => {
      const userIds = await listActiveLandlordAndTenantIds();
      for (const userId of userIds) {
        await createNotification({
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
        });
      }
      return { success: true, recipientCount: userIds.length };
    }),
});
