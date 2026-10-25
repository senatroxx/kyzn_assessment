import { Router } from "express";
import type { createDatabase } from "../../db/client.ts";
import { leadHandlers } from "./handlers.ts";
import { leadService } from "./service.ts";

export function leadsRouter(db: ReturnType<typeof createDatabase>["db"]) {
  const handlers = leadHandlers(leadService(db));
  const router = Router();
  router.get("/venues", handlers.venues);
  router.get("/consultants", handlers.consultants);
  router.post("/leads", handlers.create);
  router.get("/leads/:id", handlers.get);
  router.patch("/leads/:id", handlers.update);
  return router;
}
