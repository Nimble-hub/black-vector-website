export const HYPERSPACE_SOURCE_DURATION_MS = 16_500;
export const HYPERSPACE_DURATION_MS = 11_500;

// Preserve the authored charge/launch and braking/arrival beats while
// compressing only the steady cruise between them. The source timeline is
// still used by the shaders, so every established cue keeps its shape.
const CRUISE_COMPRESSION_START_MS = 7_000;
const EXIT_SEQUENCE_START_MS = HYPERSPACE_SOURCE_DURATION_MS * 0.84;
const EXIT_SEQUENCE_DURATION_MS =
  HYPERSPACE_SOURCE_DURATION_MS - EXIT_SEQUENCE_START_MS;
const COMPRESSED_EXIT_START_MS =
  HYPERSPACE_DURATION_MS - EXIT_SEQUENCE_DURATION_MS;

export function getHyperspaceTimelineElapsed(elapsedMs: number) {
  if (elapsedMs <= CRUISE_COMPRESSION_START_MS) return Math.max(0, elapsedMs);
  if (elapsedMs >= COMPRESSED_EXIT_START_MS) {
    return Math.min(
      HYPERSPACE_SOURCE_DURATION_MS,
      EXIT_SEQUENCE_START_MS + (elapsedMs - COMPRESSED_EXIT_START_MS),
    );
  }

  const cruiseProgress =
    (elapsedMs - CRUISE_COMPRESSION_START_MS) /
    (COMPRESSED_EXIT_START_MS - CRUISE_COMPRESSION_START_MS);
  return (
    CRUISE_COMPRESSION_START_MS +
    (EXIT_SEQUENCE_START_MS - CRUISE_COMPRESSION_START_MS) * cruiseProgress
  );
}

export function getHyperspaceProgress(elapsedMs: number) {
  return Math.min(
    1,
    getHyperspaceTimelineElapsed(elapsedMs) /
      HYPERSPACE_SOURCE_DURATION_MS,
  );
}
