import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { createSteamLoginURL } from "@/lib/steam-openid";
import { getDb } from "@/db";
import { verification } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const environment = getAuthEnvironment();
  if (!environment.coreConfigured || !environment.providers.steam) {
    return Response.redirect(`${environment.baseURL}/account?error=steam-unavailable`, 302);
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return Response.redirect(`${environment.baseURL}/login?returnTo=/account`, 302);

  const state = crypto.randomUUID().replaceAll("-", "");
  const identifier = `steam-link:${session.user.id}`;
  const db = getDb();
  await db.delete(verification).where(eq(verification.identifier, identifier));
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: state,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const returnTo = `${environment.baseURL}/api/steam/link/callback?state=${state}`;
  return Response.redirect(createSteamLoginURL(environment.baseURL, returnTo), 302);
}
