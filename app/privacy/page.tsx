import type { Metadata } from "next";
import Link from "next/link";
import { PolicySwitcher } from "@/app/policy-switcher";
import { StandaloneHeader } from "@/app/standalone-header";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const EFFECTIVE_DATE = "August 4, 2026";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description:
    "How Nimble Game Studios collects, uses, shares, and protects information in the Black Vector services.",
};

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <main className="legal-shell" id="top">
      <StandaloneHeader basePath={BASE_PATH} variant="legal" />

      <article className="legal-document policy-document" id="main-content" tabIndex={-1}>
        <PolicySwitcher basePath={BASE_PATH} current="privacy" />
        <p className="eyebrow">PRIVACY RECORD // NIMBLE GAME STUDIOS</p>
        <h1>Privacy Notice.</h1>
        <div className="policy-meta" aria-label="Privacy notice dates">
          <span>EFFECTIVE {EFFECTIVE_DATE.toUpperCase()}</span>
          <span>LAST UPDATED {EFFECTIVE_DATE.toUpperCase()}</span>
        </div>

        <div className="legal-callout">
          <strong>YOUR INFORMATION AT BLACK VECTOR</strong>
          <p>
            This Notice explains what Nimble Game Studios collects through the
            Black Vector website, accounts, community, playtests, and build
            delivery services; why we use it; and the choices available to you.
            We do not sell personal information or use it for third-party
            behavioral advertising.
          </p>
        </div>

        <nav className="policy-toc" aria-label="Privacy notice contents">
          <a href="#collect">WHAT WE COLLECT</a>
          <a href="#use">HOW WE USE IT</a>
          <a href="#share">HOW WE SHARE IT</a>
          <a href="#public">PUBLIC CONTENT</a>
          <a href="#choices">YOUR CHOICES</a>
          <a href="#children">CHILDREN</a>
          <a href="#contact">CONTACT</a>
        </nav>

        <section id="collect">
          <h2>1. Information we collect</h2>
          <p>
            <strong>Account and identity information.</strong> We collect your
            display name, verified email, account identifiers, profile image,
            password credential in hashed form for manual accounts, and identifiers
            returned by connected providers such as Steam, Discord, or Google. We
            do not receive the password you use with those providers.
          </p>
          <p>
            <strong>Profile and playtest information.</strong> We collect the
            callsign, platform, strategy-game experience, playtest interest,
            development-update preference, access status, and similar information
            you submit through your profile or an application.
          </p>
          <p>
            <strong>Community information.</strong> We process chat messages,
            forum posts and replies, direct messages, mentions, friend requests,
            clan membership and content, moderation records, reports, presence
            status, and other actions you choose to take in community features.
          </p>
          <p>
            <strong>Technical and security information.</strong> Our systems may
            receive IP address, browser and device information, request times,
            referring pages, session identifiers, diagnostic logs, security
            events, and download activity. Essential cookies maintain sign-in and
            security. Device storage remembers preferences such as cinematic audio
            settings.
          </p>
          <p>
            <strong>Payment information.</strong> If the supporter program opens,
            Stripe will process payment credentials under its own privacy terms.
            Nimble Game Studios expects to receive transaction status, amount,
            contact details, and processor identifiers, but not your full card
            number.
          </p>
        </section>

        <section id="use">
          <h2>2. How we use information</h2>
          <p>We use information to:</p>
          <ul>
            <li>create, authenticate, secure, and recover accounts;</li>
            <li>connect identities and prevent unauthorized account linking;</li>
            <li>operate chat, forums, direct messages, friends, clans, profiles, and presence;</li>
            <li>review playtest applications, grant access, and deliver approved builds;</li>
            <li>send verification, security, moderation, account, access, and release notices;</li>
            <li>send optional development updates when you choose to receive them;</li>
            <li>detect abuse, enforce the Terms, troubleshoot, and improve the services; and</li>
            <li>comply with law and protect users, the studio, and the public.</li>
          </ul>
        </section>

        <section id="share">
          <h2>3. How we disclose information</h2>
          <p>
            We disclose information to service providers that help operate Black
            Vector, including Cloudflare for hosting, storage, security, and
            realtime infrastructure; account providers you choose to connect; and,
            when payments open, Stripe for checkout and payment processing. These
            providers process information under their own agreements and policies.
          </p>
          <p>
            We may also disclose information when reasonably necessary to comply
            with law or valid legal process, investigate abuse or security issues,
            protect rights and safety, or complete a business reorganization or
            transfer with appropriate safeguards. We do not sell personal
            information.
          </p>
        </section>

        <section id="public">
          <h2>4. Public and member-visible content</h2>
          <p>
            Your display name, avatar, role, presence choice, public chat messages,
            forum content, and clan information may be visible to other members or
            the public depending on the feature. Direct messages are visible to
            participants and may be accessed by authorized personnel when needed
            for safety, moderation, security, or legal compliance.
          </p>
          <p>
            Avoid posting sensitive personal information. Removing content from
            your account may not remove screenshots, quotations, moderation
            records, lawful retention copies, or content already shared by others.
          </p>
        </section>

        <section id="retention">
          <h2>5. Retention</h2>
          <p>
            We keep information for as long as reasonably needed to operate the
            services, maintain account and security records, preserve community
            integrity, comply with legal obligations, and resolve disputes. The
            period depends on the type of information and why it is held. Backups
            and security logs may remain for a limited period after active data is
            deleted.
          </p>
        </section>

        <section id="security">
          <h2>6. Security</h2>
          <p>
            We use administrative and technical safeguards designed to protect
            information, including hashed manual-account passwords, verified email
            flows, access controls, encrypted transport, rate limits, and restricted
            build delivery. No online service can guarantee absolute security.
          </p>
        </section>

        <section id="choices">
          <h2>7. Your choices and requests</h2>
          <p>
            Account Settings lets you update profile information, presence,
            connected identities, and optional development-update preferences.
            You may mute or leave community spaces and remove content where the
            feature provides that control.
          </p>
          <p>
            Depending on where you live, you may have rights to request access,
            correction, deletion, portability, restriction, or objection regarding
            personal information. To make a privacy or account-deletion request,
            email <a href="mailto:access@blackvector.win">access@blackvector.win</a>
            {" "}from the address connected to your account. We may need to verify
            your identity and may retain information where law or legitimate
            security needs require it.
          </p>
        </section>

        <section id="children">
          <h2>8. Children</h2>
          <p>
            The services are not directed to children under 13, and we do not
            knowingly collect personal information from a child under 13. If you
            believe a child has provided information, contact us so we can review
            and delete it as appropriate.
          </p>
        </section>

        <section id="transfers">
          <h2>9. International use</h2>
          <p>
            Black Vector is operated from the United States. Information may be
            processed in the United States and other countries where service
            providers operate, which may have different data-protection laws than
            your location. We apply protections appropriate to the service and
            applicable law.
          </p>
        </section>

        <section id="changes">
          <h2>10. Changes to this Notice</h2>
          <p>
            We may update this Notice as the services develop. The current version
            and effective date will remain on this page. We will provide reasonable
            notice through the service or account email before a material change
            takes effect when required by law.
          </p>
        </section>

        <section id="contact" className="legal-contact">
          <h2>11. Contact</h2>
          <p>
            Privacy questions and requests may be sent to{" "}
            <a href="mailto:access@blackvector.win">access@blackvector.win</a>.
          </p>
        </section>

        <div className="legal-policy-links" aria-label="Related policies">
          <a href="#top">BACK TO TOP</a>
          <Link href={`${BASE_PATH}/terms`}>READ TERMS OF SERVICE</Link>
          <Link href={`${BASE_PATH}/legal`}>VIEW LEGAL NOTICES</Link>
        </div>
      </article>
    </main>
  );
}
