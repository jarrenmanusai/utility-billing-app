/**
 * Landlord router — endpoints for managing tenants, utilities, bills, chat, and OCR.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createBill,
  createMessage,
  createNotification,
  createUser,
  createUtility,
  deleteBill,
  deleteUtility,
  getBill,
  getLatestReadingForTenantUtility,
  getOrCreateConversation,
  getPaymentsForBill,
  getUtility,
  listBillItems,
  listBillsByLandlord,
  listConversationsForLandlord,
  listMessages,
  listNotifications,
  listTenantsByLandlord,
  listUtilities,
  markAllNotificationsRead,
  markNotificationRead,
  replaceBillItems,
  updateBill,
  updateUser,
  updateUtility,
  getUserById,
} from "../db/index.js";
import { hashPassword } from "../services/auth.js";
import { ocrMeterImage } from "../services/llm.js";
import { checkEmail, normalizePhPhone } from "../utils/validation.js";
import { landlordProcedure, router } from "../middlewares/trpc.js";

export const landlordRouter = router({
  // ============================================================
  // TENANTS
  // ============================================================

  listTenants: landlordProcedure.query(async ({ ctx }) => {
    return listTenantsByLandlord(ctx.user.userId);
  }),

  createTenant: landlordProcedure
    .input(
      z.object({
        email: z.string().min(1),
        name: z.string().min(1),
        password: z.string().min(8),
        phone: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const emailCheck = checkEmail(input.email);
      if (!emailCheck.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: emailCheck.reason! });
      }

      let normalizedPhone: string | null = null;
      if (input.phone) {
        normalizedPhone = normalizePhPhone(input.phone);
        if (!normalizedPhone) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please enter a valid Philippine mobile number.",
          });
        }
      }

      const passwordHash = await hashPassword(input.password);
      const tenantId = await createUser({
        email: emailCheck.normalized!,
        passwordHash,
        name: input.name,
        phone: normalizedPhone,
        role: "tenant",
        status: "active",
        landlordId: ctx.user.userId,
        loginMethod: "email",
      });

      return { success: true, tenantId };
    }),

  updateTenant: landlordProcedure
    .input(
      z.object({
        tenantId: z.number(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        status: z.enum(["active", "frozen"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenant = await getUserById(input.tenantId);
      if (!tenant || tenant.landlordId !== ctx.user.userId || tenant.role !== "tenant") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
      }

      const patch: Record<string, any> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.status !== undefined) patch.status = input.status;

      if (input.email !== undefined) {
        const emailCheck = checkEmail(input.email);
        if (!emailCheck.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: emailCheck.reason! });
        }
        patch.email = emailCheck.normalized;
      }

      if (input.phone !== undefined) {
        const normalizedPhone = normalizePhPhone(input.phone);
        if (!normalizedPhone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number." });
        }
        patch.phone = normalizedPhone;
      }

      await updateUser(input.tenantId, patch);
      return { success: true };
    }),

  deleteTenant: landlordProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenant = await getUserById(input.tenantId);
      if (!tenant || tenant.landlordId !== ctx.user.userId || tenant.role !== "tenant") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
      }
      await updateUser(input.tenantId, { status: "deleted", deletedAt: new Date() });
      return { success: true };
    }),

  // ============================================================
  // UTILITIES
  // ============================================================

  listUtilities: landlordProcedure.query(async ({ ctx }) => {
    return listUtilities(ctx.user.userId);
  }),

  createUtility: landlordProcedure
    .input(
      z.object({
        name: z.string().min(1),
        unit: z.string().min(1),
        defaultRate: z.string().default("0"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const id = await createUtility({
        landlordId: ctx.user.userId,
        name: input.name,
        unit: input.unit,
        defaultRate: input.defaultRate,
      });
      return { success: true, id };
    }),

  updateUtility: landlordProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        unit: z.string().optional(),
        defaultRate: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const utility = await getUtility(input.id);
      if (!utility || utility.landlordId !== ctx.user.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Utility not found" });
      }
      const patch: Record<string, any> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.unit !== undefined) patch.unit = input.unit;
      if (input.defaultRate !== undefined) patch.defaultRate = input.defaultRate;
      await updateUtility(input.id, patch);
      return { success: true };
    }),

  deleteUtility: landlordProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const utility = await getUtility(input.id);
      if (!utility || utility.landlordId !== ctx.user.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Utility not found" });
      }
      await deleteUtility(input.id);
      return { success: true };
    }),

  // ============================================================
  // BILLS
  // ============================================================

  listBills: landlordProcedure.query(async ({ ctx }) => {
    return listBillsByLandlord(ctx.user.userId);
  }),

  getBill: landlordProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const bill = await getBill(input.id);
      if (!bill || bill.landlordId !== ctx.user.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      }
      const items = await listBillItems(bill.id);
      const payments = await getPaymentsForBill(bill.id);
      return { ...bill, items, payments };
    }),

  /**
   * Get the previous reading for a tenant/utility pair.
   * Used by the client to pre-fill the "previous reading" field.
   */
  getPreviousReading: landlordProcedure
    .input(z.object({ tenantId: z.number(), utilityId: z.number() }))
    .query(async ({ input }) => {
      const reading = await getLatestReadingForTenantUtility(input.tenantId, input.utilityId);
      return { previousReading: reading };
    }),

  /**
   * Create a new bill with line items.
   * Automatically calculates consumption and amounts.
   */
  createBill: landlordProcedure
    .input(
      z.object({
        tenantId: z.number(),
        dueDate: z.string().optional(),
        meterPhotoUrl: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            utilityId: z.number(),
            previousReading: z.string(),
            currentReading: z.string(),
            rate: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Verify tenant belongs to this landlord
      const tenant = await getUserById(input.tenantId);
      if (!tenant || tenant.landlordId !== ctx.user.userId || tenant.role !== "tenant") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
      }

      // Calculate amounts
      let totalAmount = 0;
      const billItems = input.items.map((item) => {
        const prev = parseFloat(item.previousReading);
        const curr = parseFloat(item.currentReading);
        const rate = parseFloat(item.rate);
        const consumption = Math.max(0, curr - prev);
        const amount = consumption * rate;
        totalAmount += amount;
        return {
          utilityId: item.utilityId,
          previousReading: item.previousReading,
          currentReading: item.currentReading,
          rate: item.rate,
          consumption: consumption.toFixed(4),
          amount: amount.toFixed(2),
          billId: 0, // placeholder, will be set after bill creation
        };
      });

      const billId = await createBill({
        landlordId: ctx.user.userId,
        tenantId: input.tenantId,
        status: "draft",
        totalAmount: totalAmount.toFixed(2),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        meterPhotoUrl: input.meterPhotoUrl ?? null,
        notes: input.notes ?? null,
      });

      await replaceBillItems(
        billId,
        billItems.map((it) => ({ ...it, billId })),
      );

      return { success: true, billId, totalAmount: totalAmount.toFixed(2) };
    }),

  /**
   * Deploy a bill — changes status to "deployed" and notifies the tenant.
   */
  deployBill: landlordProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const bill = await getBill(input.id);
      if (!bill || bill.landlordId !== ctx.user.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      }
      if (bill.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft bills can be deployed" });
      }

      await updateBill(input.id, { status: "deployed", deployedAt: new Date() });

      // Notify the tenant
      await createNotification({
        userId: bill.tenantId,
        type: "bill_deployed",
        title: "New Bill",
        body: `You have a new bill of ₱${bill.totalAmount}. Due: ${bill.dueDate ? new Date(bill.dueDate).toLocaleDateString() : "No due date"}.`,
      });

      return { success: true };
    }),

  /**
   * Mark a bill as paid.
   */
  markBillPaid: landlordProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const bill = await getBill(input.id);
      if (!bill || bill.landlordId !== ctx.user.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      }
      if (bill.status !== "deployed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only deployed bills can be marked as paid" });
      }

      await updateBill(input.id, { status: "paid", paidAt: new Date() });

      await createNotification({
        userId: bill.tenantId,
        type: "bill_paid",
        title: "Payment Confirmed",
        body: `Your payment of ₱${bill.totalAmount} has been confirmed.`,
      });

      return { success: true };
    }),

  deleteBill: landlordProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const bill = await getBill(input.id);
      if (!bill || bill.landlordId !== ctx.user.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      }
      if (bill.status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a paid bill" });
      }
      await deleteBill(input.id);
      return { success: true };
    }),

  // ============================================================
  // OCR
  // ============================================================

  ocrMeterImage: landlordProcedure
    .input(z.object({ imageUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      return ocrMeterImage(input.imageUrl);
    }),

  // ============================================================
  // CHAT
  // ============================================================

  listConversations: landlordProcedure.query(async ({ ctx }) => {
    return listConversationsForLandlord(ctx.user.userId);
  }),

  getMessages: landlordProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      return listMessages(input.conversationId);
    }),

  sendMessage: landlordProcedure
    .input(
      z.object({
        tenantId: z.number(),
        body: z.string().optional(),
        attachmentUrl: z.string().optional(),
        attachmentType: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const conversationId = await getOrCreateConversation(ctx.user.userId, input.tenantId);
      const messageId = await createMessage({
        conversationId,
        senderId: ctx.user.userId,
        body: input.body ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentType: input.attachmentType ?? null,
      });

      // Notify tenant
      await createNotification({
        userId: input.tenantId,
        type: "new_message",
        title: "New Message",
        body: input.body?.slice(0, 100) || "You received a new message.",
      });

      return { success: true, messageId, conversationId };
    }),

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  listNotifications: landlordProcedure.query(async ({ ctx }) => {
    return listNotifications(ctx.user.userId);
  }),

  markAllNotificationsRead: landlordProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsRead(ctx.user.userId);
    return { success: true };
  }),

  markNotificationRead: landlordProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await markNotificationRead(ctx.user.userId, input.id);
      return { success: true };
    }),

  // ============================================================
  // DASHBOARD STATS
  // ============================================================

  stats: landlordProcedure.query(async ({ ctx }) => {
    const tenants = await listTenantsByLandlord(ctx.user.userId);
    const bills = await listBillsByLandlord(ctx.user.userId);
    const unpaid = bills.filter((b) => b.status === "deployed");
    const paid = bills.filter((b) => b.status === "paid");
    const totalRevenue = paid.reduce((sum, b) => sum + Number(b.totalAmount), 0);

    return {
      tenantCount: tenants.length,
      totalBills: bills.length,
      unpaidBills: unpaid.length,
      paidBills: paid.length,
      totalRevenue,
    };
  }),
});
