import { polygonArea, type BoosterCut, type CutPoint } from "./boosterCut";
import { multiply, transform } from "./boosterGeometry";
import type { getBoosterMotion } from "./boosterMotion";

export const BOOSTER_PAPER_CURL_DEPTH = .24;
export const BOOSTER_PAPER_RIPPLE_DEPTH = .012;
// The animated/rotated card's radius is below 1.81; its centre never goes below -.04.
export const BOOSTER_FRAGMENT_FRONT_LIMIT = -2.1;

export interface BoosterFragmentShape {
  center: CutPoint;
  hinge: CutPoint;
  normal: CutPoint;
  foldScale: number;
  radius: number;
  sign: number;
}

export function getBoosterFragmentShape(polygon: readonly CutPoint[], cut: BoosterCut, index: number): BoosterFragmentShape {
  const area = polygonArea(polygon);
  let x = 0, y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], weight = p.x * q.y - q.x * p.y;
    x += (p.x + q.x) * weight;
    y += (p.y + q.y) * weight;
  }
  const center = { x: (x / (6 * area) - .5) * 2.1, y: (y / (6 * area) - .5) * 3.45 };
  const hinge = cut.path.reduce((sum, point) => ({ x: sum.x + (point.x - .5) * 2.1 / cut.path.length, y: sum.y + (point.y - .5) * 3.45 / cut.path.length }), { x: 0, y: 0 });
  const reach = Math.max(...polygon.map((point) => Math.hypot((point.x - .5) * 2.1 - center.x, (point.y - .5) * 3.45 - center.y)));
  const foldScale = Math.max(.08, ...polygon.map((point) => Math.abs(((point.x - .5) * 2.1 - hinge.x) * cut.normal.x + ((point.y - .5) * 3.45 - hinge.y) * cut.normal.y)));
  // This sphere contains the pillow sheets, bounded curl and ripples in every orientation.
  const radius = Math.hypot(reach, .16 + BOOSTER_PAPER_CURL_DEPTH + BOOSTER_PAPER_RIPPLE_DEPTH);
  return { center, hinge, normal: cut.normal, foldScale, radius, sign: index === 0 ? 1 : -1 };
}

export function getBoosterFragmentPose(shape: BoosterFragmentShape, motion: ReturnType<typeof getBoosterMotion>, cameraDistance: number) {
  const { spread, drop, retreat } = motion;
  const { center, normal, sign } = shape;
  const fallDistance = cameraDistance * 2 * Math.tan(34 * Math.PI / 360) + 6;
  const depth = spread * .16 * (1 - retreat) + (BOOSTER_FRAGMENT_FRONT_LIMIT - shape.radius) * retreat;
  const x = center.x + sign * normal.x * spread * 1.65 + sign * drop * (.8 + Math.abs(normal.y) * .8);
  const y = center.y - .1 + sign * normal.y * spread * 1.65 - drop * fallDistance;
  const matrix = multiply(
    transform(x, y, depth, sign * (.28 * spread + 2.2 * drop), sign * (.4 * spread + 1.5 * drop), sign * (.2 * spread + 1.3 * drop)),
    transform(-center.x, -center.y),
  );
  return { matrix, depth };
}
