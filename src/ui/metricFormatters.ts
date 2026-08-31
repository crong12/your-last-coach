export function formatPaceSeconds(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function formatPacePerKm(seconds: number): string {
  return `${formatPaceSeconds(seconds)}/km`;
}

export function formatDurationSeconds(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatDistanceKm(distanceKm: number, decimals = 1): string {
  return `${Number.isInteger(distanceKm) ? distanceKm : distanceKm.toFixed(decimals)} km`;
}

export function formatHeartRateBpm(heartRateBpm: number): string {
  return `${Math.round(heartRateBpm)} bpm`;
}
