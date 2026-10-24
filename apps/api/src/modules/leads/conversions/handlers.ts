import type { RequestHandler } from "express";
import type { z } from "zod";
import {
  conversionCreateSchema,
  conversionResponseSchema,
  idSchema,
} from "@kyzn/shared";
import { HttpError } from "../../../middleware/errors.ts";
import type { conversionService } from "./service.ts";

type Service = ReturnType<typeof conversionService>;

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

export function conversionHandlers(service: Service) {
  const create: RequestHandler = async (req, res) => {
    const conversion = await service(
      parse(idSchema, req.params.id),
      parse(conversionCreateSchema, req.body),
    );
    res.status(201).json(parse(conversionResponseSchema, { data: conversion }));
  };
  return { create };
}
