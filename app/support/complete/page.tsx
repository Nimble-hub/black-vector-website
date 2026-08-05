import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupportCheckoutEnabled } from "@/lib/support-checkout";

export const metadata: Metadata = {
  title: "Support received",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function SupportCompletePage() {
  if (!isSupportCheckoutEnabled()) notFound();

  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="auth-wordmark" href="/" aria-label="Return to Black Vector home">
          <span>BV</span> BLACK VECTOR<sup className="trademark-symbol">™</sup>
        </Link>
      </header>
      <article className="legal-document">
        <p className="eyebrow">TRANSMISSION RECEIVED // THANK YOU</p>
        <h1>Your support has been received.</h1>
        <p>
          Stripe is confirming the payment securely. Your support helps fund
          Black Vector development, but does not grant a game copy, Steam
          ownership, playtest admission, equity, or a guaranteed reward.
        </p>
        <p><Link href="/">RETURN TO BLACK VECTOR</Link></p>
      </article>
    </main>
  );
}
