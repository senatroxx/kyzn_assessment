import type { ErrorRequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: {
      path: (string | number)[];
      message: string;
      code?: string;
    }[],
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      error: {
        code: "MALFORMED_JSON",
        message: "Request body must be valid JSON.",
      },
    });
    return;
  }
  console.error(error);
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};
