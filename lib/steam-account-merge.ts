import "server-only";

import { z } from "zod";

const intentSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetUserId: z.string().uuid(),
  targetEmail: z.string().email(),
  callbackURL: z.string().min(1).max(500),
});

export type SteamAccountMergeIntent = z.infer<typeof intentSchema>;

function toBase64URL(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function createSteamAccountMergeToken(sourceUserId: string) {
  const random = crypto.getRandomValues(new Uint8Array(32));
  return `${sourceUserId}.${toBase64URL(random)}`;
}

export function sourceUserIdFromMergeToken(token: string) {
  const separator = token.indexOf(".");
  if (separator < 1) return null;
  const parsed = z.string().uuid().safeParse(token.slice(0, separator));
  return parsed.success ? parsed.data : null;
}

export async function hashSteamAccountMergeToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseSteamAccountMergeIntent(value: string) {
  try {
    const parsed = intentSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function steamAccountMergeIdentifier(sourceUserId: string) {
  return `steam-account-merge:${sourceUserId}`;
}
