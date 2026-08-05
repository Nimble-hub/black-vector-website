import type { Metadata } from "next";
import Link from "next/link";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Legal notices",
  description:
    "Trademark, copyright, ownership, and supporter-program notices for Black Vector.",
};

export const dynamic = "force-dynamic";

export default function LegalPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link
          className="auth-wordmark"
          href={`${BASE_PATH}/`}
          aria-label="Return to Black Vector home"
        >
          <span>BV</span> BLACK VECTOR
          <sup className="trademark-symbol">&trade;</sup>
        </Link>
        <nav aria-label="Legal page navigation">
          <Link href={`${BASE_PATH}/`}>HOME</Link>
          <Link href={`${BASE_PATH}/support`}>SUPPORT</Link>
          <Link href={`${BASE_PATH}/community`}>COMMUNITY</Link>
          <Link href={`${BASE_PATH}/account`}>ACCOUNT</Link>
          <Link href={`${BASE_PATH}/legal`} aria-current="page">LEGAL</Link>
        </nav>
      </header>

      <article className="legal-document">
        <p className="eyebrow">LEGAL RECORD // NIMBLE GAME STUDIOS</p>
        <h1>Legal notices.</h1>

        <h2>Black Vector trademark</h2>
        <p>
          BLACK VECTOR&trade; and the BLACK VECTOR logo are trademarks of Nimble
          Game Studios in connection with computer game software, online game
          services, playtesting, and related entertainment services.
        </p>

        <h2>Ownership</h2>
        <p>
          &copy; 2026 Nimble Game Studios. Original Black Vector artwork,
          writing, audio, visual presentation, game materials, and website
          content are protected by applicable copyright law. All rights
          reserved.
        </p>

        <section id="support-program" className="legal-support-notice">
          <p className="eyebrow">SUPPORT PROGRAM // PRE-LAUNCH NOTICE</p>
          <h2>Preliminary tiers and rewards</h2>
          <p>
            The six planned support tiers, currently shown from $30 to $200 USD,
            are preliminary. Prices, tier structure, names, availability, and
            rewards are subject to change and will be finalized when the support
            program opens. Information shown before launch is not a binding
            offer and does not create a reservation, purchase, or entitlement.
          </p>

          <h2>Final terms before payment</h2>
          <p>
            Before accepting payment, Nimble Game Studios will publish the final
            price and reward package for each tier together with eligibility,
            platform or regional limitations, estimated fulfillment timing,
            applicable taxes or fees, and the governing cancellation and refund
            terms. Supporters will be able to review and accept those terms
            before completing checkout.
          </p>

          <h2>Commercial support; not charity or investment</h2>
          <p>
            The program will offer paid support tiers from a for-profit game
            studio. Payments will not be charitable contributions or
            tax-deductible gifts. Supporting Black Vector will not provide
            ownership, equity, profit sharing, governance rights, securities,
            or any other investment interest in Nimble Game Studios or the game.
          </p>

          <h2>Rewards and future game copies</h2>
          <p>
            Rewards remain in development. A future copy of Black Vector will be
            included only where the final published description for a selected
            tier expressly includes it. Estimated delivery dates and development
            milestones will be identified as estimates, and any material change
            will be handled under the published support and refund terms and
            applicable law.
          </p>

          <h2>Eligibility</h2>
          <p>
            The final program may be limited by age, region, platform, payment
            availability, or other lawful eligibility requirements. A purchaser
            must be legally able to enter the transaction or have authorization
            from a parent or legal guardian where required.
          </p>
        </section>

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
