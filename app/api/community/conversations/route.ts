import { z } from "zod";
import { getD1 } from "@/db";
import {
  COMMUNITY_ONLINE_WINDOW_MS,
  getCommunitySession,
  orderedPair,
} from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const createInput = z.object({ targetUserId: z.string().uuid() });

interface ConversationRow {
  id: string;
  updated_at: number;
  member_id: string;
  member_name: string;
  member_image: string | null;
  last_seen_at: number | null;
  presence_status: "online" | "dnd" | "invisible" | null;
}

export async function GET() {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to view direct comms." },
      { status: 401 },
    );
  const onlineThreshold = Date.now() - COMMUNITY_ONLINE_WINDOW_MS;
  const rows = await getD1()
    .prepare(
      `
    SELECT
      c.id,
      c.updated_at,
      other.id AS member_id,
      other.name AS member_name,
      other.image AS member_image,
      p.last_seen_at
      ,p.status AS presence_status
    FROM direct_conversation c
    JOIN user other ON other.id = CASE WHEN c.user_low_id = ? THEN c.user_high_id ELSE c.user_low_id END
    LEFT JOIN community_presence p ON p.user_id = other.id
    WHERE c.user_low_id = ? OR c.user_high_id = ?
    ORDER BY c.updated_at DESC
    LIMIT 80
  `,
    )
    .bind(session.user.id, session.user.id, session.user.id)
    .all<ConversationRow>();
  return Response.json({
    conversations: rows.results.map((row) => ({
      id: row.id,
      updatedAt: row.updated_at,
      member: {
        id: row.member_id,
        name: row.member_name,
        image: row.member_image,
        online:
          (row.last_seen_at ?? 0) >= onlineThreshold &&
          row.presence_status !== "invisible",
        presenceStatus:
          (row.last_seen_at ?? 0) >= onlineThreshold &&
          row.presence_status !== "invisible"
            ? (row.presence_status ?? "online")
            : "offline",
      },
    })),
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to open direct comms." },
      { status: 401 },
    );
  const parsed = createInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.targetUserId === session.user.id) {
    return Response.json(
      { error: "Choose another registered member." },
      { status: 400 },
    );
  }
  const member = await getD1()
    .prepare("SELECT id, name, image FROM user WHERE id = ? LIMIT 1")
    .bind(parsed.data.targetUserId)
    .first<{ id: string; name: string; image: string | null }>();
  if (!member)
    return Response.json({ error: "Member not found." }, { status: 404 });
  const [low, high] = orderedPair(session.user.id, member.id);
  const existing = await getD1()
    .prepare(
      `
    SELECT id FROM direct_conversation WHERE user_low_id = ? AND user_high_id = ? LIMIT 1
  `,
    )
    .bind(low, high)
    .first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  const now = Date.now();
  if (!existing) {
    await getD1()
      .prepare(
        `
      INSERT INTO direct_conversation (id, user_low_id, user_high_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .bind(id, low, high, now, now)
      .run();
  }
  return Response.json(
    { conversation: { id, updatedAt: now, member } },
    { status: existing ? 200 : 201 },
  );
}
