import { loadConfig } from "./config.js";
import { APIError } from "./errors.js";

export interface FetchOptions extends RequestInit {
  /** Override the PAT for this single request (e.g. during login verification) */
  token?: string;
}

/**
 * Central HTTP client for all CLI → dashboard-api communication.
 * Automatically injects the stored PAT as a Bearer token.
 *
 * All dashboard-api routes are mounted under /api — this client
 * prepends that prefix automatically so callers just write /user/cli/me.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const config = loadConfig();

  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = options.token ?? config.pat;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // All dashboard-api routes are under /api
  const base = config.apiBase.replace(/\/+$/, "");
  const apiPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${base}/api${apiPath}`;

  let response: Response;

  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;
  const timeoutId =
  options.signal ? undefined : setTimeout(() => controller.abort(), 15_000);

  try {
    response = await fetch(url, {
      ...options,
      headers,
        signal,
    });
  } catch (error) {
    throw new APIError(
      0,
       error instanceof Error && error.name === "AbortError"
        ? "The urBackend API request timed out."
        : "Unable to connect to the urBackend API. Is the server running?",
    );
     } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = response.statusText;

    try {
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };
      message = body.message ?? body.error ?? message;
    } catch {
      // ignore — use statusText
    }

    throw new APIError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}