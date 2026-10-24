import type { RequestHandler } from "express";
import type { z } from "zod";
import {
  activityCreateSchema,
  activityResponseSchema,
  idSchema,
} from "@kyzn/shared";
import { HttpError } from "../../../middleware/errors.ts";
import type { activityService } from "./service.ts";

type Service = ReturnType<typeof activityService>;
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
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
};

export function activityHandlers(service: Service) {
  const create: RequestHandler = async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const input = parse(activityCreateSchema, req.body);
    res
      .status(201)
      .json(activityResponseSchema.parse({ data: await service(id, input) }));
  };
  return { create };
}
