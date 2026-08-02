export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string;

  constructor(args: { code: string; message: string; status: number; traceId: string }) {
    super(args.message);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status;
    this.traceId = args.traceId;
  }
}

const FALLBACK = "Something went wrong. Please try again.";

export async function toError(response: Response): Promise<ApiError> {
  const fallback = {
    code: `http_${response.status}`,
    message: FALLBACK,
    status: response.status,
    traceId: response.headers.get("x-request-id") ?? "",
  };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(fallback);
  }

  const error = (body as { error?: { code?: string; message?: string; trace_id?: string } })?.error;
  if (!error || typeof error.code !== "string") return new ApiError(fallback);

  return new ApiError({
    code: error.code,
    message: error.message || FALLBACK,
    status: response.status,
    traceId: error.trace_id ?? fallback.traceId,
  });
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    credentials: "include",
    cache: "no-store",
    signal,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
