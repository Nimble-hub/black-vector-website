import Stripe from "stripe";
import { getD1 } from "@/db";
import {
  getStripeClient,
  getStripeWebhookSecret,
  isStripeWebhookConfigured,
  stripeObjectId,
} from "@/lib/support-checkout";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

function checkoutSessionStatement(
  d1: D1Database,
  session: Stripe.Checkout.Session,
  status: "pending" | "paid" | "expired" | "failed",
  now: number,
) {
  const contributionId = session.metadata?.contribution_id ?? null;
  const paymentIntentId = stripeObjectId(session.payment_intent);
  const supporterEmail =
    session.customer_details?.email ?? session.customer_email ?? null;
  const paidAt = status === "paid" ? now : null;
  const statusGuard = status === "paid"
    ? "AND status NOT IN ('partially_refunded', 'refunded', 'disputed')"
    : "AND status = 'pending'";

  return d1
    .prepare(
      `UPDATE support_contribution
       SET status = ?,
           stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, ?),
           stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ?),
           supporter_email = COALESCE(?, supporter_email),
           paid_at = COALESCE(?, paid_at),
           updated_at = ?
       WHERE ((? IS NOT NULL AND id = ?) OR stripe_checkout_session_id = ?)
       ${statusGuard}`,
    )
    .bind(
      status,
      session.id,
      paymentIntentId,
      supporterEmail,
      paidAt,
      now,
      contributionId,
      contributionId,
      session.id,
    );
}

export async function POST(request: Request) {
  if (!isStripeWebhookConfigured()) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature." }, { status: 400 });
  }

  const payload = await request.text();
  if (new TextEncoder().encode(payload).byteLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  let event: Stripe.Event;
  try {
    event = await getStripeClient().webhooks.constructEventAsync(
      payload,
      signature,
      getStripeWebhookSecret(),
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (error) {
    console.error(JSON.stringify({
      message: "stripe webhook signature verification failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  const d1 = getD1();
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    d1
      .prepare(
        `INSERT INTO stripe_webhook_event (id, type, created_at, processed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(event.id, event.type, event.created * 1000, now),
  ];

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      statements.push(
        checkoutSessionStatement(
          d1,
          session,
          session.payment_status === "paid" ? "paid" : "pending",
          now,
        ),
      );
      break;
    }
    case "checkout.session.async_payment_succeeded":
      statements.push(checkoutSessionStatement(d1, event.data.object, "paid", now));
      break;
    case "checkout.session.async_payment_failed":
      statements.push(checkoutSessionStatement(d1, event.data.object, "failed", now));
      break;
    case "checkout.session.expired":
      statements.push(checkoutSessionStatement(d1, event.data.object, "expired", now));
      break;
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId = stripeObjectId(charge.payment_intent);
      if (paymentIntentId) {
        const refundStatus = charge.amount_refunded >= charge.amount
          ? "refunded"
          : "partially_refunded";
        statements.push(
          d1
            .prepare(
              `UPDATE support_contribution
               SET status = ?, amount_refunded_cents = ?, updated_at = ?
               WHERE stripe_payment_intent_id = ?`,
            )
            .bind(refundStatus, charge.amount_refunded, now, paymentIntentId),
        );
      }
      break;
    }
    case "charge.dispute.created": {
      const paymentIntentId = stripeObjectId(event.data.object.payment_intent);
      if (paymentIntentId) {
        statements.push(
          d1
            .prepare(
              `UPDATE support_contribution
               SET status = 'disputed', updated_at = ?
               WHERE stripe_payment_intent_id = ?`,
            )
            .bind(now, paymentIntentId),
        );
      }
      break;
    }
  }

  try {
    await d1.batch(statements);
  } catch (error) {
    console.error(JSON.stringify({
      message: "stripe webhook persistence failed",
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    }));
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
