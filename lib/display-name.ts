const CALLSIGN_PREFIXES = [
  "Azure",
  "Cobalt",
  "Copper",
  "Crimson",
  "Ember",
  "Iron",
  "Ivory",
  "Lunar",
  "Nova",
  "Obsidian",
  "Silent",
  "Silver",
  "Solar",
  "Storm",
  "Void",
] as const;

const CALLSIGN_NAMES = [
  "Aegis",
  "Atlas",
  "Aurora",
  "Beacon",
  "Comet",
  "Corsair",
  "Drifter",
  "Eclipse",
  "Halcyon",
  "Horizon",
  "Kestrel",
  "Nomad",
  "Orion",
  "Pulsar",
  "Raven",
  "Rook",
  "Sentinel",
  "Specter",
  "Talon",
  "Tempest",
  "Viper",
  "Wraith",
  "Zenith",
] as const;

export function createDefaultDisplayName() {
  const random = crypto.getRandomValues(new Uint16Array(3));
  const prefix = CALLSIGN_PREFIXES[random[0] % CALLSIGN_PREFIXES.length];
  const name = CALLSIGN_NAMES[random[1] % CALLSIGN_NAMES.length];
  const serial = 100 + (random[2] % 900);
  return `${prefix}-${name}-${serial}`;
}

export function isSteamSyntheticEmail(email: string) {
  return email.toLowerCase().endsWith("@steam.blackvector.invalid");
}
