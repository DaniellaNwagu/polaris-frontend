export type ApiError = Error & { status?: number; body?: string };

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(method: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = new Error(`${method} ${path} failed: ${res.status} ${body}`) as ApiError;
    error.status = res.status;
    error.body = body;
    throw error;
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/**
 * Returns a user-facing message for an API error, never exposing raw
 * request paths, status codes, or response bodies (which may be HTML).
 */
export function messageFromApiError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof Error) {
    const status = (error as ApiError).status;
    if (status === 401) return "You need to sign in to continue.";
    if (status === 403) return "You don't have permission to do that.";
    if (status === 404) return "We couldn't find what you were looking for.";
    if (status !== undefined && status >= 500) return fallback;
  }
  return fallback;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>("GET", path, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>("POST", path, { ...init, body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>("PUT", path, { ...init, body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>("PATCH", path, { ...init, body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, init?: RequestInit) => request<T>("DELETE", path, init),
};
