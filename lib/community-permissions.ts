import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { communityStaffRole } from "@/db/schema";
import type { CommunityRole } from "@/lib/community";

export function canModerate(role: CommunityRole) {
  return role === "moderator" || role === "admin";
}

export async function getCommunityRole(userId: string): Promise<CommunityRole> {
  const [record] = await getDb()
    .select({ role: communityStaffRole.role })
    .from(communityStaffRole)
    .where(eq(communityStaffRole.userId, userId))
    .limit(1);
  return record?.role ?? "member";
}
