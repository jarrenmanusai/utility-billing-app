/**
 * Auth router — public endpoints for registration, login, password reset, and CAPTCHA.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  countPendingLandlords,
  createResetToken,
  createUser,
  getSettings,
  getValidResetToken,
  getUserByEmail,
  getUserByPhone,
  getUserById,
  isDomainBlocked,
  logAuthAttempt,
  markResetTokenUsed,
  updateUser,
} from "../db/index.js";
import {
  emailDomain,
  generateRandomToken,
  hashPassword,
  signAppToken,
  verifyPassword,
} from "../services/auth.js";
import { issueChallenge, verifySubmission } from "../utils/captcha.js";
import { checkEmail, normalizePhPhone } from "../utils/validation.js";
import { publicProcedure, router } from "../middlewares/trpc.js";

export const authRouter = router({
  /**
   * Issue a CAPTCHA challenge for registration forms.
   */
  captcha: publicProcedure.query(() => {
    return issueChallenge();
  }),

  /**
   * Landlord self-registration.
   * Creates a "pending" user that must be approved by admin.
   */
  register: publicProcedure
    .input(
      z.object({
        email: z.string().min(1),
        password: z.string().min(8, "Password must be at least 8 characters"),
        name: z.string().min(1, "Name is required"),
        phone: z.string().min(1, "Phone number is required"),
        captchaToken: z.string(),
        captchaAnswer: z.string(),
        honeypot: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // 1. CAPTCHA verification
      const captchaResult = verifySubmission({
        token: input.captchaToken,
        answer: input.captchaAnswer,
        honeypot: input.honeypot,
      });
      if (!captchaResult.ok) {
        await logAuthAttempt({
          email: input.email,
          ip: ctx.ip,
          success: false,
          action: "register",
        });
        throw new TRPCError({ code: "BAD_REQUEST", message: captchaResult.reason! });
      }

      // 2. Email validation
      const emailCheck = checkEmail(input.email);
      if (!emailCheck.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: emailCheck.reason! });
      }

      // 3. Domain blocklist check
      const domain = emailDomain(input.email);
      if (await isDomainBlocked(domain)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This email domain is not allowed. Please use a different email address.",
        });
      }

      // 4. Phone validation (PH only)
      const normalizedPhone = normalizePhPhone(input.phone);
      if (!normalizedPhone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please enter a valid Philippine mobile number (e.g. 0917 555 1234).",
        });
      }

      // 5. Check for existing user with same email
      const existingEmail = await getUserByEmail(emailCheck.normalized!);
      if (existingEmail) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists.",
        });
      }

      // 6. Check for existing user with same phone
      const existingPhone = await getUserByPhone(normalizedPhone);
      if (existingPhone) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this phone number already exists.",
        });
      }

      // 7. Check pending landlord cap
      const settings = await getSettings();
      const pendingCount = await countPendingLandlords();
      if (settings && pendingCount >= settings.pendingLandlordCap) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Registration is temporarily closed. Please try again later.",
        });
      }

      // 8. Create user
      const passwordHash = await hashPassword(input.password);
      const userId = await createUser({
        email: emailCheck.normalized!,
        passwordHash,
        name: input.name,
        phone: normalizedPhone,
        role: "landlord",
        status: "pending",
        loginMethod: "email",
      });

      await logAuthAttempt({
        email: emailCheck.normalized!,
        ip: ctx.ip,
        success: true,
        action: "register",
      });

      return {
        success: true,
        message: "Registration submitted. Please wait for admin approval.",
        userId,
      };
    }),

  /**
   * Email/password login for all roles.
   */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().min(1),
        password: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email.toLowerCase());

      if (!user || !user.passwordHash) {
        await logAuthAttempt({
          email: input.email,
          ip: ctx.ip,
          success: false,
          action: "login",
        });
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      }

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        await logAuthAttempt({
          email: input.email,
          ip: ctx.ip,
          success: false,
          action: "login",
        });
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      }

      if (user.status === "pending") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your account is pending admin approval.",
        });
      }
      if (user.status === "frozen") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your account has been frozen. Please contact support.",
        });
      }
      if (user.status === "deleted") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This account has been deleted.",
        });
      }

      // Update last sign-in
      await updateUser(user.id, { lastSignedIn: new Date() });

      await logAuthAttempt({
        email: input.email,
        ip: ctx.ip,
        success: true,
        action: "login",
      });

      const token = signAppToken({
        userId: user.id,
        role: user.role,
        email: user.email!,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        },
      };
    }),

  /**
   * Request a password reset token (sent via email in production).
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email.toLowerCase());
      // Always return success to prevent email enumeration
      if (!user) {
        return { success: true, message: "If that email exists, a reset link has been sent." };
      }

      const token = generateRandomToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await createResetToken({
        userId: user.id,
        token,
        expiresAt,
      });

      // In production, send email with reset link containing the token.
      // For now, log it (or integrate with an email service).
      console.log(`[Auth] Password reset token for ${user.email}: ${token}`);

      return { success: true, message: "If that email exists, a reset link has been sent." };
    }),

  /**
   * Reset password using a valid token.
   */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }),
    )
    .mutation(async ({ input }) => {
      const resetToken = await getValidResetToken(input.token);
      if (!resetToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired reset token.",
        });
      }

      const passwordHash = await hashPassword(input.newPassword);
      await updateUser(resetToken.userId, { passwordHash });
      await markResetTokenUsed(resetToken.id);

      return { success: true, message: "Password has been reset successfully." };
    }),

  /**
   * Get the current user's profile (requires auth).
   */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const user = await getUserById(ctx.user.userId);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }),
});
