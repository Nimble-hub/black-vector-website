import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { gameDownloadEntitlement, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getCommunityRole } from "@/lib/community-permissions";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const entitlementSchema = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    channel: z.enum(["playtest", "release"]).default("playtest"),
    active: z.boolean().default(true),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((input) => Boolean(input.userId || input.email), {
    message: "A user ID or email address is required.",
  });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || (await getCommunityRole(session.user.id)) !== "admin") {
    return Response.json({ error: "Administrator access required." }, { status: 403 });
  }

  const parsed = entitlementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid entitlement request." }, { status: 400 });
  }
  const input = parsed.data;
  const where = input.userId
    ? eq(user.id, input.userId)
    : eq(user.email, input.email!.trim().toLowerCase());
  const [member] = await getDb()
    .select({ id: user.id, emailVerified: user.emailVerified })
    .from(user)
    .where(where)
    .limit(1);
  if (!member) return Response.json({ error: "Member not found." }, { status: 404 });
  if (input.active && !member.emailVerified) {
    return Response.json({ error: "Verify the member's email before granting access." }, { status: 409 });
  }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  await getDb()
    .insert(gameDownloadEntitlement)
    .values({
      id: crypto.randomUUID(),
      userId: member.id,
      channel: input.channel,
      active: input.active,
      expiresAt,
      grantedBy: session.user.id,
    })
    .onConflictDoUpdate({
      target: [gameDownloadEntitlement.userId, gameDownloadEntitlement.channel],
      set: {
        active: input.active,
        expiresAt,
        grantedBy: session.user.id,
        updatedAt: new Date(),
      },
    });

  return Response.json({ ok: true, userId: member.id, active: input.active });
}
