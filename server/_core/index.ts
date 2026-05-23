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
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Simple image upload endpoint - accepts multipart/form-data with `file` and optional `folder`.
  app.post("/api/upload", express.raw({ type: "multipart/form-data", limit: "25mb" }), async (req, res) => {
    try {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const payload = await verifyAppToken(auth.slice(7));
      if (!payload) return res.status(401).json({ error: "Unauthorized" });

      const contentType = req.headers["content-type"] || "";
      const boundaryMatch = /boundary=([^;]+)/.exec(contentType);
      if (!boundaryMatch) return res.status(400).json({ error: "Missing boundary" });
      const boundary = boundaryMatch[1].trim();

      const raw: Buffer = req.body as Buffer;
      const parts = parseMultipart(raw, boundary);
      const filePart = parts.find((p) => p.name === "file");
      const folderPart = parts.find((p) => p.name === "folder");
      if (!filePart || !filePart.data) return res.status(400).json({ error: "Missing file" });
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

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
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

function parseMultipart(buf: Buffer, boundary: string): MultipartPart[] {
  const parts: MultipartPart[] = [];
  const dashBoundary = Buffer.from(`--${boundary}`);
  const crlf = Buffer.from("\r\n");
  let start = buf.indexOf(dashBoundary);
  if (start < 0) return parts;
  start += dashBoundary.length;
  while (start < buf.length) {
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break; // trailing --
    if (buf[start] === 0x0d) start += 2; // skip CRLF after boundary
    const headerEnd = buf.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd < 0) break;
    const headerStr = buf.slice(start, headerEnd).toString("utf8");
    const nextBoundary = buf.indexOf(dashBoundary, headerEnd);
    if (nextBoundary < 0) break;
    const dataStart = headerEnd + 4;
    const dataEnd = nextBoundary - 2; // strip preceding CRLF
    const data = buf.slice(dataStart, dataEnd);

    const disposition = /content-disposition:.*name="([^"]+)"(?:; filename="([^"]*)")?/i.exec(headerStr);
    const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headerStr);
    if (disposition) {
      const name = disposition[1];
      const filename = disposition[2];
      if (filename !== undefined) {
        parts.push({ name, filename, contentType: typeMatch?.[1], data });
      } else {
        parts.push({ name, value: data.toString("utf8") });
      }
    }
    start = nextBoundary + dashBoundary.length;
  }
  return parts;
}
