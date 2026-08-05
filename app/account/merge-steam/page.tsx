import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Approve Steam connection | Black Vector",
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function MergeSteamPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = String((await searchParams).token || "");

  return (
    <main className="auth-shell">
      <Link className="auth-wordmark" href="/" aria-label="Return to Black Vector">
        <span>BV</span> BLACK VECTOR<sup className="trademark-symbol">™</sup>
      </Link>
      <section className="auth-panel" aria-labelledby="merge-steam-title">
        <div className="auth-panel-heading">
          <p className="eyebrow">IDENTITY UPLINK // CONNECTION APPROVAL</p>
          <h1 id="merge-steam-title">CONNECT STEAM.</h1>
          <p>
            This approval combines the waiting Steam identity with your existing
            Black Vector profile. Your established display name, community history,
            account settings, and linked sign-in methods remain together.
          </p>
        </div>
        <form className="auth-form" action="/api/account/contact-email/merge" method="post">
          <input type="hidden" name="token" value={token} />
          <button className="primary-action auth-submit" type="submit" disabled={!token}>
            APPROVE STEAM CONNECTION
          </button>
        </form>
        <p className="auth-contact-note">
          Only approve this request if you recently signed into Black Vector with Steam.
          The approval is single-use and expires after one hour.
        </p>
        <div className="auth-switch">
          <Link href="/account">CANCEL AND RETURN TO ACCOUNT</Link>
        </div>
      </section>
      <p className="auth-security-note">
        External credentials remain with their official providers.
      </p>
    </main>
  );
}
