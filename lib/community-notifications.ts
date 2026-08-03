import "server-only";

import { getD1 } from "@/db";
import type { CommunityNotificationType } from "@/lib/community";

interface NotificationInput {
  userId: string;
  actorId: string;
  type: CommunityNotificationType;
  title: string;
  body: string;
  href?: string;
}

export async function createCommunityNotification(input: NotificationInput) {
  if (input.userId === input.actorId) return;
  await getD1()
    .prepare(
      `INSERT INTO community_notification
        (id, user_id, actor_id, type, title, body, href, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.actorId,
      input.type,
      input.title.slice(0, 100),
      input.body.replace(/\s+/g, " ").trim().slice(0, 240),
      input.href ?? "/community",
      Date.now(),
    )
    .run();
}
