import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-environment";

export async function GET() {
  const environment = getAuthEnvironment();
  const session = environment.coreConfigured
    ? await getAuth().api.getSession({ headers: await headers() })
    : null;

  if (session) {
    return Response.redirect(`${environment.baseURL}/#download`, 302);
  }

  const returnTo = encodeURIComponent("/#download");
  return Response.redirect(
    `${environment.baseURL}/register?returnTo=${returnTo}&intent=playtest`,
    302,
  );
}
