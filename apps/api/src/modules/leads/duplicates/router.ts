import { Router } from "express";
import type { createDatabase } from "../../../db/client.ts";
import { duplicateHandlers } from "./handlers.ts";
import { duplicateService } from "./service.ts";

export function duplicatesRouter(db: ReturnType<typeof createDatabase>["db"]) {
  const router = Router();
  router.get("/", duplicateHandlers(duplicateService(db)).find);
  return router;
}
