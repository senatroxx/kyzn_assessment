import { Router } from "express";
import type { createDatabase } from "../../../db/client.ts";
import { leadListHandlers } from "./handlers.ts";
import { leadListService } from "./service.ts";

export function leadListRouter(db: ReturnType<typeof createDatabase>["db"]) {
  const router = Router();
  router.get("/", leadListHandlers(leadListService(db)).list);
  return router;
}
