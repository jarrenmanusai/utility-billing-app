/**
 * UtilityFlow Backend Service — Entry Point
 *
 * Standalone Express server with tRPC API.
 * No frontend, no APK, no mobile-specific code.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers/index.js";
import { createContext } from "./middlewares/trpc.js";
import { verifyAppToken } from "./services/auth.js";
import { storagePut } from "./services/storage.js";
import { ENV } from "./services/env.js";

const APP_VERSION = "1.0.0";

async function startServer() {
  const app = express();
  const server = createServer(app);

  // CORS — allow all origins in development, restrict in production
  app.use(
    cors({
      origin: ENV.isProduction ? process.env.ALLOWED_ORIGINS?.split(",") : true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
    }),
  );

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ============================================================
  // Health & Version endpoints
  // ============================================================

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get("/api/version", (_req, res) => {
    res.json({
      ok: true,
      version: APP_VERSION,
      name: "utility-billing-backend",
      timestamp: Date.now(),
    });
  });

  // ============================================================
  // File Upload endpoint
  // ============================================================

  app.post("/api/upload", express.raw({ type: "multipart/form-data", limit: "50mb" }), async (req, res) => {
    try {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const payload = await verifyAppToken(auth.slice(7));
      if (!payload) return res.status(401).json({ error: "Unauthorized" });

      const contentType = req.headers["content-type"] || "";
      const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
      if (!boundaryMatch) return res.status(400).json({ error: "Missing boundary" });
      const boundary = (boundaryMatch[1] || boundaryMatch[2] || "").trim();

      const raw: Buffer | undefined = req.body as Buffer | undefined;
      if (!raw || !Buffer.isBuffer(raw) || raw.length === 0) {
        return res.status(400).json({ error: "Missing file (empty body)" });
      }

      const parts = parseMultipart(raw, boundary);
      const filePart = parts.find((p) => p.name === "file");
      const folderPart = parts.find((p) => p.name === "folder");
      if (!filePart || !filePart.data) {
        return res.status(400).json({ error: "Missing file" });
      }

      const folder = (folderPart?.value || "uploads").replace(/[^a-zA-Z0-9_/-]/g, "");
      const filename = (filePart.filename || `upload-${Date.now()}.bin`).replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `${folder}/${payload.userId}/${Date.now()}-${filename}`;
      const ct = filePart.contentType || "application/octet-stream";
      const result = await storagePut(key, filePart.data, ct);
      return res.json({ url: result.url, key: result.key });
    } catch (err) {
      console.error("[upload] failed", err);
      return res.status(500).json({ error: "Upload failed" });
    }
  });

  // ============================================================
  // tRPC API
  // ============================================================

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req }) => createContext({ req }),
    }),
  );

  // ============================================================
  // Start
  // ============================================================

  const port = ENV.port;
  server.listen(port, () => {
    console.log(`[UtilityFlow Backend] Server listening on port ${port}`);
    console.log(`[UtilityFlow Backend] Version: ${APP_VERSION}`);
    console.log(`[UtilityFlow Backend] Environment: ${ENV.isProduction ? "production" : "development"}`);
  });
}

startServer().catch(console.error);

// ============================================================
// Multipart parser (minimal, no external dependency)
// ============================================================

type MultipartPart = {
  name: string;
  filename?: string;
  contentType?: string;
  value?: string;
  data?: Buffer;
};

function parseMultipart(buf: Buffer, boundary: string): MultipartPart[] {
  const parts: MultipartPart[] = [];
  if (!boundary) return parts;
  const dashBoundary = Buffer.from(`--${boundary}`);
  const headerSep = Buffer.from("\r\n\r\n");

  let cursor = buf.indexOf(dashBoundary);
  if (cursor < 0) return parts;

  while (cursor < buf.length) {
    let partStart = cursor + dashBoundary.length;
    if (buf[partStart] === 0x2d && buf[partStart + 1] === 0x2d) break;
    if (buf[partStart] === 0x0d && buf[partStart + 1] === 0x0a) {
      partStart += 2;
    }

    const headerEnd = buf.indexOf(headerSep, partStart);
    if (headerEnd < 0) break;
    const headerStr = buf.slice(partStart, headerEnd).toString("utf8");
    const dataStart = headerEnd + headerSep.length;

    const nextBoundary = buf.indexOf(dashBoundary, dataStart);
    if (nextBoundary < 0) break;
    let dataEnd = nextBoundary;
    if (dataEnd >= 2 && buf[dataEnd - 2] === 0x0d && buf[dataEnd - 1] === 0x0a) {
      dataEnd -= 2;
    }
    const data = buf.slice(dataStart, dataEnd);

    const nameMatch = /name="([^"]*)"|name=([^;\r\n]+)/i.exec(headerStr);
    const filenameMatch = /filename="([^"]*)"|filename=([^;\r\n]+)/i.exec(headerStr);
    const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headerStr);
    if (nameMatch) {
      const name = (nameMatch[1] ?? nameMatch[2] ?? "").trim();
      const filename = filenameMatch ? (filenameMatch[1] ?? filenameMatch[2] ?? "").trim() : undefined;
      if (filename !== undefined) {
        parts.push({ name, filename, contentType: typeMatch?.[1]?.trim(), data });
      } else {
        parts.push({ name, value: data.toString("utf8") });
      }
    }

    cursor = nextBoundary;
  }
  return parts;
}
