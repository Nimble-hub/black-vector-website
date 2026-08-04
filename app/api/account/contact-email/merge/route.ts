import { getD1 } from "@/db";
import { safeInternalReturnTo } from "@/lib/account-email";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { isSteamSyntheticEmail } from "@/lib/display-name";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  constantTimeEqual,
  hashSteamAccountMergeToken,
  parseSteamAccountMergeIntent,
  sourceUserIdFromMergeToken,
  steamAccountMergeIdentifier,
} from "@/lib/steam-account-merge";

export const dynamic = "force-dynamic";

function mergeFailure(message: string) {
  const url = new URL("/account", getAuthEnvironment().baseURL);
  url.searchParams.set("connection", message);
  return Response.redirect(url, 302);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return mergeFailure("steam-merge-invalid");
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  const sourceUserId = sourceUserIdFromMergeToken(token);
  if (!sourceUserId) return mergeFailure("steam-merge-invalid");

  const d1 = getD1();
  const identifier = steamAccountMergeIdentifier(sourceUserId);
  const pending = await d1
    .prepare("SELECT id, value, expires_at FROM verification WHERE identifier = ? LIMIT 1")
    .bind(identifier)
    .first<{ id: string; value: string; expires_at: number }>();
  const intent = pending ? parseSteamAccountMergeIntent(pending.value) : null;
  if (!pending || !intent || pending.expires_at < Date.now()) {
    if (pending) await d1.prepare("DELETE FROM verification WHERE id = ?").bind(pending.id).run();
    return mergeFailure("steam-merge-expired");
  }

  const tokenHash = await hashSteamAccountMergeToken(token);
  if (!constantTimeEqual(tokenHash, intent.tokenHash)) {
    return mergeFailure("steam-merge-invalid");
  }

  const [sourceUser, targetUser, steamIdentity] = await Promise.all([
    d1.prepare(
      "SELECT id, name, email, image, steam_id, display_name_set FROM user WHERE id = ? LIMIT 1",
    ).bind(sourceUserId).first<{
      id: string;
      name: string;
      email: string;
      image: string | null;
      steam_id: string | null;
      display_name_set: number;
    }>(),
    d1.prepare(
      "SELECT id, email, steam_id FROM user WHERE id = ? AND lower(email) = lower(?) AND email_verified = 1 LIMIT 1",
    ).bind(intent.targetUserId, intent.targetEmail).first<{
      id: string;
      email: string;
      steam_id: string | null;
    }>(),
    d1.prepare(
      "SELECT id FROM account WHERE user_id = ? AND provider_id = 'steam' LIMIT 1",
    ).bind(sourceUserId).first<{ id: string }>(),
  ]);

  if (
    !sourceUser ||
    !targetUser ||
    !steamIdentity ||
    !isSteamSyntheticEmail(sourceUser.email) ||
    sourceUser.id === targetUser.id ||
    (targetUser.steam_id !== null && targetUser.steam_id !== sourceUser.steam_id)
  ) {
    return mergeFailure("steam-merge-invalid");
  }

  const now = Date.now();
  try {
    await d1.batch([
      d1.prepare(
        `INSERT OR IGNORE INTO playtest_profile
          (user_id, callsign, preferred_platform, strategy_experience, playtest_opt_in,
           development_updates_opt_in, created_at, updated_at)
         SELECT ?, callsign, preferred_platform, strategy_experience, playtest_opt_in,
           development_updates_opt_in, created_at, ?
         FROM playtest_profile WHERE user_id = ?`,
      ).bind(targetUser.id, now, sourceUser.id),
      d1.prepare("UPDATE account SET user_id = ?, updated_at = ? WHERE user_id = ?")
        .bind(targetUser.id, now, sourceUser.id),
      d1.prepare("UPDATE session SET user_id = ?, updated_at = ? WHERE user_id = ?")
        .bind(targetUser.id, now, sourceUser.id),
      d1.prepare(
        `UPDATE user SET
          steam_id = ?,
          name = CASE WHEN display_name_set = 0 THEN ? ELSE name END,
          display_name_set = CASE WHEN display_name_set = 0 THEN ? ELSE display_name_set END,
          image = COALESCE(image, ?),
          updated_at = ?
         WHERE id = ?`,
      ).bind(
        sourceUser.steam_id,
        sourceUser.name,
        sourceUser.display_name_set,
        sourceUser.image,
        now,
        targetUser.id,
      ),
      d1.prepare("DELETE FROM verification WHERE id = ?").bind(pending.id),
      d1.prepare("DELETE FROM user WHERE id = ?").bind(sourceUser.id),
    ]);
  } catch (error) {
    console.error("Steam account merge failed.", error);
    return mergeFailure("steam-merge-failed");
  }

  const destination = safeInternalReturnTo(intent.callbackURL);
  const response = Response.redirect(
    new URL(destination, getAuthEnvironment().baseURL),
    302,
  );
  const secure = getAuthEnvironment().baseURL.startsWith("https://");
  const prefix = secure ? "__Secure-" : "";
  for (const name of ["session_data", "account_data"]) {
    response.headers.append(
      "Set-Cookie",
      `${prefix}better-auth.${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
    );
  }
  return response;
}
