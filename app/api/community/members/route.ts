import { getD1 } from "@/db";
import {
  COMMUNITY_ONLINE_WINDOW_MS,
  getCommunitySession,
} from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

interface MemberRow {
  id: string;
  name: string;
  image: string | null;
  role: "member" | "moderator" | "admin";
  last_seen_at: number | null;
}

export async function GET() {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to view the crew roster." },
      { status: 401 },
    );

  const onlineThreshold = Date.now() - COMMUNITY_ONLINE_WINDOW_MS;
  const result = await getD1()
    .prepare(
      `
    SELECT
      u.id,
      u.name,
      u.image,
      COALESCE(sr.role, 'member') AS role,
      p.last_seen_at
    FROM user u
    LEFT JOIN community_staff_role sr ON sr.user_id = u.id
    LEFT JOIN community_presence p ON p.user_id = u.id
    WHERE u.id != ?
    ORDER BY
      CASE WHEN p.last_seen_at >= ? THEN 0 ELSE 1 END,
      p.last_seen_at DESC,
      u.name COLLATE NOCASE ASC
    LIMIT 120
  `,
    )
    .bind(session.user.id, onlineThreshold)
    .all<MemberRow>();

  return Response.json({
    members: result.results.map((member) => ({
      id: member.id,
      name: member.name,
      image: member.image,
      role: member.role,
      online: (member.last_seen_at ?? 0) >= onlineThreshold,
      lastSeenAt: member.last_seen_at,
    })),
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to join the roster." },
      { status: 401 },
    );
  const now = Date.now();
  await getD1()
    .prepare(
      `
    INSERT INTO community_presence (user_id, last_seen_at)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
  `,
    )
    .bind(session.user.id, now)
    .run();
  return Response.json({ online: true, lastSeenAt: now });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to leave the roster." },
      { status: 401 },
    );
  await getD1()
    .prepare("UPDATE community_presence SET last_seen_at = 0 WHERE user_id = ?")
    .bind(session.user.id)
    .run();
  return Response.json({ online: false });
}
