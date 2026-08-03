import { getAuthEnvironment } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

export function GET() {
  const environment = getAuthEnvironment();
  return Response.json(
    {
      ready: environment.coreConfigured,
      providers: environment.providers,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
