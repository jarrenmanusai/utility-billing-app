import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { storagePut } from "../storage";
import { verifyAppToken } from "../auth";
import { APP_VERSION } from "@/constants/app-version";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);

  // Only mount the Manus-OAuth callback routes when OAuth is intentionally
  // enabled via env. The locked production deploy policy (MANUS_HANDOFF.txt
  // §1) leaves both OAUTH_SERVER_URL and OWNER_OPEN_ID UNSET, so the
  // /api/oauth/* routes simply do not exist in that case and any probe
  // returns 404 — which is what audit checklist H expects.
  if (process.env.OAUTH_SERVER_URL && process.env.OWNER_OPEN_ID) {
    registerOAuthRoutes(app);
    console.log("[OAuth] Manus OAuth routes mounted (env vars set).");
  } else {
    console.log(
      "[OAuth] Manus OAuth disabled — /api/oauth/* not mounted (email+password only).",
    );
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Lightweight version probe used by the deploy auditor and ops scripts.
  // Lets the agent verify the deployed server matches the expected build
  // without hitting any tRPC route or requiring authentication.
  app.get("/api/version", (_req, res) => {
    res.json({
      ok: true,
      version: APP_VERSION,
      name: "utility-billing-app",
      timestamp: Date.now(),
    });
  });

  // Simple image upload endpoint - accepts multipart/form-data with `file` and optional `folder`.
  // Limit raised to 100mb to support APK uploads from the admin App Updates panel.
  // Image uploads still come through the same endpoint and are well under this cap.
  app.post("/api/upload", express.raw({ type: "multipart/form-data", limit: "100mb" }), async (req, res) => {
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
        console.error("[upload] empty body", {
          contentType,
          bodyType: typeof raw,
          isBuf: Buffer.isBuffer(raw),
          len: raw && (raw as any).length,
        });
        return res.status(400).json({ error: "Missing file (empty body)" });
      }
      const parts = parseMultipart(raw, boundary);
      const filePart = parts.find((p) => p.name === "file");
      const folderPart = parts.find((p) => p.name === "folder");
      if (!filePart || !filePart.data) {
        console.error("[upload] missing file part", {
          boundary,
          rawLen: raw.length,
          partCount: parts.length,
          partNames: parts.map((p) => p.name),
          hasFilePart: !!filePart,
          hasData: !!filePart?.data,
        });
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

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Sevalla injects PORT env var — app MUST listen on exactly that port.
  // In development, fall back to scanning for an available port.
  const assignedPort = parseInt(process.env.PORT || "3000");
  const port =
    process.env.NODE_ENV === "production"
      ? assignedPort
      : await findAvailablePort(assignedPort);

  if (port !== assignedPort) {
    console.log(`Port ${assignedPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`[api] server listening on 0.0.0.0:${port}`);
  });
}

startServer().catch(console.error);

type MultipartPart = {
  name: string;
  filename?: string;
  contentType?: string;
  value?: string;
  data?: Buffer;
};

/**
 * Minimal but correct multipart/form-data parser.
 *
 * Body shape (RFC 7578):
 *   --boundary\r\n
 *   Content-Disposition: form-data; name="file"; filename="x.jpg"\r\n
 *   Content-Type: image/jpeg\r\n
 *   \r\n
 *   <bytes>\r\n
 *   --boundary\r\n
 *   ... more parts ...
 *   --boundary--\r\n
 *
 * The previous implementation occasionally failed when the body started
 * with `--boundary\r\n` directly (no leading whitespace) because of an
 * unconditional `start += 2` that assumed a CRLF was always present *after*
 * the dash-boundary token even when it had been consumed already. This
 * version walks the buffer using `indexOf(dashBoundary)` for every part so
 * the byte arithmetic stays simple and robust.
 */
function parseMultipart(buf: Buffer, boundary: string): MultipartPart[] {
  const parts: MultipartPart[] = [];
  if (!boundary) return parts;
  const dashBoundary = Buffer.from(`--${boundary}`);
  const headerSep = Buffer.from("\r\n\r\n");

  let cursor = buf.indexOf(dashBoundary);
  if (cursor < 0) return parts;

  while (cursor < buf.length) {
    // Move past `--boundary`.
    let partStart = cursor + dashBoundary.length;
    // End-of-multipart marker: `--boundary--`.
    if (buf[partStart] === 0x2d && buf[partStart + 1] === 0x2d) break;
    // Strip the CRLF that separates the boundary token from the headers.
    if (buf[partStart] === 0x0d && buf[partStart + 1] === 0x0a) {
      partStart += 2;
    }

    const headerEnd = buf.indexOf(headerSep, partStart);
    if (headerEnd < 0) break;
    const headerStr = buf.slice(partStart, headerEnd).toString("utf8");
    const dataStart = headerEnd + headerSep.length;

    const nextBoundary = buf.indexOf(dashBoundary, dataStart);
    if (nextBoundary < 0) break;
    // Strip the trailing CRLF that precedes the next boundary, if present.
    let dataEnd = nextBoundary;
    if (dataEnd >= 2 && buf[dataEnd - 2] === 0x0d && buf[dataEnd - 1] === 0x0a) {
      dataEnd -= 2;
    }
    const data = buf.slice(dataStart, dataEnd);

    // Headers may span multiple lines. We only look at Content-Disposition
    // and Content-Type. Use a permissive regex that tolerates extra params
    // and quoted/unquoted values.
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
