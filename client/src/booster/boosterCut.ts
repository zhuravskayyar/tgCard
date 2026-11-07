/** 3D pack size in world units; the width follows the pack sprite's 560×766 proportions so the art is not squeezed. */
export const PACK_HEIGHT = 3.45;
export const PACK_WIDTH = PACK_HEIGHT * 560 / 766;

export interface CutPoint { x: number; y: number }
export interface BoosterCut {
  path: CutPoint[];
  pieces: [CutPoint[], CutPoint[]];
  center: CutPoint;
  normal: CutPoint;
}
export type CutResult = { ok: true; cut: BoosterCut } | { ok: false; message: string };
const EPSILON = 1e-6;
const distance = (a: CutPoint, b: CutPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: CutPoint, b: CutPoint, c: CutPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function polygonArea(points: readonly CutPoint[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function nearestBoundary(point: CutPoint): CutPoint {
  const x = Math.max(0, Math.min(1, point.x)), y = Math.max(0, Math.min(1, point.y));
  const gaps = [x, 1 - x, y, 1 - y];
  const edge = gaps.indexOf(Math.min(...gaps));
  return edge === 0 ? { x: 0, y } : edge === 1 ? { x: 1, y } : edge === 2 ? { x, y: 0 } : { x, y: 1 };
}

/** Liang–Barsky clipping keeps the actual entry/exit of a stroke through the wrapper. */
function clipSegment(a: CutPoint, b: CutPoint): [CutPoint, CutPoint] | null {
  let start = 0, end = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy], q = [a.x, 1 - a.x, a.y, 1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPSILON) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
    if (start > end) return null;
  }
  return [{ x: a.x + start * dx, y: a.y + start * dy }, { x: a.x + end * dx, y: a.y + end * dy }];
}

function simplify(points: CutPoint[], tolerance = .006): CutPoint[] {
  if (points.length <= 2) return points;
  const first = points[0], last = points[points.length - 1];
  const dx = last.x - first.x, dy = last.y - first.y, lengthSquared = dx * dx + dy * dy;
  let largest = 0, split = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((points[i].x - first.x) * dx + (points[i].y - first.y) * dy) / lengthSquared)) : 0;
    const gap = distance(points[i], { x: first.x + t * dx, y: first.y + t * dy });
    if (gap > largest) { largest = gap; split = i; }
  }
  return largest > tolerance ? [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)] : [first, last];
}

function intersects(a: CutPoint, b: CutPoint, c: CutPoint, d: CutPoint) {
  const overlaps = Math.max(a.x, b.x) + EPSILON >= Math.min(c.x, d.x) && Math.max(c.x, d.x) + EPSILON >= Math.min(a.x, b.x)
    && Math.max(a.y, b.y) + EPSILON >= Math.min(c.y, d.y) && Math.max(c.y, d.y) + EPSILON >= Math.min(a.y, b.y);
  return overlaps && cross(a, b, c) * cross(a, b, d) <= EPSILON && cross(c, d, a) * cross(c, d, b) <= EPSILON;
}

function boundaryPosition(point: CutPoint) {
  if (point.y < EPSILON) return point.x;
  if (point.x > 1 - EPSILON) return 1 + point.y;
  if (point.y > 1 - EPSILON) return 3 - point.x;
  return 4 - point.y;
}

function closeAlongBoundary(path: CutPoint[]): CutPoint[] {
  const first = path[0], last = path[path.length - 1];
  const start = boundaryPosition(last);
  let end = boundaryPosition(first);
  if (end <= start + EPSILON) end += 4;
  const corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const result = [...path];
  for (let i = Math.floor(start + EPSILON) + 1; i < end - EPSILON; i++) result.push(corners[i % 4]);
  return result;
}

function centroid(polygon: CutPoint[]) {
  let x = 0, y = 0;
  const area = polygonArea(polygon);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], weight = p.x * q.y - q.x * p.y;
    x += (p.x + q.x) * weight;
    y += (p.y + q.y) * weight;
  }
  return { x: x / (6 * area), y: y / (6 * area) };
}

export function prepareBoosterCut(stroke: readonly CutPoint[]): CutResult {
  const invalid = (message = "Спробуй один плавний розріз по обгортці."): CutResult => ({ ok: false, message });
  const points = stroke.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .filter((point, index, all) => index === 0 || distance(point, all[index - 1]) > .002).map((point) => ({ ...point }));
  if (points.length < 2) return invalid();
  for (const index of [0, points.length - 1]) {
    const boundary = nearestBoundary(points[index]);
    if (distance(points[index], boundary) < .065) points[index] = boundary;
  }
  const path: CutPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const clipped = clipSegment(points[i - 1], points[i]);
    if (!clipped || distance(...clipped) < EPSILON) continue;
    if (!path.length) path.push(clipped[0]);
    else if (distance(path[path.length - 1], clipped[0]) > .003) break;
    if (distance(path[path.length - 1], clipped[1]) > EPSILON) path.push(clipped[1]);
    if (distance(clipped[1], points[i]) > EPSILON) break;
  }
  if (path.length < 2 || distance(path[0], nearestBoundary(path[0])) > .001 || distance(path[path.length - 1], nearestBoundary(path[path.length - 1])) > .001) return invalid();
  let simplified = simplify(path);
  // Bound geometry cost while preserving the curve rather than replacing it with a straight cut.
  if (simplified.length > 32) simplified = Array.from({ length: 32 }, (_, index) => simplified[Math.round(index / 31 * (simplified.length - 1))]);
  for (let i = 1; i < simplified.length; i++) {
    for (let j = i + 2; j < simplified.length; j++) {
      if (intersects(simplified[i - 1], simplified[i], simplified[j - 1], simplified[j])) return invalid("Спробуй один плавний розріз без петель.");
    }
  }
  const pieces: [CutPoint[], CutPoint[]] = [closeAlongBoundary(simplified), closeAlongBoundary([...simplified].reverse())];
  if (pieces.some((piece) => Math.abs(polygonArea(piece)) < .018)) return invalid("Зачепи трохи більше обгортки, щоб розкрити пакунок.");
  const a = centroid(pieces[0]), b = centroid(pieces[1]);
  const dx = (a.x - b.x) * PACK_WIDTH, dy = (a.y - b.y) * PACK_HEIGHT, length = Math.hypot(dx, dy);
  return { ok: true, cut: { path: simplified, pieces, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, normal: { x: dx / length, y: dy / length } } };
}

/** Ear clipping handles both convex and curved, concave pieces without extra dependencies. */
export function triangulateCutPolygon(polygon: readonly CutPoint[]): number[] {
  const remaining = polygon.map((_, index) => index);
  if (polygonArea(polygon) < 0) remaining.reverse();
  const result: number[] = [];
  let attempts = polygon.length * polygon.length;
  while (remaining.length > 3 && attempts-- > 0) {
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length], b = remaining[i], c = remaining[(i + 1) % remaining.length];
      if (cross(polygon[a], polygon[b], polygon[c]) <= EPSILON) continue;
      const occupied = remaining.some((index) => index !== a && index !== b && index !== c
        && cross(polygon[a], polygon[b], polygon[index]) >= -EPSILON && cross(polygon[b], polygon[c], polygon[index]) >= -EPSILON && cross(polygon[c], polygon[a], polygon[index]) >= -EPSILON);
      if (occupied) continue;
      result.push(a, b, c);
      remaining.splice(i, 1);
      found = true;
      break;
    }
    if (!found) throw new Error("Не вдалося розділити обгортку за цією лінією. Спробуй плавніший розріз.");
  }
  if (remaining.length === 3) result.push(...remaining);
  return result;
}
