import { count, desc, eq, like, or } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { communityStaffRole, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getCommunityRole } from "@/lib/community-permissions";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const assignmentInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["member", "moderator", "admin"]),
});

async function requireAdmin() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = await getCommunityRole(session.user.id);
  return role === "admin" ? session : null;
}

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session)
    return Response.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  const query =
    new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const db = getDb();
  const selection = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: communityStaffRole.role,
    })
    .from(user)
    .leftJoin(communityStaffRole, eq(communityStaffRole.userId, user.id));
  const users =
    query.length >= 2
      ? await selection
          .where(
            or(like(user.name, `%${query}%`), like(user.email, `%${query}%`)),
          )
          .orderBy(desc(user.createdAt))
          .limit(80)
      : await selection.orderBy(desc(user.createdAt)).limit(80);
  return Response.json({
    users: users.map((item) => ({ ...item, role: item.role ?? "member" })),
    currentUserId: session.user.id,
  });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await requireAdmin();
  if (!session)
    return Response.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  const parsed = assignmentInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Choose a valid member and role." },
      { status: 400 },
    );

  const db = getDb();
  const [target] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, parsed.data.userId))
    .limit(1);
  if (!target)
    return Response.json({ error: "Member not found." }, { status: 404 });
  const [existing] = await db
    .select({ role: communityStaffRole.role })
    .from(communityStaffRole)
    .where(eq(communityStaffRole.userId, parsed.data.userId))
    .limit(1);

  if (existing?.role === "admin" && parsed.data.role !== "admin") {
    const [adminCount] = await db
      .select({ value: count() })
      .from(communityStaffRole)
      .where(eq(communityStaffRole.role, "admin"));
    if ((adminCount?.value ?? 0) <= 1) {
      return Response.json(
        {
          error:
            "Assign another administrator before removing the final administrator.",
        },
        { status: 409 },
      );
    }
  }

  if (parsed.data.role === "member") {
    await db
      .delete(communityStaffRole)
      .where(eq(communityStaffRole.userId, parsed.data.userId));
  } else {
    const now = new Date();
    await db
      .insert(communityStaffRole)
      .values({
        userId: parsed.data.userId,
        role: parsed.data.role,
        assignedBy: session.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: communityStaffRole.userId,
        set: {
          role: parsed.data.role,
          assignedBy: session.user.id,
          updatedAt: now,
        },
      });
  }

  return Response.json({ user: { ...target, role: parsed.data.role } });
}
