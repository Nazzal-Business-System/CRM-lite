import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { activitiesRouter } from "./routes/activities";
import { authRouter } from "./routes/auth";
import { companiesRouter, researchMutationsRouter } from "./routes/companies";
import { contactsRouter } from "./routes/contacts";
import { dashboardRouter, importsRouter, researchRouter } from "./routes/dashboard";
import { opportunitiesRouter } from "./routes/opportunities";
import { recruitmentRouter } from "./routes/recruitment";
import { rolesRouter } from "./routes/roles";
import { tasksRouter } from "./routes/tasks";
import { usersRouter } from "./routes/users";
import { prisma } from "./lib/prisma";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === "/api/health" || req.url === "/api/ready",
      },
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ data: { ok: true, service: "nbs-crm-api" } });
  });

  app.get("/api/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ data: { ok: true, database: "up" } });
    } catch {
      res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database is not ready.",
        },
      });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/roles", rolesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/companies", companiesRouter);
  app.use("/api/research", researchRouter);
  app.use("/api", researchMutationsRouter);
  app.use("/api/contacts", contactsRouter);
  app.use("/api/opportunities", opportunitiesRouter);
  app.use("/api/activities", activitiesRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/imports", importsRouter);
  app.use("/api/recruitment", recruitmentRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
