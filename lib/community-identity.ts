import "server-only";

import { getD1 } from "@/db";

export interface PublicCommunityIdentity {
  name: string;
  image: string | null;
  displayNameSet: boolean;
}

export async function getPublicCommunityIdentity(
  userId: string,
  fallback: Pick<PublicCommunityIdentity, "name" | "image">,
): Promise<PublicCommunityIdentity> {
  const identity = await getD1()
    .prepare(
      "SELECT name, image, display_name_set FROM user WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<{
      name: string;
      image: string | null;
      display_name_set: number;
    }>();
  return identity
    ? {
        name: identity.name,
        image: identity.image,
        displayNameSet: Boolean(identity.display_name_set),
      }
    : { ...fallback, displayNameSet: false };
}
