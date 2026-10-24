import { Router } from "express";
import type { createDatabase } from "../../../db/client.ts";
import { trialHandlers } from "./handlers.ts";
import { trialService } from "./service.ts";

export function trialRouter(
  db: ReturnType<typeof createDatabase>["db"],
  now?: () => Date | string,
) {
  const handlers = trialHandlers(trialService(db, now));
  const router = Router();
  router.post("/leads/:id/trials", handlers.create);
  router.patch("/leads/:id/trials/:trialId", handlers.update);
  return router;
}
