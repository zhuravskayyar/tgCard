import assert from "node:assert/strict";
import test from "node:test";
import { polygonArea, prepareBoosterCut, triangulateCutPolygon, type CutPoint } from "../src/booster/boosterCut";
import { createFoilPiece, createFoilWalls, foilSurface } from "../src/booster/boosterGeometry";
import { BOOSTER_TEMPO, getBoosterMotion as motionAtRealTime } from "../src/booster/boosterMotion";

// Choreography checks are written in the original 3.5 s timeline; the reveal now plays BOOSTER_TEMPO times faster.
const getBoosterMotion = (choreographyMs: number) => motionAtRealTime(choreographyMs / BOOSTER_TEMPO);
import { BOOSTER_FRAGMENT_FRONT_LIMIT, BOOSTER_PAPER_CURL_DEPTH, BOOSTER_PAPER_RIPPLE_DEPTH, getBoosterFragmentPose, getBoosterFragmentShape } from "../src/booster/boosterFragments";

function verifyCut(path: CutPoint[]) {
  const result = prepareBoosterCut(path);
  assert.equal(result.ok, true, result.ok ? undefined : result.message);
  if (!result.ok) throw new Error(result.message);
  const combinedArea = result.cut.pieces.reduce((sum, piece) => sum + Math.abs(polygonArea(piece)), 0);
  assert.ok(Math.abs(combinedArea - 1) < 1e-6, "the pieces must cover the wrapper exactly once");
  for (const polygon of result.cut.pieces) {
    const triangles = triangulateCutPolygon(polygon);
    let area = 0;
    for (let i = 0; i < triangles.length; i += 3) area += Math.abs(polygonArea(triangles.slice(i, i + 3).map((index) => polygon[index])));
    assert.ok(Math.abs(area - Math.abs(polygonArea(polygon))) < 1e-6, "triangulation must not leave holes or overlap");
  }
  return result.cut;
}

test("horizontal, diagonal and vertical cuts work in both directions", () => {
  for (const path of [
    [{ x: -.1, y: .8 }, { x: 1.1, y: .8 }],
    [{ x: -.1, y: .9 }, { x: 1.1, y: .45 }],
    [{ x: .4, y: 1.1 }, { x: .4, y: -.1 }],
  ]) {
    verifyCut(path);
    verifyCut([...path].reverse());
  }
});

test("a freehand curve determines the actual shape of both pieces", () => {
  const cut = verifyCut([{ x: -.1, y: .65 }, { x: .25, y: .35 }, { x: .55, y: .7 }, { x: .8, y: .45 }, { x: 1.1, y: .6 }]);
  assert.ok(cut.path.length >= 5);
  for (const point of cut.path) {
    assert.ok(cut.pieces[0].includes(point));
    assert.ok(cut.pieces[1].includes(point));
  }
});

test("a curved cut can enter and leave the same side", () => {
  verifyCut([{ x: -.1, y: .4 }, { x: .45, y: .5 }, { x: .55, y: .8 }, { x: -.1, y: .9 }]);
});

test("near-edge touch input snaps to the wrapper boundary", () => {
  const cut = verifyCut([{ x: .03, y: .8 }, { x: .97, y: .6 }]);
  assert.equal(cut.path[0].x, 0);
  assert.equal(cut.path.at(-1)?.x, 1);
});

test("a short or unfinished stroke cannot open the pack", () => {
  for (const path of [[], [{ x: .5, y: .5 }], [{ x: .2, y: .5 }, { x: .8, y: .6 }], [{ x: -.1, y: .6 }, { x: .5, y: .7 }]]) {
    assert.equal(prepareBoosterCut(path).ok, false);
  }
});

test("loops and tiny corner slivers do not produce broken geometry", () => {
  assert.equal(prepareBoosterCut([{ x: -.1, y: .7 }, { x: .7, y: .3 }, { x: .2, y: .2 }, { x: .7, y: .8 }, { x: 1.1, y: .5 }]).ok, false);
  assert.equal(prepareBoosterCut([{ x: -.1, y: .99 }, { x: .01, y: 1.1 }]).ok, false);
});

test("dense pointer input remains bounded and both 3D sides keep valid buffers", () => {
  const stroke = Array.from({ length: 500 }, (_, i) => ({ x: -.05 + i / 499 * 1.1, y: .65 + Math.sin(i / 499 * Math.PI * 4) * .1 }));
  const cut = verifyCut(stroke);
  assert.ok(cut.path.length <= 32);
  for (const polygon of cut.pieces) for (const back of [false, true]) {
    const mesh = createFoilPiece(back, polygon);
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(mesh.normals.every(Number.isFinite));
    assert.ok(mesh.positions.length / 3 < 65536, "WebGL 1 indices must not overflow");
    assert.ok(mesh.indices.every((index) => index < mesh.positions.length / 3));
    assert.equal(mesh.uvs.length / 2, mesh.positions.length / 3);
    const normalZ = mesh.normals.filter((_, i) => i % 3 === 2);
    assert.ok(normalZ.every((value) => back ? value < 0 : value > 0));
  }
});

test("front and back never cross at wrinkled or sealed wrapper edges", () => {
  for (let u = 0; u <= 1; u += .02) for (let v = 0; v <= 1; v += .02) {
    assert.ok(foilSurface(u, v)[2] >= .012);
    assert.ok(foilSurface(u, v, true)[2] <= -.012);
  }
});

test("the original perimeter is enclosed but cut rims leave the pouch hollow", () => {
  const polygon = [{ x: 0, y: .7 }, { x: 1, y: .7 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const walls = createFoilWalls(polygon);
  let rimQuads = 0, seamQuads = 0;
  for (let i = 0; i < walls.positions.length; i += 12) {
    const points = Array.from({ length: 4 }, (_, index) => Array.from(walls.positions.slice(i + index * 3, i + index * 3 + 3)));
    if (points.every((point) => Math.abs(point[1] - .69) < 1e-5)) {
      rimQuads++;
      assert.ok(points.every((point) => point[2] > 0) || points.every((point) => point[2] < 0), "a torn paper rim must not cap the pouch cavity");
    } else {
      seamQuads++;
      assert.ok(points.some((point) => point[2] > 0) && points.some((point) => point[2] < 0), "an original seam must join front and back");
    }
  }
  assert.ok(rimQuads > 0 && seamQuads > 0);
  assert.ok(walls.positions.every(Number.isFinite));
});

test("the card waits for separation before rising and turning", () => {
  for (const elapsed of [0, 300, 600, 1000, 1150]) {
    const motion = getBoosterMotion(elapsed);
    assert.equal(motion.rise, 0);
    assert.equal(motion.flip, 0);
  }
  const emerging = getBoosterMotion(1300);
  assert.equal(emerging.spread, 1);
  assert.ok(emerging.rise > 0);
  assert.equal(emerging.flip, 0);
  const complete = getBoosterMotion(3500);
  assert.equal(complete.drop, 1);
  assert.equal(complete.settle, 1);
  assert.equal(complete.phase, "revealed");
});

test("falling horizontal scraps stay behind the card even while curled and tumbling", () => {
  const cut = verifyCut([{ x: -.1, y: .82 }, { x: 1.1, y: .82 }]);
  for (const [index, polygon] of cut.pieces.entries()) {
    const shape = getBoosterFragmentShape(polygon, cut, index);
    const meshes = [createFoilPiece(false, polygon), createFoilPiece(true, polygon), createFoilWalls(polygon)];
    for (const time of [1201, 1450, 1900, 2350, 2649]) {
      const movement = getBoosterMotion(time);
      assert.equal(movement.retreat, 1, "retreat must finish before scraps fall back across the card");
      const { matrix, depth } = getBoosterFragmentPose(shape, movement, 7.5);
      assert.ok(depth + shape.radius <= BOOSTER_FRAGMENT_FRONT_LIMIT + 1e-6);
      for (const mesh of meshes) for (let i = 0; i < mesh.positions.length; i += 3) {
        for (const bendDirection of [-1, 1]) {
          const z = mesh.positions[i + 2] + bendDirection * (BOOSTER_PAPER_CURL_DEPTH + BOOSTER_PAPER_RIPPLE_DEPTH);
          const worldZ = matrix[2] * mesh.positions[i] + matrix[6] * mesh.positions[i + 1] + matrix[10] * z + matrix[14];
          assert.ok(worldZ <= BOOSTER_FRAGMENT_FRONT_LIMIT + 1e-5, "no paper vertex may cross into the rotating card's depth range");
        }
      }
    }
    const tumbling = getBoosterFragmentPose(shape, getBoosterMotion(1900), 7.5).matrix;
    assert.ok(Math.abs(tumbling[8]) + Math.abs(tumbling[9]) > .3, "the falling scrap must turn in depth rather than stay camera-facing");
  }
});
