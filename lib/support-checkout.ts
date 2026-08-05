import Stripe from "stripe";
import { getRuntimeEnv } from "./runtime-env";

export const SUPPORT_MINIMUM_CENTS = 500;
export const SUPPORT_MAXIMUM_CENTS = 50_000;
export const SUPPORT_CURRENCY = "usd";

export function isSupportCheckoutEnabled() {
  const runtime = getRuntimeEnv();
  return Boolean(
    runtime.SUPPORT_CHECKOUT_ENABLED === "true"
      && runtime.STRIPE_SECRET_KEY
      && runtime.STRIPE_WEBHOOK_SECRET,
  );
}

export function isStripeWebhookConfigured() {
  const runtime = getRuntimeEnv();
  return Boolean(runtime.STRIPE_SECRET_KEY && runtime.STRIPE_WEBHOOK_SECRET);
}

export function getStripeClient() {
  const secretKey = getRuntimeEnv().STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe secret key is not configured.");
  }

  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function getStripeWebhookSecret() {
  const secret = getRuntimeEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Stripe webhook secret is not configured.");
  }
  return secret;
}

export function stripeObjectId(value: { id: string } | string | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export const SUPPORT_CHECKOUT_DESCRIPTION =
  "Voluntary support for Black Vector development. No game copy, Steam access, playtest admission, ownership, equity, tax deduction, or guaranteed reward is included.";
