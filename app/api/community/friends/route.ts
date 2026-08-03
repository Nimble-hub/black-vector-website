import { z } from "zod";
import { getD1 } from "@/db";
import {
  COMMUNITY_ONLINE_WINDOW_MS,
  getCommunitySession,
  orderedPair,
} from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";
import { createCommunityNotification } from "@/lib/community-notifications";

export const dynamic = "force-dynamic";

const requestInput = z.object({ targetUserId: z.string().uuid() });
const mutationInput = z.object({
  targetUserId: z.string().uuid(),
  action: z.enum(["accept", "decline", "cancel", "remove"]),
});

interface FriendRow {
  id: string;
  name: string;
  image: string | null;
  status: "pending" | "accepted";
  requested_by_id: string;
  last_seen_at: number | null;
  presence_status: "online" | "dnd" | "invisible" | null;
}

export async function GET() {
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to view friends." },
      { status: 401 },
    );
  const threshold = Date.now() - COMMUNITY_ONLINE_WINDOW_MS;
  const result = await getD1()
    .prepare(
      `
    SELECT
      other.id,
      other.name,
      other.image,
      f.status,
      f.requested_by_id,
      p.last_seen_at
      ,p.status AS presence_status
    FROM community_friendship f
    JOIN user other ON other.id = CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END
    LEFT JOIN community_presence p ON p.user_id = other.id
    WHERE f.user_low_id = ? OR f.user_high_id = ?
    ORDER BY f.updated_at DESC
  `,
    )
    .bind(session.user.id, session.user.id, session.user.id)
    .all<FriendRow>();

  const entries = result.results.map((row) => ({
    id: row.id,
    name: row.name,
    image: row.image,
    status: row.status,
    direction:
      row.requested_by_id === session.user.id ? "outgoing" : "incoming",
    online:
      (row.last_seen_at ?? 0) >= threshold &&
      row.presence_status !== "invisible",
    presenceStatus:
      (row.last_seen_at ?? 0) >= threshold &&
      row.presence_status !== "invisible"
        ? (row.presence_status ?? "online")
        : "offline",
  }));
  return Response.json({
    friends: entries.filter((item) => item.status === "accepted"),
    incoming: entries.filter(
      (item) => item.status === "pending" && item.direction === "incoming",
    ),
    outgoing: entries.filter(
      (item) => item.status === "pending" && item.direction === "outgoing",
    ),
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json({ error: "Sign in to add friends." }, { status: 401 });
  const parsed = requestInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.targetUserId === session.user.id) {
    return Response.json(
      { error: "Choose another registered member." },
      { status: 400 },
    );
  }
  const target = await getD1()
    .prepare("SELECT id FROM user WHERE id = ? LIMIT 1")
    .bind(parsed.data.targetUserId)
    .first();
  if (!target)
    return Response.json({ error: "Member not found." }, { status: 404 });
  const [low, high] = orderedPair(session.user.id, parsed.data.targetUserId);
  const existing = await getD1()
    .prepare(
      `
    SELECT status, requested_by_id FROM community_friendship
    WHERE user_low_id = ? AND user_high_id = ? LIMIT 1
  `,
    )
    .bind(low, high)
    .first<{ status: string; requested_by_id: string }>();
  if (existing?.status === "accepted")
    return Response.json(
      { error: "You are already friends." },
      { status: 409 },
    );
  if (existing?.requested_by_id === parsed.data.targetUserId)
    return Response.json(
      {
        error:
          "This member already sent you a request. Accept it from Friends.",
      },
      { status: 409 },
    );
  if (existing?.requested_by_id === session.user.id)
    return Response.json(
      { error: "Friend request already sent." },
      { status: 409 },
    );
  await getD1()
    .prepare(
      `
    INSERT INTO community_friendship (user_low_id, user_high_id, requested_by_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(user_low_id, user_high_id) DO UPDATE SET
      requested_by_id = excluded.requested_by_id,
      status = 'pending',
      updated_at = excluded.updated_at
  `,
    )
    .bind(low, high, session.user.id, Date.now(), Date.now())
    .run();
  await createCommunityNotification({
    userId: parsed.data.targetUserId,
    actorId: session.user.id,
    type: "friend-request",
    title: `${session.user.name} sent you a friend request`,
    body: "Open the Friends panel to accept or decline.",
    href: "/community?panel=friends",
  });
  return Response.json({ status: "pending" }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getCommunitySession();
  if (!session)
    return Response.json(
      { error: "Sign in to manage friends." },
      { status: 401 },
    );
  const parsed = mutationInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || parsed.data.targetUserId === session.user.id) {
    return Response.json(
      { error: "Invalid friendship change." },
      { status: 400 },
    );
  }
  const [low, high] = orderedPair(session.user.id, parsed.data.targetUserId);
  const record = await getD1()
    .prepare(
      `
    SELECT status, requested_by_id FROM community_friendship
    WHERE user_low_id = ? AND user_high_id = ? LIMIT 1
  `,
    )
    .bind(low, high)
    .first<{ status: "pending" | "accepted"; requested_by_id: string }>();
  if (!record)
    return Response.json({ error: "Friendship not found." }, { status: 404 });

  if (parsed.data.action === "accept") {
    if (
      record.status !== "pending" ||
      record.requested_by_id === session.user.id
    ) {
      return Response.json(
        { error: "This request cannot be accepted." },
        { status: 403 },
      );
    }
    await getD1()
      .prepare(
        `UPDATE community_friendship SET status = 'accepted', updated_at = ? WHERE user_low_id = ? AND user_high_id = ?`,
      )
      .bind(Date.now(), low, high)
      .run();
    await createCommunityNotification({
      userId: record.requested_by_id,
      actorId: session.user.id,
      type: "friend-accepted",
      title: `${session.user.name} accepted your friend request`,
      body: "You can now open a direct channel from the Friends panel.",
      href: "/community?panel=friends",
    });
    return Response.json({ status: "accepted" });
  }

  if (
    parsed.data.action === "cancel" &&
    record.requested_by_id !== session.user.id
  ) {
    return Response.json(
      { error: "Only the sender can cancel this request." },
      { status: 403 },
    );
  }
  if (
    parsed.data.action === "decline" &&
    record.requested_by_id === session.user.id
  ) {
    return Response.json(
      { error: "Only the recipient can decline this request." },
      { status: 403 },
    );
  }
  await getD1()
    .prepare(
      "DELETE FROM community_friendship WHERE user_low_id = ? AND user_high_id = ?",
    )
    .bind(low, high)
    .run();
  return Response.json({ removed: true });
}
