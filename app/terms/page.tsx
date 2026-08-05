import type { Metadata } from "next";
import Link from "next/link";
import { PolicySwitcher } from "@/app/policy-switcher";
import { StandaloneHeader } from "@/app/standalone-header";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const EFFECTIVE_DATE = "August 4, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing Black Vector accounts, community features, playtests, downloads, and future supporter offerings.",
};

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <main className="legal-shell" id="top">
      <StandaloneHeader basePath={BASE_PATH} variant="legal" />

      <article className="legal-document policy-document" id="main-content" tabIndex={-1}>
        <PolicySwitcher basePath={BASE_PATH} current="terms" />
        <p className="eyebrow">SERVICE TERMS // NIMBLE GAME STUDIOS</p>
        <h1>Terms of Service.</h1>
        <div className="policy-meta" aria-label="Terms dates">
          <span>EFFECTIVE {EFFECTIVE_DATE.toUpperCase()}</span>
          <span>LAST UPDATED {EFFECTIVE_DATE.toUpperCase()}</span>
        </div>

        <div className="legal-callout">
          <strong>PLEASE READ THESE TERMS</strong>
          <p>
            These Terms govern the Black Vector website, accounts, community,
            private playtests, downloadable builds, and related services operated
            by Nimble Game Studios. By creating an account, participating in the
            community or a playtest, downloading a build, or otherwise using those
            services, you agree to these Terms and acknowledge the Privacy Notice.
            If you do not agree, do not use the services.
          </p>
        </div>

        <nav className="policy-toc" aria-label="Terms contents">
          <a href="#eligibility">ELIGIBILITY</a>
          <a href="#accounts">ACCOUNTS</a>
          <a href="#playtests">PLAYTESTS</a>
          <a href="#community">COMMUNITY</a>
          <a href="#support">SUPPORT PROGRAM</a>
          <a href="#rights">RIGHTS &amp; LICENSES</a>
          <a href="#disclaimers">DISCLAIMERS</a>
          <a href="#contact">CONTACT</a>
        </nav>

        <section id="eligibility">
          <h2>1. Eligibility and age</h2>
          <p>
            You must be at least 13 years old to use the services. The services
            are not directed to children under 13. If you are under the age of
            legal majority where you live, a parent or legal guardian must review
            and agree to these Terms and authorize your use of the services.
          </p>
          <p>
            You may not use the services if doing so would violate applicable law
            or if Nimble Game Studios has previously suspended or terminated your
            access for a material violation of these Terms.
          </p>
        </section>

        <section id="accounts">
          <h2>2. Accounts and connected identities</h2>
          <p>
            Account information must be accurate and kept current. You are
            responsible for safeguarding your credentials and for activity under
            your account. Notify Nimble Game Studios promptly if you believe your
            account has been accessed without authorization.
          </p>
          <p>
            You may connect supported third-party identities, including Steam,
            Discord, and Google. Those providers operate under their own terms and
            privacy practices. Do not share, sell, transfer, or impersonate another
            person through a Black Vector account.
          </p>
          <p>
            A verified email is required for account security and essential
            playtest communications. Transactional messages may include account,
            verification, security, moderation, access, and build notices.
            Optional development or marketing updates are controlled separately
            and may be declined or unsubscribed from.
          </p>
        </section>

        <section id="playtests">
          <h2>3. Prototype, playtests, and downloadable builds</h2>
          <p>
            Black Vector is in development. Prototype and playtest features may be
            incomplete, contain errors, change without notice, lose progress, or
            be unavailable. Access to a playtest is limited, revocable, and does
            not guarantee access to later tests or the released game.
          </p>
          <p>
            Unless a separate written playtest agreement says otherwise, an
            approved build is licensed only for your personal, non-commercial
            evaluation. You may not redistribute it, sell access, bypass access
            controls, use it to attack the services, or reverse engineer it except
            to the limited extent applicable law expressly permits despite this
            restriction.
          </p>
          <p>
            If a build, page, or invitation is marked confidential, you must not
            publish or disclose the identified confidential material until Nimble
            Game Studios lifts that restriction in writing.
          </p>
        </section>

        <section id="community">
          <h2>4. Community conduct</h2>
          <p>
            Community spaces exist for discussion, feedback, support, and playtest
            coordination. Do not harass or threaten others; post unlawful,
            hateful, sexually exploitative, or privacy-invasive material; spam;
            impersonate people or staff; distribute malware; evade moderation;
            or interfere with the service or another user&apos;s access.
          </p>
          <p>
            Nimble Game Studios may investigate reports and remove content,
            restrict features, or suspend accounts when reasonably necessary to
            enforce these Terms, protect users, preserve service integrity, or
            comply with law. Moderation decisions may consider context, severity,
            history, and risk to the community.
          </p>
        </section>

        <section id="user-content">
          <h2>5. Your content and feedback</h2>
          <p>
            You retain ownership of content you create. By posting it through the
            services, you grant Nimble Game Studios a non-exclusive, worldwide,
            royalty-free license to host, store, reproduce, format, transmit, and
            display that content only as reasonably needed to operate, secure,
            improve, and present the services. This license ends when the content
            is deleted, subject to reasonable backups, legal retention, and copies
            shared by others before deletion.
          </p>
          <p>
            You confirm that you have the rights needed to post your content and
            that it does not violate another person&apos;s rights. Suggestions,
            balance notes, bug reports, and other feedback may be used without
            restriction or compensation, but Nimble Game Studios is not required
            to implement them.
          </p>
        </section>

        <section id="support">
          <h2>6. Future supporter program and payments</h2>
          <p>
            The supporter program is not open. Any prices, tiers, rewards, or
            timing shown before launch are preliminary and are not a binding offer.
            Final descriptions, eligibility, estimated fulfillment, total price,
            taxes or fees, cancellation terms, and refund terms will be presented
            clearly before payment is requested.
          </p>
          <p>
            Support will be a commercial transaction with a for-profit studio,
            not a charitable donation or investment. It will not provide equity,
            ownership, profit sharing, governance, or other investment rights. A
            future game copy will be included only when the final description of a
            selected tier expressly says so. Additional checkout terms may apply
            and will be shown for acceptance before purchase.
          </p>
          <p>
            See the <Link href={`${BASE_PATH}/legal#support-program`}>Supporter Program Notice</Link>
            {" "}for the current pre-launch disclosures.
          </p>
        </section>

        <section id="rights">
          <h2>7. Nimble Game Studios rights</h2>
          <p>
            The services, Black Vector game materials, software, artwork, audio,
            writing, interfaces, logos, and other studio content are owned by or
            licensed to Nimble Game Studios and are protected by intellectual
            property law. Except for the limited rights expressly granted in these
            Terms, no rights are transferred to you.
          </p>
          <p>
            BLACK VECTOR&trade; and associated branding are trademarks of Nimble
            Game Studios. Third-party names and marks remain the property of their
            respective owners.
          </p>
        </section>

        <section id="third-parties">
          <h2>8. Third-party services and links</h2>
          <p>
            The services may connect to third-party platforms, websites, or
            payment providers. Nimble Game Studios does not control their content,
            availability, security, or practices. Your use of a third-party
            service is governed by that provider&apos;s terms.
          </p>
        </section>

        <section id="availability">
          <h2>9. Changes, suspension, and termination</h2>
          <p>
            Nimble Game Studios may change, pause, or discontinue any development
            service or feature. You may stop using the services at any time. We may
            suspend or terminate access for a material or repeated violation of
            these Terms, legal or security risk, abuse of other users, or shutdown
            of the relevant service. Sections that by their nature should survive
            termination will continue to apply.
          </p>
        </section>

        <section id="disclaimers">
          <h2>10. Disclaimers</h2>
          <p>
            To the fullest extent permitted by law, the services and pre-release
            builds are provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo;
            Nimble Game Studios disclaims implied warranties of merchantability,
            fitness for a particular purpose, title, and non-infringement. We do
            not promise uninterrupted operation, error-free software, preservation
            of progress or content, or that every reported issue will be fixed.
            Nothing in these Terms excludes a warranty or consumer right that
            applicable law does not allow to be excluded.
          </p>
        </section>

        <section id="liability">
          <h2>11. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, Nimble Game Studios and its
            personnel will not be liable for indirect, incidental, special,
            consequential, exemplary, or punitive damages, or for lost profits,
            data, goodwill, or opportunities arising from the services. Our total
            liability arising from the services will not exceed the greater of
            $100 USD or the amount you paid directly through the services during
            the 12 months before the event giving rise to the claim. These limits
            do not apply where prohibited by law or to liability that cannot
            lawfully be limited.
          </p>
        </section>

        <section id="indemnity">
          <h2>12. Responsibility for misuse</h2>
          <p>
            To the extent permitted by law, you are responsible for claims,
            losses, and reasonable costs arising from your unlawful use of the
            services, your material violation of these Terms, or content you post
            that infringes another person&apos;s rights. This section does not apply
            to the extent a claim results from Nimble Game Studios&apos; own conduct.
          </p>
        </section>

        <section id="law">
          <h2>13. Applicable law and disputes</h2>
          <p>
            Before filing a formal claim, you and Nimble Game Studios agree to make
            a good-faith effort to resolve it informally for 30 days after written
            notice. These Terms are governed by applicable United States law and
            the law of the state in which Nimble Game Studios is principally
            established, without regard to conflict-of-law rules. Mandatory local
            consumer protections and any court jurisdiction required by law remain
            unaffected.
          </p>
        </section>

        <section id="changes">
          <h2>14. Changes to these Terms</h2>
          <p>
            We may update these Terms as the game and services develop. The current
            version and effective date will remain available on this page. If a
            change materially affects registered users, we will provide reasonable
            notice through the service or account email before the change takes
            effect when required by law. Continued use after the effective date
            means you accept the updated Terms.
          </p>
        </section>

        <section id="contact" className="legal-contact">
          <h2>15. Contact</h2>
          <p>
            Questions about these Terms or a legal notice may be sent to{" "}
            <a href="mailto:access@blackvector.win">access@blackvector.win</a>.
          </p>
        </section>

        <div className="legal-policy-links" aria-label="Related policies">
          <a href="#top">BACK TO TOP</a>
          <Link href={`${BASE_PATH}/privacy`}>READ PRIVACY NOTICE</Link>
          <Link href={`${BASE_PATH}/legal`}>VIEW LEGAL NOTICES</Link>
        </div>
      </article>
    </main>
  );
}
