import { PACK_HEIGHT, PACK_WIDTH, polygonArea, triangulateCutPolygon, type CutPoint } from "./boosterCut";

export interface BoosterMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

// Exaggerated slightly so the card's paper edge remains visible at phone size.
const CARD_HALF_DEPTH = 0.03;

export function foilSurface(u: number, v: number, back = false): [number, number, number] {
  const x = (u - .5) * PACK_WIDTH, y = (v - .5) * PACK_HEIGHT;
  const sealed = Math.abs(y) > 1.49;
  const pillow = .12 * Math.pow(Math.max(0, Math.sin(v * Math.PI)), .65) * Math.max(0, 1 - Math.pow(x / (PACK_WIDTH / 2), 8));
  const edgeCrease = Math.pow(Math.abs(x) / (PACK_WIDTH / 2), 5) * .014 * Math.sin(y * 27 + x * 13);
  const crimp = sealed ? .006 * Math.sin(u * Math.PI * 100) : 0;
  return [x, y, (back ? -1 : 1) * Math.max(.012, .008 + (sealed ? .009 : pillow + edgeCrease) + crimp)];
}

function pushSurfaceVertex(u: number, v: number, back: boolean, positions: number[], normals: number[], uvs: number[]) {
  const p = foilSurface(u, v, back), dx = foilSurface(u + .0001, v, back), dy = foilSurface(u, v + .0001, back);
  const a = dx.map((value, i) => value - p[i]), b = dy.map((value, i) => value - p[i]);
  const sign = back ? -1 : 1;
  const n = [(a[1] * b[2] - a[2] * b[1]) * sign, (a[2] * b[0] - a[0] * b[2]) * sign, (a[0] * b[1] - a[1] * b[0]) * sign];
  const length = Math.hypot(...n) || 1;
  positions.push(...p);
  normals.push(...n.map((value) => value / length));
  uvs.push(back ? 1 - u : u, v);
}

/** A sealed wrapper has no pre-cut strip: the player's stroke defines its eventual pieces. */
export function createFoilMesh(back: boolean): BoosterMesh {
  const columns = 48, rows = 48;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      pushSurfaceVertex(u, v, back, positions, normals, uvs);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(...(back ? [a, b, a + 1, a + 1, b, b + 1] : [a, a + 1, b, a + 1, b + 1, b]));
      }
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) };
}

export function createFoilPiece(back: boolean, polygon: readonly CutPoint[]): BoosterMesh {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const triangles = triangulateCutPolygon(polygon);
  function subdivide(a: CutPoint, b: CutPoint, c: CutPoint, depth: number) {
    const longest = Math.max(Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(b.x - c.x, b.y - c.y), Math.hypot(c.x - a.x, c.y - a.y));
    if (depth < 4 && longest > .085) {
      const ab = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, bc = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }, ca = { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2 };
      subdivide(a, ab, ca, depth + 1); subdivide(ab, b, bc, depth + 1); subdivide(ca, bc, c, depth + 1); subdivide(ab, bc, ca, depth + 1);
      return;
    }
    const first = positions.length / 3;
    for (const point of [a, b, c]) pushSurfaceVertex(point.x, point.y, back, positions, normals, uvs);
    indices.push(...(back ? [first, first + 2, first + 1] : [first, first + 1, first + 2]));
  }
  for (let i = 0; i < triangles.length; i += 3) subdivide(polygon[triangles[i]], polygon[triangles[i + 1]], polygon[triangles[i + 2]], 0);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) };
}

/** Close the original perimeter; a cut exposes two thin paper rims, not a solid cross-section. */
export function createFoilWalls(polygon: readonly CutPoint[]): BoosterMesh {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const orientation = Math.sign(polygonArea(polygon)) || 1;
  // Each wall samples the pack texture at its outline point, so the shader can drop walls where the painted pack is absent.
  function quad(a: number[], b: number[], c: number[], d: number[], nx: number, ny: number, uv: readonly number[]) {
    const first = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) normals.push(nx, ny, 0);
    uvs.push(...uv);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = (b.x - a.x) * PACK_WIDTH, dy = (b.y - a.y) * PACK_HEIGHT, length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    const nx = dy / length * orientation, ny = -dx / length * orientation;
    const seam = ["x", "y"].some((axis) => [0, 1].some((edge) => Math.abs(a[axis as keyof CutPoint] - edge) < 1e-5 && Math.abs(b[axis as keyof CutPoint] - edge) < 1e-5));
    const segments = Math.ceil(length / .07);
    for (let segment = 0; segment < segments; segment++) {
      const from = segment / segments, to = (segment + 1) / segments;
      const u0 = a.x + (b.x - a.x) * from, v0 = a.y + (b.y - a.y) * from;
      const u1 = a.x + (b.x - a.x) * to, v1 = a.y + (b.y - a.y) * to;
      const front0 = foilSurface(u0, v0), front1 = foilSurface(u1, v1);
      const back0 = foilSurface(u0, v0, true), back1 = foilSurface(u1, v1, true);
      const uv = [u0, v0, u1, v1, u1, v1, u0, v0];
      if (seam) quad(front0, front1, back1, back0, nx, ny, uv);
      else {
        quad(front0, front1, [front1[0], front1[1], front1[2] - Math.min(.008, front1[2] * .5)], [front0[0], front0[1], front0[2] - Math.min(.008, front0[2] * .5)], nx, ny, uv);
        quad(back0, back1, [back1[0], back1[1], back1[2] + Math.min(.008, -back1[2] * .5)], [back0[0], back0[1], back0[2] + Math.min(.008, -back0[2] * .5)], nx, ny, uv);
      }
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) };
}

export function createCardMesh(back: boolean): BoosterMesh {
  const sign = back ? -1 : 1;
  return {
    positions: new Float32Array([-.86, -1.118, sign * CARD_HALF_DEPTH, .86, -1.118, sign * CARD_HALF_DEPTH, .86, 1.118, sign * CARD_HALF_DEPTH, -.86, 1.118, sign * CARD_HALF_DEPTH]),
    normals: new Float32Array([0, 0, sign, 0, 0, sign, 0, 0, sign, 0, 0, sign]),
    uvs: new Float32Array(back ? [1, 0, 0, 0, 0, 1, 1, 1] : [0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint16Array(back ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]),
  };
}

const CARD_SLICES = 8;

/**
 * The card's thickness: thin layers stacked between its faces. The shader cuts each layer by the plate's alpha,
 * so the paper edge follows the painted, uneven parchment outline instead of a straight rectangular wall.
 */
export function createCardSlices(): BoosterMesh {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let slice = 1; slice < CARD_SLICES; slice++) {
    const z = -CARD_HALF_DEPTH + (2 * CARD_HALF_DEPTH * slice) / CARD_SLICES, index = positions.length / 3;
    positions.push(-.86, -1.118, z, .86, -1.118, z, .86, 1.118, z, -.86, 1.118, z);
    for (let i = 0; i < 4; i++) normals.push(0, 0, 1);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    // Both windings, so a layer shows from either side while back faces are culled.
    indices.push(index, index + 1, index + 2, index, index + 2, index + 3, index, index + 2, index + 1, index, index + 3, index + 2);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) };
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return result;
}

export function transform(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, scale = 1) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const translation = new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, x, y, z, 1]);
  const rotationX = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const rotationY = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rotationZ = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return multiply(translation, multiply(rotationZ, multiply(rotationY, rotationX)));
}

export function perspective(aspect: number) {
  const f = 1 / Math.tan(34 * Math.PI / 360);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.002, -1, 0, 0, -.2002, 0]);
}
