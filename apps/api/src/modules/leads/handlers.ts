import type { RequestHandler } from "express";
import type { z } from "zod";
import {
  consultantsResponseSchema,
  idSchema,
  leadCreateSchema,
  leadDetailResponseSchema,
  leadListResponseSchema,
  leadUpdateSchema,
  venuesResponseSchema,
} from "@kyzn/shared";
import { HttpError } from "../../middleware/errors.ts";
import type { leadService } from "./service.ts";

type Service = ReturnType<typeof leadService>;

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

export function leadHandlers(service: Service) {
  const venues: RequestHandler = async (_req, res) =>
    res.json(parse(venuesResponseSchema, { data: await service.venues() }));
  const consultants: RequestHandler = async (_req, res) =>
    res.json(
      parse(consultantsResponseSchema, { data: await service.consultants() }),
    );
  const list: RequestHandler = async (_req, res) =>
    res.json(parse(leadListResponseSchema, await service.list()));
  const create: RequestHandler = async (req, res) =>
    res.status(201).json(
      parse(leadDetailResponseSchema, {
        data: await service.create(parse(leadCreateSchema, req.body)),
      }),
    );
  const get: RequestHandler = async (req, res) => {
    const id = parse(idSchema, req.params.id);
    res.json(parse(leadDetailResponseSchema, { data: await service.get(id) }));
  };
  const update: RequestHandler = async (req, res) => {
    const id = parse(idSchema, req.params.id);
    res.json(
      parse(leadDetailResponseSchema, {
        data: await service.update(id, parse(leadUpdateSchema, req.body)),
      }),
    );
  };
  return { venues, consultants, list, create, get, update };
}
