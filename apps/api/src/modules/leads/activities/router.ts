import { Router } from "express";
import type { createDatabase } from "../../../db/client.ts";
import { activityHandlers } from "./handlers.ts";
import { activityService } from "./service.ts";

export function activitiesRouter(
  db: ReturnType<typeof createDatabase>["db"],
  now?: () => Date,
) {
  const router = Router({ mergeParams: true });
  router.post("/", activityHandlers(activityService(db, now)).create);
  return router;
}
