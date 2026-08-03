import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

function unavailable() {
  return Response.json(
    { error: "Authentication is awaiting production configuration." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  if (!getAuthEnvironment().coreConfigured) return unavailable();
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  if (!getAuthEnvironment().coreConfigured) return unavailable();
  return toNextJsHandler(getAuth()).POST(request);
}
