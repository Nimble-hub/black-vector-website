import "server-only";

import { headers } from "next/headers";
import { getD1 } from "@/db";
import { getAuth } from "@/lib/auth";

export async function getCommunitySession() {
  return getAuth().api.getSession({ headers: await headers() });
}

export function orderedPair(first: string, second: string) {
  return first < second
    ? ([first, second] as const)
    : ([second, first] as const);
}

export async function requireClanMembership(clanId: string, userId: string) {
  return getD1()
    .prepare(
      "SELECT role FROM clan_member WHERE clan_id = ? AND user_id = ? LIMIT 1",
    )
    .bind(clanId, userId)
    .first<{ role: "owner" | "officer" | "member" }>();
}

export async function requireConversationMembership(
  conversationId: string,
  userId: string,
) {
  return getD1()
    .prepare(
      `
      SELECT id, user_low_id, user_high_id
      FROM direct_conversation
      WHERE id = ? AND (user_low_id = ? OR user_high_id = ?)
      LIMIT 1
    `,
    )
    .bind(conversationId, userId, userId)
    .first<{ id: string; user_low_id: string; user_high_id: string }>();
}
