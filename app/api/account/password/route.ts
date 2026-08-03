import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { isSameOriginRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  newPassword: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  if (!getAuthEnvironment().providers.manual) {
    return Response.json({ error: "Manual sign-in is not configured." }, { status: 503 });
  }

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.emailVerified || session.user.email.endsWith(".invalid")) {
    return Response.json({ error: "Verify a deliverable email before adding a password." }, { status: 409 });
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Use an access key between 12 and 128 characters." }, { status: 400 });
  }

  try {
    await auth.api.setPassword({
      headers: requestHeaders,
      body: { newPassword: parsed.data.newPassword },
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Manual sign-in could not be activated." }, { status: 400 });
  }
}
