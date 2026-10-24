import { Router } from "express";
import type { createDatabase } from "../../../db/client.ts";
import { dashboardMetricsHandlers } from "./handlers.ts";
import { dashboardMetricsService } from "./service.ts";

export function dashboardMetricsRouter(
  db: ReturnType<typeof createDatabase>["db"],
  now: () => Date = () => new Date(),
  timeZone = "Asia/Jakarta",
) {
  const router = Router();
  router.get(
    "/metrics",
    dashboardMetricsHandlers(dashboardMetricsService(db, now, timeZone)).get,
  );
  return router;
}
