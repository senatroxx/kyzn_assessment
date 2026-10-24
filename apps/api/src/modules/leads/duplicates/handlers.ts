import type { RequestHandler } from "express";
import type { z } from "zod";
import { duplicateQuerySchema, duplicatesResponseSchema } from "@kyzn/shared";
import { HttpError } from "../../../middleware/errors.ts";
import type { duplicateService } from "./service.ts";

type Service = ReturnType<typeof duplicateService>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(
      422,
      "VALIDATION_ERROR",
      "Request validation failed.",
      result.error.issues.map(({ path, message, code }) => ({
        path: path.map(String),
        message,
        code,
      })),
    );
  return result.data;
}

export function duplicateHandlers(service: Service) {
  const find: RequestHandler = async (req, res) =>
    res.json(
      parse(duplicatesResponseSchema, {
        data: await service.find(parse(duplicateQuerySchema, req.query)),
      }),
    );
  return { find };
}
