import { getD1 } from "@/db";
import {
  COMMUNITY_ONLINE_WINDOW_MS,
  getCommunitySession,
  requireClanMembership,
} from "@/lib/community-social";

export const dynamic = "force-dynamic";

interface ClanMemberRow {
  id: string;
  name: string;
  image: string | null;
  role: "owner" | "officer" | "member";
  last_seen_at: number | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clanId: string }> },
) {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to access clan operations." },
      { status: 401 },
    );
  const { clanId } = await params;
  const membership = await requireClanMembership(clanId, session.user.id);
  if (!membership)
    return Response.json({ error: "Clan access required." }, { status: 403 });
  const d1 = getD1();
  const clan = await d1
    .prepare(
      `
    SELECT id, name, tag, description, owner_id FROM clan WHERE id = ? LIMIT 1
  `,
    )
    .bind(clanId)
    .first<{
      id: string;
      name: string;
      tag: string;
      description: string;
      owner_id: string;
    }>();
  if (!clan)
    return Response.json({ error: "Clan not found." }, { status: 404 });
  const rows = await d1
    .prepare(
      `
    SELECT u.id, u.name, u.image, cm.role, p.last_seen_at
    FROM clan_member cm
    JOIN user u ON u.id = cm.user_id
    LEFT JOIN community_presence p ON p.user_id = u.id
    WHERE cm.clan_id = ?
    ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, u.name COLLATE NOCASE ASC
  `,
    )
    .bind(clanId)
    .all<ClanMemberRow>();
  const threshold = Date.now() - COMMUNITY_ONLINE_WINDOW_MS;
  return Response.json({
    clan: {
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      description: clan.description,
      ownerId: clan.owner_id,
      memberRole: membership.role,
    },
    members: rows.results.map((member) => ({
      id: member.id,
      name: member.name,
      image: member.image,
      role: member.role,
      online: (member.last_seen_at ?? 0) >= threshold,
    })),
  });
}
