import type { ApiErrorBody } from "@nbs/shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  readonly failure?: "network";

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
    failure?: "network",
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.failure = failure;
  }
}

export const SERVICE_UNAVAILABLE_MESSAGE =
  "Unable to connect to the CRM service. Please try again.";

const REQUEST_FAILED_MESSAGE = "The CRM could not complete this request.";

export function isServiceUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SERVICE_UNAVAILABLE";
}

type ApiEnvelope<T> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: ApiErrorBody | string };

function serviceUnavailableError(status = 503, failure?: "network"): ApiError {
  return new ApiError(status, "SERVICE_UNAVAILABLE", SERVICE_UNAVAILABLE_MESSAGE, undefined, failure);
}

function requestFailedError(status: number, code = "INTERNAL_ERROR"): ApiError {
  return new ApiError(status, code, REQUEST_FAILED_MESSAGE);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw serviceUnavailableError(response.status);
    }
    throw requestFailedError(response.status || 500);
  }

  let payload: ApiEnvelope<T> | null;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch {
    throw serviceUnavailableError(response.status >= 500 ? response.status : 503);
  }

  if (!response.ok || !payload || !("data" in payload) || payload.data === undefined) {
    const error = payload && "error" in payload ? payload.error : undefined;

    if (typeof error === "string" && error.trim()) {
      throw new ApiError(response.status, "REQUEST_FAILED", error);
    }

    if (error && typeof error === "object") {
      throw new ApiError(
        response.status,
        error.code ?? "REQUEST_FAILED",
        error.message ?? REQUEST_FAILED_MESSAGE,
        error.fields,
      );
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw serviceUnavailableError(response.status);
    }

    throw requestFailedError(response.status || 500);
  }

  return payload.data;
}

export function isConfirmedUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED";
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  try {
    return await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: "include",
      // Bound session verification without imposing a new deadline on imports/mutations.
      signal: path === "/auth/me"
        ? init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000)
        : init.signal,
    });
  } catch {
    if (typeof window !== "undefined" && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("nbs:auth-revalidate"));
    }
    throw serviceUnavailableError(503, "network");
  }
}

async function readResponse<T>(path: string, response: Response): Promise<T> {
  try {
    return await parseResponse<T>(response);
  } catch (error) {
    if (typeof window !== "undefined" && !path.startsWith("/auth/")) {
      // Revalidate identity with /auth/me; a resource response cannot erase it.
      if (error instanceof ApiError && (error.status === 401 || error.status >= 500)) {
        window.dispatchEvent(new Event("nbs:auth-revalidate"));
      }
    }
    throw error;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return readResponse<T>(path, await request(path, init));
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const response = await request(path);
  if (!response.ok) {
    await readResponse(path, response);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  postForm: <T>(path: string, body: FormData) =>
    apiRequest<T>(path, {
      method: "POST",
      body,
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

export function fieldError(
  error: unknown,
  field: string,
): string | undefined {
  if (error instanceof ApiError) {
    return error.fields?.[field]?.[0];
  }
  return undefined;
}
