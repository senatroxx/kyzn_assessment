import type { RequestHandler } from "express";
import type { z } from "zod";
import {
  idSchema,
  trialCreateSchema,
  trialResponseSchema,
  trialUpdateSchema,
} from "@kyzn/shared";
import { HttpError } from "../../../middleware/errors.ts";
import type { trialService } from "./service.ts";

type Service = ReturnType<typeof trialService>;
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

export function trialHandlers(service: Service) {
  const create: RequestHandler = async (req, res) => {
    const leadId = parse(idSchema, req.params.id);
    const data = await service.create(
      leadId,
      parse(trialCreateSchema, req.body),
    );
    res.status(201).json(parse(trialResponseSchema, { data }));
  };
  const update: RequestHandler = async (req, res) => {
    const leadId = parse(idSchema, req.params.id);
    const trialId = parse(idSchema, req.params.trialId);
    const data = await service.update(
      leadId,
      trialId,
      parse(trialUpdateSchema, req.body),
    );
    res.json(parse(trialResponseSchema, { data }));
  };
  return { create, update };
}
