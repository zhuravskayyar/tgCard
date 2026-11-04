export interface MapPoint {
  x: number;
  y: number;
}

/** Map sprite proportions: the trail uses a 100-wide coordinate space. */
export const MAP_HEIGHT = 203.6;

/* Stops follow the empty corridor painted on the map, bottom to top. */
const START: MapPoint = { x: 50, y: 193 };
const STOPS: readonly MapPoint[] = [
  { x: 48, y: 169 },
  { x: 56, y: 147 },
  { x: 49, y: 126 },
  { x: 58, y: 104 },
  { x: 47, y: 82 },
  { x: 59, y: 59 },
  { x: 49, y: 36 },
];
const SAMPLES_PER_SEGMENT = 14;

export function getMapStops(count: number): MapPoint[] {
  if (count <= STOPS.length) return STOPS.slice(STOPS.length - count);
  return Array.from({ length: count }, (_, index) => STOPS[Math.round(index / (count - 1) * (STOPS.length - 1))]!);
}

function catmullRom(p0: MapPoint, p1: MapPoint, p2: MapPoint, p3: MapPoint, t: number): MapPoint {
  const interpolate = (a: number, b: number, c: number, d: number) => 0.5 * (
    2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t
  );
  return { x: interpolate(p0.x, p1.x, p2.x, p3.x), y: interpolate(p0.y, p1.y, p2.y, p3.y) };
}

/** Smooth trail through the start and every stop; each segment has the same sample count. */
export function buildTrail(stops: readonly MapPoint[]): MapPoint[] {
  const points = [START, ...stops];
  const trail: MapPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[Math.min(points.length - 1, index + 2)]!;
    for (let sample = 0; sample < SAMPLES_PER_SEGMENT; sample += 1) trail.push(catmullRom(p0, p1, p2, p3, sample / SAMPLES_PER_SEGMENT));
  }
  trail.push(points[points.length - 1]!);
  return trail;
}

/** The walked part of the trail for a diamond total, ending exactly at the current position. */
export function walkTrail(trail: readonly MapPoint[], thresholds: readonly number[], diamonds: number): MapPoint[] {
  let segment = thresholds.length;
  let fraction = 0;
  let previous = 0;
  for (let index = 0; index < thresholds.length; index += 1) {
    const threshold = thresholds[index]!;
    if (diamonds < threshold) {
      segment = index;
      fraction = (diamonds - previous) / (threshold - previous);
      break;
    }
    previous = threshold;
  }
  const position = Math.min(trail.length - 1, segment * SAMPLES_PER_SEGMENT + fraction * SAMPLES_PER_SEGMENT);
  const whole = Math.floor(position);
  const walked = trail.slice(0, whole + 1);
  const from = trail[whole]!;
  const to = trail[Math.min(trail.length - 1, whole + 1)]!;
  const rest = position - whole;
  if (rest > 0) walked.push({ x: from.x + (to.x - from.x) * rest, y: from.y + (to.y - from.y) * rest });
  return walked;
}

export function toSvgPoints(points: readonly MapPoint[]) {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}
