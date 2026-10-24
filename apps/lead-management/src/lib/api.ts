import type { ZodType } from "zod";

export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/$/, "");

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    response = await fetch(
      `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`,
      {
        ...init,
        headers,
      },
    );
  } catch {
    throw new ApiRequestError(
      "Could not reach the API. Check that it is running and try again.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError(
      `The API returned an invalid JSON response (${response.status}).`,
      response.status,
    );
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : `The API request failed (${response.status}).`;
    throw new ApiRequestError(message, response.status);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new ApiRequestError(
      "The API response did not match the expected format.",
      response.status,
    );
  return parsed.data;
}
