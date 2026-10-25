import {
  dashboardFunnelResponseSchema,
  dashboardFollowUpsQuerySchema,
  dashboardFollowUpsResponseSchema,
  dashboardLeadsTrendQuerySchema,
  dashboardLeadsTrendResponseSchema,
} from "@kyzn/shared";
import type { RequestHandler } from "express";
import { HttpError } from "../../../middleware/errors.ts";
import type { dashboardInsightsService } from "./service.ts";

type Service = ReturnType<typeof dashboardInsightsService>;

function validationError(error: {
  issues: Array<{
    path: PropertyKey[];
    message: string;
    code: string;
  }>;
}) {
  return new HttpError(
    422,
    "VALIDATION_ERROR",
    "Request validation failed.",
    error.issues.map(({ path, message, code }) => ({
      path: path.map(String),
      message,
      code,
    })),
  );
}

export function dashboardInsightsHandlers(service: Service) {
  const leadsTrend: RequestHandler = async (request, response) => {
    const parsed = dashboardLeadsTrendQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);
    response.json(
      dashboardLeadsTrendResponseSchema.parse({
        data: await service.leadsTrend(parsed.data),
      }),
    );
  };

  const funnel: RequestHandler = async (_request, response) => {
    response.json(
      dashboardFunnelResponseSchema.parse({ data: await service.funnel() }),
    );
  };

  const followUps: RequestHandler = async (request, response) => {
    const parsed = dashboardFollowUpsQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);
    response.json(
      dashboardFollowUpsResponseSchema.parse({
        data: await service.followUps(parsed.data),
      }),
    );
  };

  return { leadsTrend, funnel, followUps };
}
