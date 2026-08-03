import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { verifySteamAssertion } from "@/lib/steam-openid";
import { getDb } from "@/db";
import { account, user, verification } from "@/db/schema";

export const dynamic = "force-dynamic";

function accountRedirect(baseURL: string, status: string) {
  return Response.redirect(`${baseURL}/account?connection=${encodeURIComponent(status)}`, 302);
}

export async function GET(request: Request) {
  const environment = getAuthEnvironment();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return Response.redirect(`${environment.baseURL}/login?returnTo=/account`, 302);

  const state = new URL(request.url).searchParams.get("state") || "";
  const identifier = `steam-link:${session.user.id}`;
  const db = getDb();
  const pending = await db
    .select()
    .from(verification)
    .where(and(eq(verification.identifier, identifier), eq(verification.value, state)))
    .limit(1);
  await db.delete(verification).where(eq(verification.identifier, identifier));
  if (!pending[0] || pending[0].expiresAt.getTime() < Date.now()) {
    return accountRedirect(environment.baseURL, "steam-state-expired");
  }

  const expectedReturnTo = `${environment.baseURL}/api/steam/link/callback?state=${state}`;
  let steamId: string;
  try {
    steamId = await verifySteamAssertion(request.url, expectedReturnTo);
  } catch {
    return accountRedirect(environment.baseURL, "steam-verification-failed");
  }

  const existing = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, "steam"), eq(account.accountId, steamId)))
    .limit(1);
  if (existing[0] && existing[0].userId !== session.user.id) {
    return accountRedirect(environment.baseURL, "steam-already-linked");
  }

  try {
    if (!existing[0]) {
      const now = new Date();
      await db.insert(account).values({
        id: crypto.randomUUID(),
        providerId: "steam",
        accountId: steamId,
        userId: session.user.id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.update(user).set({ steamId }).where(eq(user.id, session.user.id));
  } catch {
    return accountRedirect(environment.baseURL, "steam-link-failed");
  }

  return accountRedirect(environment.baseURL, "steam-linked");
}
