/**
 * Owner notification transport.
 *
 * On Manus: dispatches via Forge notification service.
 * On Sevalla/other: logs the notification and returns success (no-op).
 *
 * Future enhancement: integrate with email/Slack/Discord webhooks via
 * NOTIFICATION_WEBHOOK_URL env var.
 */

import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("webdevtoken.v1.WebDevService/SendNotification", normalizedBase).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Dispatches a project-owner notification.
 *
 * - If Forge env vars are configured: sends via Manus Notification Service.
 * - If NOTIFICATION_WEBHOOK_URL is set: sends a POST to that webhook.
 * - Otherwise: logs the notification and returns true (graceful no-op).
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  // Path 1: Manus Forge notification service
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    const endpoint = buildEndpointUrl(ENV.forgeApiUrl);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${ENV.forgeApiKey}`,
          "content-type": "application/json",
          "connect-protocol-version": "1",
        },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.warn(
          `[Notification] Failed to notify owner (${response.status} ${response.statusText})${
            detail ? `: ${detail}` : ""
          }`,
        );
        return false;
      }

      return true;
    } catch (error) {
      console.warn("[Notification] Error calling notification service:", error);
      return false;
    }
  }

  // Path 2: Custom webhook (Slack, Discord, email service, etc.)
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, content, timestamp: Date.now() }),
      });
      if (!response.ok) {
        console.warn(`[Notification] Webhook failed (${response.status})`);
        return false;
      }
      return true;
    } catch (error) {
      console.warn("[Notification] Webhook error:", error);
      return false;
    }
  }

  // Path 3: Graceful no-op — log and return success
  console.log(`[Notification] (no transport configured) title="${title}" content="${content.slice(0, 100)}..."`);
  return true;
}
