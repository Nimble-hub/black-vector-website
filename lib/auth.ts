import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { steamOpenID } from "better-auth-steam";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { getAuthEnvironment } from "./auth-environment";
import { sendAuthEmail } from "./auth-email";

function createAuth() {
  const authEnvironment = getAuthEnvironment();
  const { runtime, providers } = authEnvironment;
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (providers.google) {
    socialProviders.google = {
      clientId: runtime.GOOGLE_CLIENT_ID!,
      clientSecret: runtime.GOOGLE_CLIENT_SECRET!,
    };
  }
  if (providers.discord) {
    socialProviders.discord = {
      clientId: runtime.DISCORD_CLIENT_ID!,
      clientSecret: runtime.DISCORD_CLIENT_SECRET!,
    };
  }

  return betterAuth({
  appName: "Black Vector",
  baseURL: authEnvironment.baseURL,
  secret: authEnvironment.secret,
  trustedOrigins: authEnvironment.trustedOrigins,
  database: drizzleAdapter(getDb(), {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: providers.manual,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Reset your Black Vector access key",
        preheader: "A password reset was requested for your Black Vector account.",
        heading: "Reset access key",
        message: "A password reset was requested for your Black Vector account. This link expires automatically.",
        actionLabel: "RESET PASSWORD",
        actionUrl: url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Verify your Black Vector account",
        preheader: "Confirm your address to open the Black Vector access terminal.",
        heading: "Confirm your identity",
        message: "Confirm this email address to activate your account and protect any connected identities.",
        actionLabel: "VERIFY ACCOUNT",
        actionUrl: url,
      });
    },
  },
  user: {
    changeEmail: { enabled: true },
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: true,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "database",
  },
  socialProviders,
  plugins: providers.steam
    ? [steamOpenID({
        apiKey: runtime.STEAM_API_KEY!,
        syntheticEmailDomain: "steam.blackvector.invalid",
      }) as unknown as BetterAuthPlugin]
    : [],
  advanced: {
    useSecureCookies: authEnvironment.baseURL.startsWith("https://"),
    database: { generateId: "uuid" },
  },
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  authInstance ??= createAuth();
  return authInstance;
}

export type BlackVectorSession = ReturnType<typeof createAuth>["$Infer"]["Session"];
