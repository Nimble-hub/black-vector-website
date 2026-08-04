import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import {
  hasVerifiedContactEmail,
  safeInternalReturnTo,
} from "@/lib/account-email";
import { ensureContactEmailReminder } from "@/lib/account-email-reminders";
import { getD1 } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeInternalReturnTo(url.searchParams.get("returnTo"));
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("returnTo", returnTo);
    return Response.redirect(login);
  }

  if (!hasVerifiedContactEmail(session.user)) {
    await ensureContactEmailReminder(session.user.id);
    const account = new URL("/account", url.origin);
    account.searchParams.set("email", "required");
    account.searchParams.set("returnTo", returnTo);
    return Response.redirect(account);
  }

  const identity = await getD1()
    .prepare("SELECT display_name_set FROM user WHERE id = ? LIMIT 1")
    .bind(session.user.id)
    .first<{ display_name_set: number }>();
  if (!identity?.display_name_set) {
    const account = new URL("/account", url.origin);
    account.searchParams.set("display", "required");
    account.searchParams.set("returnTo", returnTo);
    return Response.redirect(account);
  }

  return Response.redirect(new URL(returnTo, url.origin));
}
