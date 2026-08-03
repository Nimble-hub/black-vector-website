import { getD1 } from "@/db";
import { z } from "zod";
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
  presence_status: "online" | "dnd" | "invisible" | null;
}

const statusInput = z.object({
  status: z.enum(["online", "dnd", "invisible"]),
});

export async function GET() {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to view the crew roster." },
      { status: 401 },
    );

  const onlineThreshold = Date.now() - COMMUNITY_ONLINE_WINDOW_MS;
  const selfPresence = await getD1()
    .prepare("SELECT status FROM community_presence WHERE user_id = ? LIMIT 1")
    .bind(session.user.id)
    .first<{ status: "online" | "dnd" | "invisible" }>();
  const result = await getD1()
    .prepare(
      `
    SELECT
      u.id,
      u.name,
      u.image,
      COALESCE(sr.role, 'member') AS role,
      p.last_seen_at
      ,p.status AS presence_status
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
    selfStatus: selfPresence?.status ?? "online",
    members: result.results.map((member) => ({
      id: member.id,
      name: member.name,
      image: member.image,
      role: member.role,
      online:
        (member.last_seen_at ?? 0) >= onlineThreshold &&
        member.presence_status !== "invisible",
      presenceStatus:
        (member.last_seen_at ?? 0) >= onlineThreshold &&
        member.presence_status !== "invisible"
          ? (member.presence_status ?? "online")
          : "offline",
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
    INSERT INTO community_presence (user_id, last_seen_at, status)
    VALUES (?, ?, 'online')
    ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
  `,
    )
    .bind(session.user.id, now)
    .run();
  return Response.json({ online: true, lastSeenAt: now });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to set your status." },
      { status: 401 },
    );
  const parsed = statusInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Choose a valid presence status." },
      { status: 400 },
    );
  const lastSeenAt = parsed.data.status === "invisible" ? 0 : Date.now();
  await getD1()
    .prepare(
      `
      INSERT INTO community_presence (user_id, last_seen_at, status)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        status = excluded.status
    `,
    )
    .bind(session.user.id, lastSeenAt, parsed.data.status)
    .run();
  return Response.json({ status: parsed.data.status, lastSeenAt });
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
