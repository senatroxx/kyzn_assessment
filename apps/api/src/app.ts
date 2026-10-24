import cors from "cors";
import express from "express";
import { corsOrigins } from "./config/env.ts";
import { errorHandler } from "./middleware/errors.ts";
import { leadsRouter } from "./modules/leads/router.ts";
import type { createDatabase } from "./db/client.ts";

export function createApp(db?: ReturnType<typeof createDatabase>["db"]) {
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
  if (db) app.use("/api/v1", leadsRouter(db));
  app.use((_request, response) => {
    response
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not found." } });
  });
  app.use(errorHandler);
  return app;
}

export const app = createApp();
