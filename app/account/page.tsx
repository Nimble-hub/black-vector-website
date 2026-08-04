import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { getDb } from "@/db";
import { playtestProfile } from "@/db/schema";
import {
  hasVerifiedContactEmail,
  safeInternalReturnTo,
} from "@/lib/account-email";
import { AccountSettings } from "./settings";

export const metadata: Metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

const connectionMessages: Record<string, string> = {
  linked: "Connection added to this Black Vector profile.",
  "steam-linked": "Steam identity connected.",
  "steam-state-expired": "The Steam connection window expired. Try again.",
  "steam-verification-failed": "Steam could not verify that identity.",
  "steam-already-linked": "That Steam identity belongs to another Black Vector profile.",
  "steam-link-failed": "Steam could not be connected.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    connection?: string;
    email?: string;
    returnTo?: string;
  }>;
}) {
  const environment = getAuthEnvironment();
  if (!environment.coreConfigured) redirect("/login?returnTo=/account");

  const requestHeaders = await headers();
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/login?returnTo=/account");

  const [accounts, profiles] = await Promise.all([
    auth.api.listUserAccounts({ headers: requestHeaders }),
    getDb().select().from(playtestProfile).where(eq(playtestProfile.userId, session.user.id)).limit(1),
  ]);
  const query = await searchParams;
  const emailRequired = !hasVerifiedContactEmail(session.user);
  const returnTo = safeInternalReturnTo(query.returnTo);
  const initialTab = emailRequired
    ? "profile"
    : query.connection
      ? "connections"
      : query.tab === "connections" || query.tab === "security"
        ? query.tab
        : "profile";
  const initialStatus = query.email === "required"
    ? "Verify a deliverable contact email to complete this account."
    : query.email === "verified"
      ? "Primary email verified."
      : query.connection
        ? connectionMessages[query.connection] || "Connection flow completed."
        : "";

  return (
    <main className="account-shell">
      <header className="account-header">
        <Link className="auth-wordmark" href="/"><span>BV</span> BLACK VECTOR</Link>
        <nav className="account-global-nav" aria-label="Account navigation">
          <Link href="/">HOME</Link>
          <Link href="/community">COMMUNITY</Link>
        </nav>
        <div className="account-user-state"><span>IDENTITY NODE // AUTHENTICATED</span><strong>{session.user.name}</strong></div>
      </header>
      <AccountSettings
        user={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          emailVerified: session.user.emailVerified,
          image: session.user.image || null,
        }}
        accounts={accounts.map((item) => ({
          id: item.id,
          providerId: item.providerId,
          accountId: item.accountId,
        }))}
        providers={environment.providers}
        initialTab={initialTab}
        initialStatus={initialStatus}
        emailRequired={emailRequired}
        returnTo={returnTo}
        initialProfile={profiles[0] ? {
          callsign: profiles[0].callsign || "",
          preferredPlatform: profiles[0].preferredPlatform,
          strategyExperience: profiles[0].strategyExperience,
          playtestOptIn: profiles[0].playtestOptIn,
          developmentUpdatesOptIn: profiles[0].developmentUpdatesOptIn,
        } : null}
      />
    </main>
  );
}
