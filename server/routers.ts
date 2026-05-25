import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  landlordProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  tenantProcedure,
} from "./_core/trpc";
import * as db from "./db";
import {
  emailDomain,
  generateRandomToken,
  hashPassword,
  signAppToken,
  verifyPassword,
} from "./auth";
import { invokeLLM } from "./_core/llm";

// ---------- helpers ----------

function getClientIp(req: any): string {
  const xff = (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xff || (req?.ip ?? "unknown");
}

function sanitizeUser(u: any) {
  if (!u) return null;
  const { passwordHash, openId, ...safe } = u;
  return safe;
}

// ---------- auth router ----------

const authRouter = router({
  /** Get current user from context (works for both OAuth and JWT). */
  me: publicProcedure.query(({ ctx }) => sanitizeUser(ctx.user)),

  /** Landlord self-registration (creates a pending account). */
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8).max(128),
        name: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const ip = getClientIp(ctx.req);

      // Anti-spam: blocked domain?
      if (await db.isDomainBlocked(emailDomain(email))) {
        await db.logAuthAttempt({ email, ip, success: false, action: "register" });
        throw new TRPCError({ code: "BAD_REQUEST", message: "Email domain is not allowed." });
      }

      // Anti-spam: pending landlord cap reached?
      const settings = await db.getSettings();
      const pendingCount = await db.countPendingLandlords();
      if (pendingCount >= settings.pendingLandlordCap) {
        await db.logAuthAttempt({ email, ip, success: false, action: "register" });
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Registration is temporarily closed. Please try again later.",
        });
      }

      // Existing user?
      const existing = await db.getUserByEmail(email);
      if (existing) {
        await db.logAuthAttempt({ email, ip, success: false, action: "register" });
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered." });
      }

      const passwordHash = await hashPassword(input.password);
      await db.createUser({
        email,
        passwordHash,
        name: input.name,
        role: "landlord",
        status: "pending",
        loginMethod: "password",
      });
      await db.logAuthAttempt({ email, ip, success: true, action: "register" });
      return { ok: true };
    }),

  /** Custom email/password login for landlord and tenant. */
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const ip = getClientIp(ctx.req);

      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        await db.logAuthAttempt({ email, ip, success: false, action: "login" });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      }

      const ok = await verifyPassword(input.password, user.passwordHash);
      if (!ok) {
        await db.logAuthAttempt({ email, ip, success: false, action: "login" });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      }

      if (user.status === "pending") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account is awaiting admin approval." });
      }
      if (user.status === "frozen") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been frozen by the admin." });
      }
      if (user.status === "deleted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been deleted." });
      }

      await db.updateUser(user.id, { lastSignedIn: new Date() });
      await db.logAuthAttempt({ email, ip, success: true, action: "login" });

      const token = signAppToken({ userId: user.id, role: user.role as any, email: user.email! });
      return { token, user: sanitizeUser({ ...user, lastSignedIn: new Date() }) };
    }),

  /** Logout: client-side only for JWT (just clear the token). Also clears OAuth cookie. */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    try {
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    } catch {}
    return { success: true } as const;
  }),

  /** Change own password (requires current password). */
  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user!;
      if (!user.passwordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Password auth not enabled for this account." });
      }
      const ok = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
      const newHash = await hashPassword(input.newPassword);
      await db.updateUser(user.id, { passwordHash: newHash });
      return { ok: true };
    }),

  /** Use a reset token to set a new password. */
  resetWithToken: publicProcedure
    .input(z.object({ token: z.string().min(10), newPassword: z.string().min(8).max(128) }))
    .mutation(async ({ input }) => {
      const tk = await db.getValidResetToken(input.token);
      if (!tk) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset link." });
      const newHash = await hashPassword(input.newPassword);
      await db.updateUser(tk.userId, { passwordHash: newHash });
      await db.markResetTokenUsed(tk.id);
      return { ok: true };
    }),
});

// ---------- landlord router ----------

const landlordRouter = router({
  // --- Profile ---
  profile: landlordProcedure.query(({ ctx }) => sanitizeUser(ctx.user)),

  // --- Tenants ---
  tenants: router({
    list: landlordProcedure.query(({ ctx }) => db.listTenantsByLandlord(ctx.user!.id)),

    create: landlordProcedure
      .input(
        z.object({
          email: z.string().email(),
          name: z.string().min(1).max(120),
          initialPassword: z.string().min(8).max(128),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const email = input.email.toLowerCase();
        const existing = await db.getUserByEmail(email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists." });
        }
        const passwordHash = await hashPassword(input.initialPassword);
        const id = await db.createUser({
          email,
          name: input.name,
          passwordHash,
          role: "tenant",
          status: "active",
          landlordId: ctx.user!.id,
          loginMethod: "password",
        });
        return { id };
      }),

    update: landlordProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(120).optional(), email: z.string().email().optional() }))
      .mutation(async ({ ctx, input }) => {
        const tenant = await db.getUserById(input.id);
        if (!tenant || tenant.landlordId !== ctx.user!.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.updateUser(input.id, {
          name: input.name ?? tenant.name,
          email: input.email ?? tenant.email!,
        });
        return { ok: true };
      }),

    resetPassword: landlordProcedure
      .input(z.object({ id: z.number(), newPassword: z.string().min(8).max(128) }))
      .mutation(async ({ ctx, input }) => {
        const tenant = await db.getUserById(input.id);
        if (!tenant || tenant.landlordId !== ctx.user!.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const passwordHash = await hashPassword(input.newPassword);
        await db.updateUser(input.id, { passwordHash });
        return { ok: true };
      }),

    delete: landlordProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const tenant = await db.getUserById(input.id);
      if (!tenant || tenant.landlordId !== ctx.user!.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await db.updateUser(input.id, { status: "deleted", deletedAt: new Date() });
      return { ok: true };
    }),
  }),

  // --- Utilities ---
  utilities: router({
    list: landlordProcedure.query(({ ctx }) => db.listUtilities(ctx.user!.id)),

    create: landlordProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          unit: z.string().min(1).max(32),
          defaultRate: z.number().min(0),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const id = await db.createUtility({
          landlordId: ctx.user!.id,
          name: input.name,
          unit: input.unit,
          defaultRate: String(input.defaultRate),
        });
        return { id };
      }),

    update: landlordProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          unit: z.string().min(1).max(32).optional(),
          defaultRate: z.number().min(0).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const u = await db.getUtility(input.id);
        if (!u || u.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
        await db.updateUtility(input.id, {
          name: input.name ?? u.name,
          unit: input.unit ?? u.unit,
          defaultRate: input.defaultRate !== undefined ? String(input.defaultRate) : u.defaultRate,
        });
        return { ok: true };
      }),

    delete: landlordProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const u = await db.getUtility(input.id);
      if (!u || u.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
      await db.deleteUtility(input.id);
      return { ok: true };
    }),
  }),

  // --- Bills ---
  bills: router({
    list: landlordProcedure.query(({ ctx }) => db.listBillsByLandlord(ctx.user!.id)),

    detail: landlordProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const bill = await db.getBill(input.id);
      if (!bill || bill.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db.listBillItems(bill.id);
      const tenant = await db.getUserById(bill.tenantId);
      const landlord = await db.getUserById(bill.landlordId);
      const utilitiesList = await db.listUtilities(bill.landlordId);
      const utilByName = new Map(utilitiesList.map((u) => [u.id, u]));
      const enriched = items.map((it) => ({ ...it, utility: utilByName.get(it.utilityId) ?? null }));
      const paymentsList = await db.getPaymentsForBill(bill.id);
      return {
        bill,
        items: enriched,
        tenant: sanitizeUser(tenant),
        landlord: sanitizeUser(landlord),
        payments: paymentsList,
      };
    }),

    save: landlordProcedure
      .input(
        z.object({
          id: z.number().optional(),
          tenantId: z.number(),
          status: z.enum(["draft", "deployed"]),
          dueDate: z.string().optional(),
          meterPhotoUrl: z.string().optional(),
          notes: z.string().optional(),
          items: z.array(
            z.object({
              utilityId: z.number(),
              previousReading: z.number().min(0),
              currentReading: z.number().min(0),
              rate: z.number().min(0),
            }),
          ),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Verify tenant belongs to this landlord
        const tenant = await db.getUserById(input.tenantId);
        if (!tenant || tenant.landlordId !== ctx.user!.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid tenant" });
        }

        // Compute consumption + amount + total
        const computedItems = input.items.map((it) => {
          const consumption = Math.max(0, it.currentReading - it.previousReading);
          const amount = Math.round(consumption * it.rate * 100) / 100;
          return {
            utilityId: it.utilityId,
            previousReading: String(it.previousReading),
            currentReading: String(it.currentReading),
            rate: String(it.rate),
            consumption: String(consumption),
            amount: String(amount),
          };
        });
        const totalAmount = computedItems.reduce((s, it) => s + Number(it.amount), 0);

        let billId: number;
        const wasDraft =
          input.id !== undefined ? (await db.getBill(input.id))?.status === "draft" : true;
        const deployedAt =
          input.status === "deployed" && wasDraft ? new Date() : undefined;

        if (input.id) {
          const existing = await db.getBill(input.id);
          if (!existing || existing.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
          await db.updateBill(input.id, {
            tenantId: input.tenantId,
            status: input.status,
            totalAmount: String(Math.round(totalAmount * 100) / 100),
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            meterPhotoUrl: input.meterPhotoUrl ?? null,
            notes: input.notes ?? null,
            ...(deployedAt ? { deployedAt } : {}),
          });
          billId = input.id;
        } else {
          billId = await db.createBill({
            landlordId: ctx.user!.id,
            tenantId: input.tenantId,
            status: input.status,
            totalAmount: String(Math.round(totalAmount * 100) / 100),
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            meterPhotoUrl: input.meterPhotoUrl ?? null,
            notes: input.notes ?? null,
            deployedAt: deployedAt ?? null,
          });
        }

        await db.replaceBillItems(billId, computedItems.map((it) => ({ ...it, billId })));

        // If deployed, notify tenant
        if (input.status === "deployed") {
          await db.createNotification({
            userId: input.tenantId,
            type: "bill_deployed",
            title: "New bill received",
            body: `You have a new bill of ₱${totalAmount.toFixed(2)}.`,
            payload: JSON.stringify({ billId }),
          });
        }
        return { id: billId };
      }),

    delete: landlordProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const bill = await db.getBill(input.id);
      if (!bill || bill.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
      await db.deleteBill(input.id);
      return { ok: true };
    }),

    markPaid: landlordProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const bill = await db.getBill(input.id);
      if (!bill || bill.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateBill(input.id, { status: "paid", paidAt: new Date() });
      await db.createNotification({
        userId: bill.tenantId,
        type: "payment_verified",
        title: "Payment confirmed",
        body: `Your payment for bill #${bill.id} has been verified. Thank you!`,
        payload: JSON.stringify({ billId: bill.id }),
      });
      return { ok: true };
    }),

    /** A1: Get previous reading for a (tenant, utility) pair. */
    previousReading: landlordProcedure
      .input(z.object({ tenantId: z.number(), utilityId: z.number() }))
      .query(async ({ ctx, input }) => {
        const tenant = await db.getUserById(input.tenantId);
        if (!tenant || tenant.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
        const v = await db.getLatestReadingForTenantUtility(input.tenantId, input.utilityId);
        return { previousReading: v };
      }),

    /** A8: OCR meter photo via LLM. */
    ocrMeter: protectedProcedure
      .input(z.object({ imageUrl: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are a meter reading extractor. Read the digits on the utility meter or the amount/date on a payment receipt and return JSON.",
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Extract from this image. Respond ONLY with a JSON object: {\"reading\": <number or null>, \"amount\": <number or null>, \"date\": <YYYY-MM-DD or null>, \"confidence\": \"high\"|\"medium\"|\"low\"}. 'reading' is for meter dials. 'amount' is for receipts (in PHP).",
                  },
                  { type: "image_url", image_url: { url: input.imageUrl } },
                ],
              },
            ],
            response_format: { type: "json_object" },
          });
          const content = response.choices[0].message.content;
          const data = JSON.parse(content as string);
          return {
            reading: typeof data.reading === "number" ? data.reading : null,
            amount: typeof data.amount === "number" ? data.amount : null,
            date: typeof data.date === "string" ? data.date : null,
            confidence: ["high", "medium", "low"].includes(data.confidence)
              ? data.confidence
              : "low",
          };
        } catch (err) {
          console.error("[OCR] failed:", err);
          return { reading: null, amount: null, date: null, confidence: "low" as const };
        }
      }),
  }),

  // --- Chat ---
  chat: router({
    conversations: landlordProcedure.query(async ({ ctx }) => {
      const convs = await db.listConversationsForLandlord(ctx.user!.id);
      const enriched = await Promise.all(
        convs.map(async (c) => {
          const tenant = await db.getUserById(c.tenantId);
          return { ...c, tenant: sanitizeUser(tenant) };
        }),
      );
      return enriched;
    }),

    open: landlordProcedure.input(z.object({ tenantId: z.number() })).mutation(async ({ ctx, input }) => {
      const tenant = await db.getUserById(input.tenantId);
      if (!tenant || tenant.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
      const id = await db.getOrCreateConversation(ctx.user!.id, input.tenantId);
      return { id };
    }),

    messages: landlordProcedure.input(z.object({ conversationId: z.number() })).query(async ({ ctx, input }) => {
      const c = await db.getConversation(input.conversationId);
      if (!c || c.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
      return db.listMessages(input.conversationId);
    }),

    send: landlordProcedure
      .input(
        z.object({
          conversationId: z.number(),
          body: z.string().max(2000).optional(),
          attachmentUrl: z.string().optional(),
          attachmentType: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const c = await db.getConversation(input.conversationId);
        if (!c || c.landlordId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
        await db.createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user!.id,
          body: input.body ?? null,
          attachmentUrl: input.attachmentUrl ?? null,
          attachmentType: input.attachmentType ?? null,
        });
        // Notify the tenant on the other end of the conversation so an in-app
        // bell badge / toast surfaces even if they are not currently on the
        // chat screen. Body is truncated to keep the notification list scannable.
        const sender = ctx.user!;
        const preview = input.body?.trim()
          ? input.body.trim().slice(0, 80)
          : input.attachmentUrl
            ? "📎 Sent an attachment"
            : "New message";
        await db.createNotification({
          userId: c.tenantId,
          type: "chat_message",
          title: sender.name ? `Message from ${sender.name}` : "New message from your landlord",
          body: preview,
          payload: JSON.stringify({ conversationId: input.conversationId }),
        });
        return { ok: true };
      }),
  }),

  // --- Notifications ---
  notifications: router({
    list: landlordProcedure.query(({ ctx }) => db.listNotifications(ctx.user!.id)),
    markAllRead: landlordProcedure.mutation(async ({ ctx }) => {
      await db.markAllNotificationsRead(ctx.user!.id);
      return { ok: true };
    }),
    markOneRead: landlordProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.markNotificationRead(ctx.user!.id, input.id);
        return { ok: true };
      }),
  }),

  stats: landlordProcedure.query(async ({ ctx }) => {
    const all = await db.listBillsByLandlord(ctx.user!.id);
    const tenants = await db.listTenantsByLandlord(ctx.user!.id);
    const unpaid = all.filter((b) => b.status === "deployed").length;
    const monthRev = all
      .filter((b) => b.status === "paid" && b.paidAt && new Date(b.paidAt).getMonth() === new Date().getMonth())
      .reduce((s, b) => s + Number(b.totalAmount), 0);
    return {
      tenants: tenants.length,
      unpaidBills: unpaid,
      monthRevenue: monthRev,
      recentBills: all.slice(0, 5),
    };
  }),
});

// ---------- tenant router ----------

const tenantRouter = router({
  profile: tenantProcedure.query(({ ctx }) => sanitizeUser(ctx.user)),

  bills: router({
    list: tenantProcedure.query(({ ctx }) => db.listBillsByTenant(ctx.user!.id)),

    detail: tenantProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const bill = await db.getBill(input.id);
      if (!bill || bill.tenantId !== ctx.user!.id || bill.status === "draft") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const items = await db.listBillItems(bill.id);
      const utilitiesList = await db.listUtilities(bill.landlordId);
      const utilByName = new Map(utilitiesList.map((u) => [u.id, u]));
      const enriched = items.map((it) => ({ ...it, utility: utilByName.get(it.utilityId) ?? null }));
      const payments = await db.getPaymentsForBill(bill.id);
      const landlord = await db.getUserById(bill.landlordId);
      const tenant = await db.getUserById(bill.tenantId);
      return {
        bill,
        items: enriched,
        payments,
        landlord: sanitizeUser(landlord),
        tenant: sanitizeUser(tenant),
      };
    }),

    /** Upload payment proof. */
    pay: tenantProcedure
      .input(z.object({ billId: z.number(), proofUrl: z.string(), note: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const bill = await db.getBill(input.billId);
        if (!bill || bill.tenantId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
        await db.createPayment({
          billId: input.billId,
          tenantId: ctx.user!.id,
          proofUrl: input.proofUrl,
          note: input.note ?? null,
        });
        // Notify landlord
        await db.createNotification({
          userId: bill.landlordId,
          type: "payment_uploaded",
          title: "Payment proof submitted",
          body: `Tenant uploaded payment proof for bill #${bill.id}.`,
          payload: JSON.stringify({ billId: bill.id }),
        });
        return { ok: true };
      }),
  }),

  chat: router({
    /** Tenant has one conversation: with their landlord. */
    open: tenantProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user!;
      if (!user.landlordId) throw new TRPCError({ code: "BAD_REQUEST", message: "No landlord assigned." });
      const id = await db.getOrCreateConversation(user.landlordId, user.id);
      return { id };
    }),

    messages: tenantProcedure.input(z.object({ conversationId: z.number() })).query(async ({ ctx, input }) => {
      const c = await db.getConversation(input.conversationId);
      if (!c || c.tenantId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
      return db.listMessages(input.conversationId);
    }),

    send: tenantProcedure
      .input(
        z.object({
          conversationId: z.number(),
          body: z.string().max(2000).optional(),
          attachmentUrl: z.string().optional(),
          attachmentType: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const c = await db.getConversation(input.conversationId);
        if (!c || c.tenantId !== ctx.user!.id) throw new TRPCError({ code: "NOT_FOUND" });
        await db.createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user!.id,
          body: input.body ?? null,
          attachmentUrl: input.attachmentUrl ?? null,
          attachmentType: input.attachmentType ?? null,
        });
        // Notify the landlord on the other end of the conversation.
        const sender = ctx.user!;
        const preview = input.body?.trim()
          ? input.body.trim().slice(0, 80)
          : input.attachmentUrl
            ? "📎 Sent an attachment"
            : "New message";
        await db.createNotification({
          userId: c.landlordId,
          type: "chat_message",
          title: sender.name ? `Message from ${sender.name}` : "New message from a tenant",
          body: preview,
          payload: JSON.stringify({ conversationId: input.conversationId }),
        });
        return { ok: true };
      }),
  }),

  notifications: router({
    list: tenantProcedure.query(({ ctx }) => db.listNotifications(ctx.user!.id)),
    markAllRead: tenantProcedure.mutation(async ({ ctx }) => {
      await db.markAllNotificationsRead(ctx.user!.id);
      return { ok: true };
    }),
    markOneRead: tenantProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.markNotificationRead(ctx.user!.id, input.id);
        return { ok: true };
      }),
  }),
});

// ---------- admin router ----------

const adminRouter = router({
  stats: adminProcedure.query(() => db.getPlatformStats()),

  landlords: router({
    list: adminProcedure
      .input(z.object({ status: z.enum(["pending", "active", "frozen", "deleted"]).optional() }).optional())
      .query(({ input }) => db.listLandlords(input?.status)),

    approve: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.updateUser(input.id, { status: "active" });
      await db.createNotification({
        userId: input.id,
        type: "account_approved",
        title: "Account approved",
        body: "You can now sign in and manage your tenants.",
      });
      return { ok: true };
    }),

    reject: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.updateUser(input.id, { status: "deleted", deletedAt: new Date() });
      return { ok: true };
    }),

    freeze: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.updateUser(input.id, { status: "frozen" });
      return { ok: true };
    }),

    unfreeze: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.updateUser(input.id, { status: "active" });
      return { ok: true };
    }),

    softDelete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.softDeleteLandlordCascade(input.id);
      return { ok: true };
    }),

    listTrash: adminProcedure.query(() => db.listTrashedLandlords()),

    restore: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.updateUser(input.id, { status: "active", deletedAt: null });
      return { ok: true };
    }),

    permanentDelete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const result = await db.permanentDeleteLandlordCascade(input.id);
      return { ok: true, ...result };
    }),

    directReset: adminProcedure
      .input(z.object({ id: z.number(), newPassword: z.string().min(8).max(128) }))
      .mutation(async ({ input }) => {
        const passwordHash = await hashPassword(input.newPassword);
        await db.updateUser(input.id, { passwordHash });
        return { ok: true };
      }),

    issueResetLink: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const token = generateRandomToken(32);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.createResetToken({ userId: input.id, token, expiresAt });
      return { token, expiresAt };
    }),
  }),

  antispam: router({
    recentLogs: adminProcedure.query(() => db.listRecentAuthLogs(50)),
    listBlocklist: adminProcedure.query(() => db.listBlocklist()),
    addDomain: adminProcedure.input(z.object({ domain: z.string().min(1) })).mutation(async ({ input }) => {
      await db.addBlockedDomain(input.domain);
      return { ok: true };
    }),
    removeDomain: adminProcedure.input(z.object({ domain: z.string().min(1) })).mutation(async ({ input }) => {
      await db.removeBlockedDomain(input.domain);
      return { ok: true };
    }),
    getSettings: adminProcedure.query(() => db.getSettings()),
    updateCap: adminProcedure.input(z.object({ pendingLandlordCap: z.number().min(1).max(10000) })).mutation(async ({ input }) => {
      await db.updateSettings({ pendingLandlordCap: input.pendingLandlordCap });
      return { ok: true };
    }),
  }),

  releases: router({
    list: adminProcedure.query(() => db.listApkReleases()),
    create: adminProcedure
      .input(z.object({ version: z.string().min(1), fileUrl: z.string().min(1), notes: z.string().optional() }))
      .mutation(async ({ input }) => {
        const id = await db.createApkRelease({
          version: input.version,
          fileUrl: input.fileUrl,
          notes: input.notes ?? null,
        });
        return { id };
      }),
    publish: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.publishApkRelease(input.id);
      return { ok: true };
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteApkRelease(input.id);
      return { ok: true };
    }),
  }),
});

// ---------- public router (for non-authed lookups) ----------

const publicRouter = router({
  /** Live APK release info (for self-update prompts). */
  liveRelease: publicProcedure.query(() => db.getLiveApkRelease()),
});

// ---------- root ----------

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  public: publicRouter,
  landlord: landlordRouter,
  tenant: tenantRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
