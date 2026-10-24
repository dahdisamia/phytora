import fs from "node:fs";
import path from "node:path";
import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Db } from "./db";
import type { ContentStore } from "./content";
import { SESSION_COOKIE } from "./config";
import { userFromToken } from "./auth";
import { errorHandler } from "./errors";
import { authRouter } from "./routes/auth";
import { contentRouter } from "./routes/content";
import { casesRouter } from "./routes/cases";
import { referralsRouter } from "./routes/referrals";
import { expertsRouter } from "./routes/experts";
import { dashboardRouter, auditRouter } from "./routes/dashboard";
import { notificationsRouter } from "./routes/notifications";
import { adminRouter } from "./routes/admin";
import { docsPage, openApiDocument } from "./routes/docs";

export function createApp(db: Db, store: ContentStore): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:"],
          "font-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
          "worker-src": ["'self'", "blob:"],
          "manifest-src": ["'self'"],
          "object-src": ["'none'"],
          "frame-ancestors": ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use((req, _res, next) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (token) {
      req.sessionToken = token;
      try {
        const user = userFromToken(db, token);
        if (user) req.user = user;
      } catch (error) {
        console.error("[fieldguard] session lookup failed", error);
      }
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "fieldguard",
      contentVersion: store.contentVersion,
      time: new Date().toISOString()
    });
  });

  app.get("/api/openapi.json", (req, res) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json(openApiDocument(baseUrl));
  });
  app.get("/docs", docsPage);
  app.get("/api/docs", docsPage);

  app.use("/api/auth", authRouter(db, store));
  app.use("/api/content", contentRouter(db, store));
  app.use("/api/cases", casesRouter(db, store));
  app.use("/api/referrals", referralsRouter(db, store));
  app.use("/api/experts", expertsRouter(db, store));
  app.use("/api/dashboard", dashboardRouter(db, store));
  app.use("/api/audit", auditRouter(db));
  app.use("/api/notifications", notificationsRouter(db));
  app.use("/api/admin", adminRouter(db, store));

  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: {
        code: "not_found",
        messageAr: "المسار المطلوب غير موجود.",
        messageFr: "La route demandée est introuvable."
      }
    });
  });

  const dist = path.join(process.cwd(), "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h", index: false }));
    app.get("*", (req, res) => {
      if (
        req.path.startsWith("/api/") ||
        req.path.startsWith("/docs") ||
        path.extname(req.path)
      ) {
        res.status(404).end();
        return;
      }
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
