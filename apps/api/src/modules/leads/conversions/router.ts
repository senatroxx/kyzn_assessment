import { Router } from "express";
import type { createDatabase } from "../../../db/client.ts";
import { conversionHandlers } from "./handlers.ts";
import { conversionService } from "./service.ts";

export function conversionRouter(
  db: ReturnType<typeof createDatabase>["db"],
  now?: () => Date,
) {
  const router = Router();
  router.post(
    "/leads/:id/conversion",
    conversionHandlers(conversionService(db, now)).create,
  );
  return router;
}
