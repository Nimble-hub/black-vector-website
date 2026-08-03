import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { getDb } from "@/db";
import { playtestProfile } from "@/db/schema";

export const dynamic = "force-dynamic";

const profileInput = z.object({
  callsign: z.string().trim().max(32).optional().default(""),
  preferredPlatform: z.enum(["windows", "linux", "mac"]),
  strategyExperience: z.enum(["new", "intermediate", "veteran"]),
  playtestOptIn: z.boolean(),
  developmentUpdatesOptIn: z.boolean(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = profileInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid profile settings." }, { status: 400 });
  }

  const now = new Date();
  await getDb()
    .insert(playtestProfile)
    .values({
      userId: session.user.id,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: playtestProfile.userId,
      set: { ...parsed.data, updatedAt: now },
    });

  return Response.json({ ok: true });
}
