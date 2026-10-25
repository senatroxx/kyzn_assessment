import { Router } from "express";
import type { createDatabase } from "../../../db/client.ts";
import { dashboardInsightsHandlers } from "./handlers.ts";
import { dashboardInsightsService } from "./service.ts";

export function dashboardInsightsRouter(
  db: ReturnType<typeof createDatabase>["db"],
  now: () => Date = () => new Date(),
  timeZone = "Asia/Jakarta",
) {
  const router = Router();
  const handlers = dashboardInsightsHandlers(
    dashboardInsightsService(db, now, timeZone),
  );
  router.get("/leads-trend", handlers.leadsTrend);
  router.get("/funnel", handlers.funnel);
  router.get("/follow-ups", handlers.followUps);
  return router;
}
