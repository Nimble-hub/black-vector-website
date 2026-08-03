import { z } from "zod";
import { getD1 } from "@/db";
import { getCommunitySession } from "@/lib/community-social";
import { isSameOriginRequest } from "@/lib/request-security";
import type {
  CommunityNotification,
  CommunityNotificationType,
} from "@/lib/community";

export const dynamic = "force-dynamic";

const updateInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), id: z.string().uuid() }),
  z.object({ action: z.literal("read-all") }),
]);

interface NotificationRow {
  id: string;
  type: CommunityNotificationType;
  title: string;
  body: string;
  href: string;
  actor_name: string | null;
  actor_image: string | null;
  read_at: number | null;
  created_at: number;
}

export async function GET() {
  const session = await getCommunitySession();
  if (!session) {
    return Response.json({ error: "Sign in to view notifications." }, { status: 401 });
  }
  const result = await getD1()
    .prepare(
      `SELECT n.id, n.type, n.title, n.body, n.href, n.read_at, n.created_at,
              actor.name AS actor_name, actor.image AS actor_image
       FROM community_notification n
       LEFT JOIN user actor ON actor.id = n.actor_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 60`,
    )
    .bind(session.user.id)
    .all<NotificationRow>();
  const notifications: CommunityNotification[] = result.results.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    actorName: row.actor_name,
    actorImage: row.actor_image,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
  return Response.json({
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
  });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getCommunitySession();
  if (!session) {
    return Response.json({ error: "Sign in to manage notifications." }, { status: 401 });
  }
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid notification change." }, { status: 400 });
  }
  const now = Date.now();
  if (parsed.data.action === "read-all") {
    await getD1()
      .prepare("UPDATE community_notification SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
      .bind(now, session.user.id)
      .run();
  } else {
    await getD1()
      .prepare("UPDATE community_notification SET read_at = ? WHERE id = ? AND user_id = ?")
      .bind(now, parsed.data.id, session.user.id)
      .run();
  }
  return Response.json({ updated: true, readAt: now });
}
