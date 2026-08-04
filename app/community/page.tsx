import type { Metadata } from "next";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getCommunityRole } from "@/lib/community-permissions";
import { getDb } from "@/db";
import { user } from "@/db/schema";
import { CommunityConsole } from "./community-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Uplink | Black Vector",
  description: "Live comms, fleet feedback, suggestions, and bug reports for Black Vector.",
};

export default async function CommunityPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const role = session ? await getCommunityRole(session.user.id) : "member";
  const identities = session
    ? await getDb()
        .select({ name: user.name, displayNameSet: user.displayNameSet })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1)
    : [];
  const identity = identities[0];
  return (
    <main>
      <CommunityConsole
        currentUser={session ? {
          id: session.user.id,
          name: identity?.name ?? session.user.name,
          displayNameSet: identity?.displayNameSet ?? false,
          role,
        } : null}
      />
    </main>
  );
}
