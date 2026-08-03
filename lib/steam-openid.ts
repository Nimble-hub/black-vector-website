const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_CLAIMED_ID = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function createSteamLoginURL(realm: string, returnTo: string) {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export async function verifySteamAssertion(requestUrl: string, expectedReturnTo: string) {
  const params = new URL(requestUrl).searchParams;
  if (params.get("openid.return_to") !== expectedReturnTo) {
    throw new Error("Steam return target mismatch.");
  }

  const claimedId = params.get("openid.claimed_id") || "";
  const match = STEAM_CLAIMED_ID.exec(claimedId);
  if (!match) throw new Error("Invalid Steam identity.");

  const verification = new URLSearchParams(params);
  verification.set("openid.mode", "check_authentication");
  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verification,
  });
  if (!response.ok || !(await response.text()).includes("is_valid:true")) {
    throw new Error("Steam identity verification failed.");
  }

  return match[1];
}
