import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const SITE_URL = "https://blackvector.win";
const DISCORD_URL = "https://discord.gg/PAasrdjBqe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nimble Game Studios | Independent Game Studio",
  description:
    "Nimble Game Studios is an independent game studio creating ambitious strategy games and cinematic science-fiction experiences.",
  alternates: { canonical: `${SITE_URL}/nimble-game-studios` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Nimble Game Studios",
    description:
      "An independent game studio building ambitious strategy games and cinematic science-fiction experiences.",
    url: `${SITE_URL}/nimble-game-studios`,
    siteName: "Nimble Game Studios",
    type: "website",
  },
};

export default function NimbleGameStudiosPage() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Nimble Game Studios",
    url: `${SITE_URL}/nimble-game-studios`,
    logo: `${SITE_URL}/brand/ngs-logo-fullcolor.png`,
    description:
      "Independent game studio creating ambitious strategy games and cinematic science-fiction experiences.",
    sameAs: [DISCORD_URL],
  };

  return (
    <main className="ngs-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <section className="ngs-holding" aria-labelledby="ngs-title">
        <Image
          className="ngs-logo"
          src="/brand/ngs-logo-fullcolor.png"
          alt="Nimble Game Studios"
          width={1600}
          height={900}
          priority
        />
        <p className="ngs-kicker">Independent game studio // Site in development</p>
        <h1 id="ngs-title">We build worlds worth commanding.</h1>
        <p className="ngs-summary">
          Nimble Game Studios is an independent developer creating ambitious
          strategy games and cinematic science-fiction experiences. Our first
          announced title is Black Vector, a large-scale fleet-command RTS.
        </p>
        <div className="ngs-actions">
          <Link href="/">EXPLORE BLACK VECTOR™</Link>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">
            JOIN THE NGS DISCORD
          </a>
        </div>
        <p className="ngs-footnote">© 2026 Nimble Game Studios. All rights reserved.</p>
      </section>
    </main>
  );
}
