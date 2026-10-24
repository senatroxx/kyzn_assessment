import cors from "cors";
import express from "express";
import { corsOrigins, env } from "./config/env.ts";
import { errorHandler } from "./middleware/errors.ts";
import { activitiesRouter } from "./modules/leads/activities/router.ts";
import { conversionRouter } from "./modules/leads/conversions/router.ts";
import { duplicatesRouter } from "./modules/leads/duplicates/router.ts";
import { dashboardMetricsRouter } from "./modules/dashboard/metrics/router.ts";
import { leadListRouter } from "./modules/leads/list/router.ts";
import { leadsRouter } from "./modules/leads/router.ts";
import { trialRouter } from "./modules/leads/trials/router.ts";
import type { createDatabase } from "./db/client.ts";

export function createApp(
  db?: ReturnType<typeof createDatabase>["db"],
  now: () => Date = () => new Date(),
) {
  const app = express();

  app.use((request, _response, next) => {
    console.info(`${request.method} ${request.path}`);
    next();
  });
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json());
  app.get("/api/health", (_request, response) => {
    response.json({ data: { status: "ok" } });
  });
  if (db) {
    app.use(
      "/api/v1/dashboard",
      dashboardMetricsRouter(db, now, env.BUSINESS_TIME_ZONE),
    );
    app.use("/api/v1/leads/duplicates", duplicatesRouter(db));
    app.use("/api/v1/leads", leadListRouter(db));
    app.use("/api/v1/leads/:id/activities", activitiesRouter(db, now));
    app.use("/api/v1", trialRouter(db, now));
    app.use("/api/v1", conversionRouter(db, now));
    app.use("/api/v1", leadsRouter(db));
  }
  app.use((_request, response) => {
    response
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not found." } });
  });
  app.use(errorHandler);
  return app;
}

export const app = createApp();
