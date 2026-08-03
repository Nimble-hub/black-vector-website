import { z } from "zod";
import { getD1 } from "@/db";
import {
  getCommunitySession,
  requireClanMembership,
} from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const actionInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(3).max(40),
    tag: z
      .string()
      .trim()
      .min(2)
      .max(6)
      .regex(/^[A-Za-z0-9]+$/),
    description: z.string().trim().min(10).max(500),
  }),
  z.object({ action: z.literal("join"), clanId: z.string().uuid() }),
  z.object({ action: z.literal("leave"), clanId: z.string().uuid() }),
]);

interface ClanRow {
  id: string;
  name: string;
  tag: string;
  description: string;
  owner_id: string;
  member_count: number;
  member_role: "owner" | "officer" | "member" | null;
}

export async function GET() {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to access clan operations." },
      { status: 401 },
    );
  const rows = await getD1()
    .prepare(
      `
    SELECT
      c.id,
      c.name,
      c.tag,
      c.description,
      c.owner_id,
      COUNT(all_members.user_id) AS member_count,
      mine.role AS member_role
    FROM clan c
    LEFT JOIN clan_member all_members ON all_members.clan_id = c.id
    LEFT JOIN clan_member mine ON mine.clan_id = c.id AND mine.user_id = ?
    GROUP BY c.id
    ORDER BY CASE WHEN mine.user_id IS NULL THEN 1 ELSE 0 END, c.updated_at DESC, c.name COLLATE NOCASE ASC
    LIMIT 80
  `,
    )
    .bind(session.user.id)
    .all<ClanRow>();
  const clans = rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    tag: row.tag,
    description: row.description,
    ownerId: row.owner_id,
    memberCount: Number(row.member_count),
    memberRole: row.member_role,
  }));
  return Response.json({
    clans: clans.filter((item) => item.memberRole),
    discover: clans.filter((item) => !item.memberRole),
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to manage clans." },
      { status: 401 },
    );
  const parsed = actionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Check the clan name, tag, and description." },
      { status: 400 },
    );
  const d1 = getD1();
  const now = Date.now();

  if (parsed.data.action === "create") {
    const id = crypto.randomUUID();
    try {
      await d1.batch([
        d1
          .prepare(
            `
          INSERT INTO clan (id, name, tag, description, owner_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .bind(
            id,
            parsed.data.name,
            parsed.data.tag.toUpperCase(),
            parsed.data.description,
            session.user.id,
            now,
            now,
          ),
        d1
          .prepare(
            `
          INSERT INTO clan_member (clan_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)
        `,
          )
          .bind(id, session.user.id, now),
      ]);
    } catch {
      return Response.json(
        { error: "That clan name or tag is already in service." },
        { status: 409 },
      );
    }
    return Response.json(
      {
        clan: {
          id,
          ...parsed.data,
          tag: parsed.data.tag.toUpperCase(),
          ownerId: session.user.id,
          memberCount: 1,
          memberRole: "owner",
        },
      },
      { status: 201 },
    );
  }

  const clan = await d1
    .prepare("SELECT id, owner_id FROM clan WHERE id = ? LIMIT 1")
    .bind(parsed.data.clanId)
    .first<{ id: string; owner_id: string }>();
  if (!clan)
    return Response.json({ error: "Clan not found." }, { status: 404 });
  if (parsed.data.action === "join") {
    await d1
      .prepare(
        `
      INSERT INTO clan_member (clan_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', ?)
      ON CONFLICT(clan_id, user_id) DO NOTHING
    `,
      )
      .bind(clan.id, session.user.id, now)
      .run();
    return Response.json({ joined: true });
  }
  const membership = await requireClanMembership(clan.id, session.user.id);
  if (!membership)
    return Response.json(
      { error: "You are not a member of this clan." },
      { status: 404 },
    );
  if (membership.role === "owner")
    return Response.json(
      { error: "Transfer clan command before leaving." },
      { status: 409 },
    );
  await d1
    .prepare("DELETE FROM clan_member WHERE clan_id = ? AND user_id = ?")
    .bind(clan.id, session.user.id)
    .run();
  return Response.json({ left: true });
}
