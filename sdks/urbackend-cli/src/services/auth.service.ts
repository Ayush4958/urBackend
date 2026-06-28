import { apiFetch } from "../core/api.js";
import type { CLIProfile } from "../types/auth.js";

interface APIResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export async function authenticate(token: string): Promise<CLIProfile> {
  const res = await apiFetch<APIResponse<CLIProfile>>("/user/cli/me", {
    method: "GET",
    token,
  });
 
  return res.data;
}

export async function getProfile(): Promise<CLIProfile> {
  const res = await apiFetch<APIResponse<CLIProfile>>("/user/cli/me", {
    method: "GET",
  });
  return res.data;
}