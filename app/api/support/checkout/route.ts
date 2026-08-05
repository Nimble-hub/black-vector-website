import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { supportContribution } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  getStripeClient,
  isSupportCheckoutEnabled,
  SUPPORT_CHECKOUT_DESCRIPTION,
  SUPPORT_CURRENCY,
  SUPPORT_MAXIMUM_CENTS,
  SUPPORT_MINIMUM_CENTS,
} from "@/lib/support-checkout";

export const dynamic = "force-dynamic";

const checkoutInput = z.object({
  amountCents: z
    .number()
    .int()
    .min(SUPPORT_MINIMUM_CENTS)
    .max(SUPPORT_MAXIMUM_CENTS),
  recognitionOptIn: z.boolean().default(false),
});

function unavailable() {
  return Response.json(
    { error: "Not found." },
    {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    },
  );
}

export async function POST(request: Request) {
  if (!isSupportCheckoutEnabled()) return unavailable();
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const parsed = checkoutInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid support amount." }, { status: 400 });
  }

  const authSession = await getAuth().api.getSession({ headers: await headers() });
  const contributionId = crypto.randomUUID();
  const now = new Date();
  const supporterEmail = authSession?.user.emailVerified
    ? authSession.user.email
    : null;

  await getDb().insert(supportContribution).values({
    id: contributionId,
    userId: authSession?.user.id ?? null,
    supporterEmail,
    amountCents: parsed.data.amountCents,
    currency: SUPPORT_CURRENCY,
    recognitionOptIn: parsed.data.recognitionOptIn,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  try {
    const baseURL = getAuthEnvironment().baseURL;
    const stripe = getStripeClient();
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: contributionId,
        customer_email: supporterEmail ?? undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: SUPPORT_CURRENCY,
              unit_amount: parsed.data.amountCents,
              product_data: {
                name: "Support Black Vector Development",
                description: SUPPORT_CHECKOUT_DESCRIPTION,
              },
            },
          },
        ],
        metadata: { contribution_id: contributionId },
        payment_intent_data: {
          metadata: { contribution_id: contributionId },
        },
        success_url: `${baseURL}/support/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseURL}/`,
      },
      { idempotencyKey: `support-checkout-${contributionId}` },
    );

    await getDb()
      .update(supportContribution)
      .set({
        stripeCheckoutSessionId: checkout.id,
        updatedAt: new Date(),
      })
      .where(eq(supportContribution.id, contributionId));

    if (!checkout.url) {
      throw new Error("Stripe did not return a hosted Checkout URL.");
    }

    return Response.json(
      { url: checkout.url },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    await getDb()
      .update(supportContribution)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(supportContribution.id, contributionId));
    console.error(JSON.stringify({
      message: "support checkout creation failed",
      contributionId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return Response.json(
      { error: "Checkout is temporarily unavailable." },
      { status: 502 },
    );
  }
}
