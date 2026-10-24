import type { RequestHandler } from "express";
import { leadListQuerySchema, leadListResponseSchema } from "@kyzn/shared";
import { HttpError } from "../../../middleware/errors.ts";
import type { leadListService } from "./service.ts";

type Service = ReturnType<typeof leadListService>;

export function leadListHandlers(service: Service) {
  const list: RequestHandler = async (req, res) => {
    const parsed = leadListQuerySchema.safeParse(req.query);
    if (!parsed.success)
      throw new HttpError(
        422,
        "VALIDATION_ERROR",
        "Request validation failed.",
        parsed.error.issues.map(({ path, message, code }) => ({
          path: path.map(String),
          message,
          code,
        })),
      );
    res.json(leadListResponseSchema.parse(await service(parsed.data)));
  };
  return { list };
}
