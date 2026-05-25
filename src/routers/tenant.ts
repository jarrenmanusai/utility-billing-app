/**
 * Tenant router — endpoints for viewing bills, submitting payments, chat, and notifications.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createMessage,
  createNotification,
  createPayment,
  getBill,
  getOrCreateConversation,
  getPaymentsForBill,
  getUserById,
  listBillItems,
  listBillsByTenant,
  listMessages,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../db/index.js";
import { tenantProcedure, router } from "../middlewares/trpc.js";

export const tenantRouter = router({
  // ============================================================
  // BILLS
  // ============================================================

  listBills: tenantProcedure.query(async ({ ctx }) => {
    return listBillsByTenant(ctx.user.userId);
  }),

  getBill: tenantProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const bill = await getBill(input.id);
      if (!bill || bill.tenantId !== ctx.user.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      }
      const items = await listBillItems(bill.id);
      const payments = await getPaymentsForBill(bill.id);
      return { ...bill, items, payments };
    }),

  // ============================================================
  // PAYMENTS
  // ============================================================

  /**
   * Submit payment proof for a bill.
   */
  submitPayment: tenantProcedure
    .input(
      z.object({
        billId: z.number(),
        proofUrl: z.string().url(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const bill = await getBill(input.billId);
      if (!bill || bill.tenantId !== ctx.user.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      }
      if (bill.status !== "deployed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment can only be submitted for deployed bills.",
        });
      }

      const paymentId = await createPayment({
        billId: input.billId,
        tenantId: ctx.user.userId,
        proofUrl: input.proofUrl,
        note: input.note ?? null,
      });

      // Notify the landlord
      await createNotification({
        userId: bill.landlordId,
        type: "payment_submitted",
        title: "Payment Received",
        body: `A tenant submitted payment proof for bill #${bill.id} (₱${bill.totalAmount}).`,
      });

      return { success: true, paymentId };
    }),

  // ============================================================
  // CHAT
  // ============================================================

  getMessages: tenantProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      return listMessages(input.conversationId);
    }),

  sendMessage: tenantProcedure
    .input(
      z.object({
        body: z.string().optional(),
        attachmentUrl: z.string().optional(),
        attachmentType: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Find the tenant's landlord
      const tenant = await getUserById(ctx.user.userId);
      if (!tenant || !tenant.landlordId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tenant has no landlord" });
      }

      const conversationId = await getOrCreateConversation(tenant.landlordId, ctx.user.userId);
      const messageId = await createMessage({
        conversationId,
        senderId: ctx.user.userId,
        body: input.body ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentType: input.attachmentType ?? null,
      });

      // Notify landlord
      await createNotification({
        userId: tenant.landlordId,
        type: "new_message",
        title: "New Message",
        body: input.body?.slice(0, 100) || "You received a new message from a tenant.",
      });

      return { success: true, messageId, conversationId };
    }),

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  listNotifications: tenantProcedure.query(async ({ ctx }) => {
    return listNotifications(ctx.user.userId);
  }),

  markAllNotificationsRead: tenantProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsRead(ctx.user.userId);
    return { success: true };
  }),

  markNotificationRead: tenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await markNotificationRead(ctx.user.userId, input.id);
      return { success: true };
    }),
});
