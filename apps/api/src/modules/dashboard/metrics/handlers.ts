import type { RequestHandler } from "express";
import { dashboardMetricsResponseSchema } from "@kyzn/shared";
import type { dashboardMetricsService } from "./service.ts";

type Service = ReturnType<typeof dashboardMetricsService>;

export function dashboardMetricsHandlers(service: Service) {
  const get: RequestHandler = async (_request, response) => {
    response.json(
      dashboardMetricsResponseSchema.parse({ data: await service() }),
    );
  };
  return { get };
}
