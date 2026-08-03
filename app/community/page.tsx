import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getCommunityRole } from "@/lib/community-permissions";
import { CommunityConsole } from "./community-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Uplink | Black Vector",
  description: "Live comms, fleet feedback, suggestions, and bug reports for Black Vector.",
};

export default async function CommunityPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const role = session ? await getCommunityRole(session.user.id) : "member";
  return (
    <main>
      <CommunityConsole
        currentUser={session ? { id: session.user.id, name: session.user.name, role } : null}
      />
    </main>
  );
}
