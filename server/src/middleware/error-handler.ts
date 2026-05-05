import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../errors.js";
import { trackErrorHandlerCrash } from "@paperclipai/shared/telemetry";
import { getTelemetryClient } from "../telemetry.js";

export interface ErrorContext {
  error: { message: string; stack?: string; name?: string; details?: unknown; raw?: unknown };
  method: string;
  url: string;
}

function attachErrorContext(
  req: Request,
  res: Response,
  payload: ErrorContext["error"],
  rawError?: Error,
) {
  (res as any).__errorContext = {
    error: payload,
    method: req.method,
    url: req.originalUrl,
  } satisfies ErrorContext;
  if (rawError) {
    (res as any).err = rawError;
  }
}

function isPayloadTooLargeError(err: unknown): err is Error & {
  type?: string;
  status?: number;
  statusCode?: number;
  limit?: number;
  length?: number;
} {
  if (!(err instanceof Error)) return false;
  const candidate = err as Error & { type?: unknown; status?: unknown; statusCode?: unknown };
  return candidate.type === "entity.too.large" || candidate.status === 413 || candidate.statusCode === 413;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (isPayloadTooLargeError(err)) {
    res.status(413).json({
      error: "Request payload too large",
      details: {
        message:
          "The request body exceeded the server JSON body limit. Large company imports can inline full zip packages; increase PAPERCLIP_JSON_BODY_LIMIT or import a smaller package.",
        limit: typeof err.limit === "number" ? err.limit : undefined,
        length: typeof err.length === "number" ? err.length : undefined,
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      attachErrorContext(
        req,
        res,
        { message: err.message, stack: err.stack, name: err.name, details: err.details },
        err,
      );
      const tc = getTelemetryClient();
      if (tc) trackErrorHandlerCrash(tc, { errorCode: err.name });
    }
    res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation error", details: err.errors });
    return;
  }

  const rootError = err instanceof Error ? err : new Error(String(err));
  attachErrorContext(
    req,
    res,
    err instanceof Error
      ? { message: err.message, stack: err.stack, name: err.name }
      : { message: String(err), raw: err, stack: rootError.stack, name: rootError.name },
    rootError,
  );

  const tc = getTelemetryClient();
  if (tc) trackErrorHandlerCrash(tc, { errorCode: rootError.name });

  res.status(500).json({ error: "Internal server error" });
}
