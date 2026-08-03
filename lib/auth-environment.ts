import { getRuntimeEnv } from "./runtime-env";

const BUILD_ONLY_SECRET = "black-vector-auth-disabled-until-production-secrets-are-configured";

export type ProviderAvailability = {
  manual: boolean;
  google: boolean;
  discord: boolean;
  steam: boolean;
};

export function getAuthEnvironment() {
  const runtime = getRuntimeEnv();
  const baseURL = runtime.BETTER_AUTH_URL || "http://localhost:3000";
  const trustedOrigins = new Set([baseURL]);
  for (const origin of runtime.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []) {
    const value = origin.trim();
    if (value) trustedOrigins.add(value);
  }

  const providers: ProviderAvailability = {
    manual: Boolean(runtime.RESEND_API_KEY && runtime.AUTH_EMAIL_FROM),
    google: Boolean(runtime.GOOGLE_CLIENT_ID && runtime.GOOGLE_CLIENT_SECRET),
    discord: Boolean(runtime.DISCORD_CLIENT_ID && runtime.DISCORD_CLIENT_SECRET),
    steam: Boolean(runtime.STEAM_API_KEY),
  };

  return {
    runtime,
    baseURL,
    trustedOrigins: [...trustedOrigins],
    providers,
    secret: runtime.BETTER_AUTH_SECRET || BUILD_ONLY_SECRET,
    coreConfigured: Boolean(
      runtime.BETTER_AUTH_SECRET
      && runtime.BETTER_AUTH_SECRET.length >= 32
      && runtime.BETTER_AUTH_URL,
    ),
  };
}
