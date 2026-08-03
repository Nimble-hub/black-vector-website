import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

function unavailable() {
  return Response.json(
    { error: "Authentication is awaiting production configuration." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  if (!getAuthEnvironment().coreConfigured) return unavailable();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  if (!getAuthEnvironment().coreConfigured) return unavailable();
  return handlers.POST(request);
}
