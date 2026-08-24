import type { NextFunction, Request, Response } from "express";
import type { ZodError, ZodType } from "zod";
import { AppError } from "../lib/errors";

type RequestPart = "body" | "query" | "params";

const parsedQueryByRequest = new WeakMap<Request, unknown>();

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    const existing = fields[key] ?? [];
    existing.push(issue.message);
    fields[key] = existing;
  }

  return fields;
}

function compactQuery(query: Request["query"]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") {
      continue;
    }
    result[key] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

function sourceFor(req: Request, part: RequestPart): unknown {
  if (part === "query") {
    return compactQuery(req.query);
  }
  if (part === "params") {
    return req.params;
  }
  return req.body;
}

function applyValidated(req: Request, part: RequestPart, data: unknown): void {
  if (part === "query") {
    // Express 5 defines req.query as a getter with no setter on IncomingMessage.
    parsedQueryByRequest.set(req, data);
    return;
  }

  if (part === "params") {
    Object.assign(req.params, data as Record<string, unknown>);
    return;
  }

  req.body = data;
}

export function validate<T>(schema: ZodType<T>, part: RequestPart = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(sourceFor(req, part));

    if (!result.success) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
        zodFieldErrors(result.error),
      );
    }

    applyValidated(req, part, result.data);
    next();
  };
}

export function parsedQuery<T>(req: Request): T {
  const stored = parsedQueryByRequest.get(req);
  if (stored !== undefined) {
    return stored as T;
  }
  return compactQuery(req.query) as T;
}
