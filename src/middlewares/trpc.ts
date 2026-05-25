/**
 * tRPC initialization: context creation, middleware, and procedure builders.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import type { Request } from "express";
import { verifyAppToken, type AppTokenPayload } from "../services/auth.js";
import { getUserById } from "../db/index.js";

export interface Context {
  user: AppTokenPayload | null;
  ip: string;
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  let user: AppTokenPayload | null = null;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    user = await verifyAppToken(auth.slice(7));
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  return { user, ip };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Middleware: requires any authenticated user. */
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Middleware: requires an active user (not pending/frozen/deleted). */
const isActive = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  const dbUser = await getUserById(ctx.user.userId);
  if (!dbUser || dbUser.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account not active" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Middleware: requires landlord role. */
const isLandlord = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (ctx.user.role !== "landlord") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Landlord access required" });
  }
  const dbUser = await getUserById(ctx.user.userId);
  if (!dbUser || dbUser.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account not active" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Middleware: requires tenant role. */
const isTenant = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (ctx.user.role !== "tenant") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant access required" });
  }
  const dbUser = await getUserById(ctx.user.userId);
  if (!dbUser || dbUser.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account not active" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Middleware: requires admin role. */
const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const authedProcedure = t.procedure.use(isAuthed);
export const activeProcedure = t.procedure.use(isActive);
export const landlordProcedure = t.procedure.use(isLandlord);
export const tenantProcedure = t.procedure.use(isTenant);
export const adminProcedure = t.procedure.use(isAdmin);
