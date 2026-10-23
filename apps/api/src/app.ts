import cors from "cors";
import express from "express";
import { corsOrigins } from "./config/env.ts";
import { errorHandler } from "./middleware/errors.ts";

export const app = express();

app.use((request, _response, next) => {
  console.info(`${request.method} ${request.path}`);
  next();
});
app.use(cors({ origin: corsOrigins }));
app.use(express.json());
app.get("/api/health", (_request, response) => {
  response.json({ data: { status: "ok" } });
});
app.use((_request, response) => {
  response
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Route not found." } });
});
app.use(errorHandler);
