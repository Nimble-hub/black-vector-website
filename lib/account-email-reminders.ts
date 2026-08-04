import "server-only";

import { getD1 } from "@/db";
import { EMAIL_REQUIRED_NOTICE_TITLE } from "@/lib/account-email";

export async function ensureContactEmailReminder(userId: string) {
  await getD1()
    .prepare(
      `INSERT OR IGNORE INTO community_notification
        (id, user_id, actor_id, type, title, body, href, read_at, created_at)
       VALUES (?, ?, NULL, 'direct-message', ?, ?, ?, NULL, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      EMAIL_REQUIRED_NOTICE_TITLE,
      "Add and verify a contact email so Black Vector can reach you about playtest waves, access windows, and important account notices.",
      "/account?email=required",
      Date.now(),
    )
    .run();
}
