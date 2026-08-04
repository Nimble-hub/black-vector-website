import { headers } from "next/headers";
import { createEmailVerificationToken } from "better-auth/api";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { account, rateLimit, user, verification } from "@/db/schema";
import { safeInternalReturnTo } from "@/lib/account-email";
import { getAuth } from "@/lib/auth";
import { sendAuthEmail } from "@/lib/auth-email";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { isSteamSyntheticEmail } from "@/lib/display-name";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  createSteamAccountMergeToken,
  hashSteamAccountMergeToken,
  steamAccountMergeIdentifier,
} from "@/lib/steam-account-merge";

export const dynamic = "force-dynamic";

const input = z.object({
  newEmail: z.email().trim().toLowerCase(),
  callbackURL: z.string().max(500).optional(),
});

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 3;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSteamSyntheticEmail(session.user.email)) {
    return Response.json(
      { error: "Use the standard verified-email change flow." },
      { status: 409 },
    );
  }

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const db = getDb();
  const rateKey = `contact-email:${session.user.id}`;
  const now = Date.now();
  const [existingRate] = await db
    .select()
    .from(rateLimit)
    .where(eq(rateLimit.key, rateKey))
    .limit(1);
  const withinWindow = existingRate && now - existingRate.lastRequest < RATE_WINDOW_MS;
  if (withinWindow && existingRate.count >= RATE_LIMIT) {
    return Response.json(
      { error: "Too many verification requests. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  const nextCount = withinWindow ? existingRate.count + 1 : 1;
  if (existingRate) {
    await db
      .update(rateLimit)
      .set({ count: nextCount, lastRequest: now })
      .where(eq(rateLimit.id, existingRate.id));
  } else {
    await db.insert(rateLimit).values({
      id: crypto.randomUUID(),
      key: rateKey,
      count: 1,
      lastRequest: now,
    });
  }

  const [existingUser] = await db
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(sql`lower(${user.email}) = ${parsed.data.newEmail}`)
    .limit(1);
  if (existingUser) {
    const [steamIdentity] = await db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, session.user.id), eq(account.providerId, "steam")))
      .limit(1);
    if (!steamIdentity || !existingUser.emailVerified) {
      return Response.json(
        { error: "That address is unavailable. Try another email." },
        { status: 409 },
      );
    }

    const environment = getAuthEnvironment();
    const mergeToken = createSteamAccountMergeToken(session.user.id);
    const mergeIdentifier = steamAccountMergeIdentifier(session.user.id);
    const mergeURL = new URL("/account/merge-steam", environment.baseURL);
    mergeURL.searchParams.set("token", mergeToken);
    await db.delete(verification).where(eq(verification.identifier, mergeIdentifier));
    await db.insert(verification).values({
      id: crypto.randomUUID(),
      identifier: mergeIdentifier,
      value: JSON.stringify({
        tokenHash: await hashSteamAccountMergeToken(mergeToken),
        targetUserId: existingUser.id,
        targetEmail: existingUser.email,
        callbackURL: safeInternalReturnTo(parsed.data.callbackURL),
      }),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    try {
      await sendAuthEmail({
        to: existingUser.email,
        subject: "Approve your Steam connection to Black Vector",
        preheader: "Confirm that this Steam identity belongs to your existing Black Vector profile.",
        heading: "Connect Steam identity",
        message:
          "A Steam sign-in is waiting to join this existing Black Vector account. Approve the connection to keep one profile, one community identity, and every linked sign-in method together.",
        actionLabel: "APPROVE STEAM CONNECTION",
        actionUrl: mergeURL.toString(),
      });
    } catch (error) {
      await db.delete(verification).where(eq(verification.identifier, mergeIdentifier));
      console.error("Steam account merge approval email was rejected.", error);
      return Response.json(
        { error: "The mail provider rejected this request. Please try again shortly." },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, requiresMerge: true });
  }

  const environment = getAuthEnvironment();
  const token = await createEmailVerificationToken(
    environment.secret,
    session.user.email,
    parsed.data.newEmail,
    60 * 60,
    { requestType: "change-email-verification" },
  );
  const verificationURL = new URL("/api/auth/verify-email", environment.baseURL);
  verificationURL.searchParams.set("token", token);
  verificationURL.searchParams.set(
    "callbackURL",
    safeInternalReturnTo(parsed.data.callbackURL),
  );

  try {
    await sendAuthEmail({
      to: parsed.data.newEmail,
      subject: "Verify your Black Vector account",
      preheader: "Confirm your address to open the Black Vector access terminal.",
      heading: "Confirm your identity",
      message:
        "Confirm this email address to activate your account and protect any connected identities.",
      actionLabel: "VERIFY ACCOUNT",
      actionUrl: verificationURL.toString(),
    });
  } catch (error) {
    console.error("Contact email verification provider rejected the request.", error);
    return Response.json(
      { error: "The mail provider rejected this request. Please try again shortly." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
