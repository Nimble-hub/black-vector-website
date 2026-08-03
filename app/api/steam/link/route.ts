import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { getDb } from "@/db";
import { account, user } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const accounts = await db
    .select({ id: account.id, providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, session.user.id));
  if (accounts.length <= 1) {
    return Response.json({ error: "Connect another sign-in method before removing Steam." }, { status: 409 });
  }

  await db
    .delete(account)
    .where(and(eq(account.userId, session.user.id), eq(account.providerId, "steam")));
  await db.update(user).set({ steamId: null }).where(eq(user.id, session.user.id));
  return Response.json({ ok: true });
}
