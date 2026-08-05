import "server-only";

import { getD1 } from "@/db";

export const DISPLAY_NAME_REMINDER_TITLE = "Callsign required";
export const DISPLAY_NAME_REMINDER_HREF =
  "/account?display=required&returnTo=%2Fcommunity";

export async function ensureDisplayNameReminder(userId: string) {
  const now = Date.now();
  await getD1()
    .prepare(
      `INSERT INTO community_notification
        (id, user_id, actor_id, type, title, body, href, read_at, created_at)
       SELECT ?, ?, NULL, 'direct-message', ?, ?, ?, NULL, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM community_notification
         WHERE user_id = ? AND href = ?
       )`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      DISPLAY_NAME_REMINDER_TITLE,
      "Your temporary callsign is active. Choose a display name so other commanders know who they are speaking with in chat, forums, direct messages, and clans.",
      DISPLAY_NAME_REMINDER_HREF,
      now,
      userId,
      DISPLAY_NAME_REMINDER_HREF,
    )
    .run();
}

