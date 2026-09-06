# Website upgrade — September 6, 2026

## Scope

Preserve the hyperspace animation, artwork, audio mix, private builds and disabled support checkout. Improve the site interface and common account/community flows without changing account data or database schema.

- Shared sticky route navigation and accessible mobile disclosure on download, support, policy, account and community pages. Homepage navigation simplified to the primary destinations.
- More readable labels/body copy, higher contrast, clearer current-page treatment, restrained card interactions and consistent focus/touch targets.
- Password visibility controls, nickname autocomplete instead of real-name autocomplete, and password-recovery form reference fixes (React clears `event.currentTarget` after event dispatch).
- Download network errors no longer masquerade as an offline release. Retry and timeout added; playtest profile link lands on the relevant form.
- Chat follows the feed only when reading near the bottom, preserves failed drafts and prevents duplicate concurrent sends. New-message jump control, send timeout and forum request sequencing added.
- Generic route recovery UI does not expose error details.

## Security changes

- Canonical HTTPS redirect, HSTS for production hostnames, no framing, MIME sniffing disabled, referrer/permissions restrictions, and a baseline CSP protecting frame/base/object/form boundaries.
- This is **not a strict script-src CSP** or a claim of complete XSS protection. Streaming React scripts and cinematic inline styles are preserved. A nonce-based script policy needs its own authenticated/cinematic browser test matrix.
- Sensitive API/account/community responses use private, no-store caching. R2 range/ETag/immutable-cache behavior and WebSocket upgrade responses are preserved.
- Browser WebSocket connections require the same origin. Public community channels intentionally remain readable without signing in; writes, DMs, clans and staff operations keep their existing authentication/ownership checks.
- API request bodies are capped at 1 MiB, including chunked requests, before parsing. Avatar's existing stricter 400 KiB file limit remains. Signed webhook bytes are preserved exactly.
- workers.dev and preview URLs disabled; obsolete preview origin removed from authentication trust configuration.
- Legacy GitHub Pages workflow now publishes only a redirect, avoiding a second obsolete application deployment.
- Updated Wrangler/Cloudflare development tooling and vulnerable transitive dependencies; added Dependabot and pull-request build/security tests.

## Dependency caveat

`npm audit --omit=dev` reports zero advisories. Full audit still reports two high entries for one underlying issue: `image-size@2.0.2` and its parent `vinext@0.0.50`. Current vinext uses this parser for repository image imports/build metadata, not the avatar upload route. No patched image-size release was available at review time; npm's proposed remediation is a major move to vinext 1.0 beta. Keep repository image inputs trusted and schedule that framework migration with dedicated regression testing. Do not treat the production-only audit as proof that the bundled application is vulnerability-free.

## Verification

- Production build, TypeScript check, targeted ESLint, 28 Node regression/security tests, Drizzle migration consistency check, and Wrangler deploy dry run.
- Local packaged Worker: public page HTTP responses, account sign-in redirect, unauthenticated member API rejection, download status and privacy/security headers checked.
- No real accounts were created, no verification emails sent, and no payment attempted. Authenticated browser journeys, actual mobile layout and assistive-technology checks remain manual follow-up; this pass does not claim those were exercised.

## Local packaged preview

After `npm run build`, use `npx wrangler dev --port 8787 --local-upstream localhost --host localhost`. The upstream override prevents production-host HTTPS canonicalization from looping through Wrangler's local Location rewrite.

## Rollback

Use Cloudflare Worker version rollback if needed. No migrations are required for this release. GitHub Pages redirect changes are separately reversible through git/workflow deployment. Preserve unrelated local audio deliverables.
