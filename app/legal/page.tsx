import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal and trademark notice",
  description: "Ownership, trademark, and copyright notices for Black Vector.",
};

export default function LegalPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="auth-wordmark" href="/" aria-label="Return to Black Vector home">
          <span>BV</span> BLACK VECTOR<sup className="trademark-symbol">™</sup>
        </Link>
        <nav aria-label="Legal page navigation">
          <Link href="/">HOME</Link>
          <Link href="/community">COMMUNITY</Link>
          <Link href="/account">ACCOUNT</Link>
        </nav>
      </header>

      <article className="legal-document">
        <p className="eyebrow">LEGAL RECORD // BRAND OWNERSHIP</p>
        <h1>Trademark and ownership notice.</h1>

        <h2>Black Vector trademark</h2>
        <p>
          BLACK VECTOR™ and the BLACK VECTOR logo are trademarks of Nimble
          Games Studio in connection with computer game software, online game
          services, playtesting, and related entertainment services.
        </p>
        <p>
          The ™ symbol identifies an unregistered trademark claim. It does not
          represent federal registration. The ® symbol is not used for BLACK
          VECTOR unless and until the applicable mark is federally registered.
        </p>

        <h2>Copyright</h2>
        <p>
          © 2026 Nimble Games Studio. Original Black Vector artwork, writing,
          audio, visual presentation, game materials, and website content are
          protected by applicable copyright law. All rights reserved.
        </p>

        <h2>Third-party marks</h2>
        <p>
          Steam, Discord, Google, and other third-party names, logos, and marks
          belong to their respective owners. Their appearance identifies
          supported services and does not imply sponsorship or endorsement.
        </p>
      </article>
    </main>
  );
}
