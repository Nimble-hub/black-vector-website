export const DEFAULT_DISPLAY_NAME_PREFIX = "Vector";

export function createDefaultDisplayName() {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `${DEFAULT_DISPLAY_NAME_PREFIX}-${suffix}`;
}

export function isSteamSyntheticEmail(email: string) {
  return email.toLowerCase().endsWith("@steam.blackvector.invalid");
}
