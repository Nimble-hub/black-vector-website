# Stripe Checkout staging plan

The support checkout foundation is intentionally **off** in production. The
Worker only creates Checkout Sessions when all three conditions are true:

1. `SUPPORT_CHECKOUT_ENABLED` is exactly `true`.
2. `STRIPE_SECRET_KEY` is present as a Worker secret.
3. `STRIPE_WEBHOOK_SECRET` is present as a Worker secret.

Until then, the checkout and completion routes return `404`, and the public
site contains no support button or payment link.

## Product boundary

Support payments are voluntary contributions to Black Vector development.
They do not grant a game copy, Steam ownership, playtest admission, download
entitlement, equity, a tax deduction, or a guaranteed reward. Payment records
are stored separately from `game_download_entitlement` and no webhook handler
can write to that table.

## Test-mode activation checklist

1. Finish Stripe business verification and confirm the public-facing business
   name and support contact.
2. Add the Stripe **test-mode** secret key with
   `npx wrangler secret put STRIPE_SECRET_KEY`.
3. Create a Stripe event destination for
   `https://blackvector.win/api/support/webhook` and subscribe only to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
4. Add that destination's test signing secret with
   `npx wrangler secret put STRIPE_WEBHOOK_SECRET`.
5. Keep `SUPPORT_CHECKOUT_ENABLED` set to `false` while exercising the webhook
   with the Stripe CLI or Workbench test events.
6. Review the support page copy, refund policy, privacy disclosure, receipt
   behavior, and accounting treatment before adding any public button.
7. Run an end-to-end test payment and verify the D1 contribution status is
   updated by the signed webhook—not by the browser redirect.
8. Replace both Stripe test secrets with live-mode secrets only after approval.
9. Set `SUPPORT_CHECKOUT_ENABLED` to `true` and deploy as the final launch step.

## Security notes

- Card details are collected only on Stripe's hosted Checkout page and never
  pass through Black Vector servers.
- The Worker verifies Stripe's signature against the untouched request body.
- Stripe keys and webhook signing secrets must remain Worker secrets and must
  never be committed to source control or placed in `wrangler.jsonc`.
- Webhook writes are idempotent by Stripe event ID and contribution updates are
  safe to repeat.
