import { getAuthEnvironment } from "./auth-environment";

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(getAuthEnvironment().baseURL).origin;
}
