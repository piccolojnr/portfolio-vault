import type { JWTPayload } from "jose";

export interface TokenPayload extends JWTPayload {
  sub: string;
  org_id: string;
  org_name: string;
  role: string;
  email: string;
  email_verified: boolean;
  onboarding_completed_at: string | null;
  type: string;
}

export interface AdminTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  type: "platform_admin";
}

export interface RefreshResult {
  access_token: string;
  refresh_token: string;
}

export interface CookieConfig {
  accessName: string;
  refreshName: string;
  accessMaxAge: number;
  refreshMaxAge: number;
}
