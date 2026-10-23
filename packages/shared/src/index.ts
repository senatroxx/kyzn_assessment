import { z } from "zod";

export const apiVersion = "v1" as const;
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type ApiResponse<T> = { data: T };
export type ApiError = z.infer<typeof apiErrorSchema>;
