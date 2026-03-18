/**
 * lib/profile.ts
 * ==============
 * Helpers for reading and updating the current user's profile.
 */

import { apiFetch } from "@/lib/api";

export interface MeResponse {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    email_verified: boolean;
    use_case: string | null;
    onboarding_completed_at: string | null;
    created_at: string;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: string;
  };
  access_token?: string;
}

export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/auth/me");
}

export async function updateMe(data: {
  display_name?: string;
  use_case?: string;
}): Promise<{ access_token: string }> {
  return apiFetch<{ access_token: string }>("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
