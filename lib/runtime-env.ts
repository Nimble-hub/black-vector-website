import { env } from "cloudflare:workers";

export type BlackVectorRuntimeEnv = {
  DB: D1Database;
  GAME_BUILDS: R2Bucket;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  STEAM_API_KEY?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SUPPORT_CHECKOUT_ENABLED?: string;
};

export function getRuntimeEnv(): BlackVectorRuntimeEnv {
  return env as unknown as BlackVectorRuntimeEnv;
}
