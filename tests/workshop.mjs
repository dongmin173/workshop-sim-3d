import assert from 'node:assert/strict';
import {
  cutList,
  splitBoard,
  fresh,
  valid,
  phase,
  Stroke,
  Turn,
  HammerStroke,
  Pinch,
} from '../web/workshop/project.js';
const model = cutList(5);
assert.deepEqual(
  model.pieces.map((p) => p.length),
  [450, 450, 300, 300, 300],
);
assert.deepEqual(model.stock, { start: 1810, length: 330 });
assert.deepEqual(cutList(1).stock, { start: 452, length: 1688 });
assert.throws(() => splitBoard({ start: 0, length: 450 }, 450));
const s = new Stroke(),
  a = { x: 100, y: 120 },
  b = { x: 100, y: 20 };
s.update(a, a, b, 10);
s.update({ x: 160, y: 20 }, a, b, 10);
assert.equal(s.arrivals, 1);
for (const p of [b, a]) s.update(p, a, b, 10);
assert.equal(s.rounds, 1);
s.suspend();
s.suspend();
assert.equal(s.rounds, 1);
for (const p of [a, b, a]) s.update(p, a, b, 10);
assert(s.done);
const turn = new Turn(),
  c = { x: 0, y: 0 };
const circ = (a) => ({
  x: 50 * Math.cos((a * Math.PI) / 180),
  y: 50 * Math.sin((a * Math.PI) / 180),
});
let angle = 0;
for (const a of [0, 20, 40, 60, 40, 60, 80, 100, 120, 140, 160, 179, 182])
  angle += turn.update(circ(a), c, 50);
assert(angle >= 180 && angle < 184);
turn.reset();
assert.equal(turn.update(circ(180), c, 50), 0);
assert.equal(turn.update(circ(160), c, 50), 0);
const h = new HammerStroke();
for (let i = 0; i < 8; i++) assert.equal(h.update(c, c, 50, 20), false);
h.update({ x: 0, y: -52 }, c, 50, 20);
assert(h.update(c, c, 50, 20));
assert.equal(h.update(c, c, 50, 20), false);
const marks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
marks[5] = { x: 0.55, y: 0.55 };
marks[17] = { x: 0.45, y: 0.55 };
const pinch = new Pinch();
assert.equal(pinch.read(marks, 640, 480, 0).down, false);
marks[4].x = 0.56;
pinch.read(marks, 640, 480, 80);
marks[4].x = 0.52;
assert(pinch.read(marks, 640, 480, 160).down);
marks[4].x = 0.535;
assert(pinch.read(marks, 640, 480, 240).down);
pinch.reset();
assert.equal(pinch.read(marks, 640, 480, 300).down, false);
// Opening and closing the fingers leaves the pointer on a stationary palm.
const gesture = new Pinch();
marks[4] = { x: 0.62, y: 0.43 };
marks[8] = { x: 0.48, y: 0.33 };
const open = gesture.read(marks, 640, 480, 0);
marks[4] = { x: 0.50, y: 0.44 };
marks[8] = { x: 0.51, y: 0.45 };
const grabbed = gesture.read(marks, 640, 480, 80);
assert.equal(grabbed.down, true);
assert.equal(grabbed.x, open.x);
assert.equal(grabbed.y, open.y);
for (const mark of marks) mark.x += 0.1;
const moved = gesture.read(marks, 640, 480, 200);
assert.equal(moved.down, true);
assert(moved.x < grabbed.x - 0.1);
marks[4] = { x: 0.72, y: 0.43 };
marks[8] = { x: 0.58, y: 0.33 };
const released = gesture.read(marks, 640, 480, 240);
assert.equal(released.down, false);
assert.equal(released.y, moved.y);

// The palm still sets the pinch scale when its width is foreshortened.
const edgeOn = new Pinch();
marks[0] = { x: 0.55, y: 0.63 };
marks[5] = { x: 0.56, y: 0.48 };
marks[9] = { x: 0.55, y: 0.46 };
marks[17] = { x: 0.54, y: 0.48 };
marks[4] = { x: 0.67, y: 0.40 };
marks[8] = { x: 0.55, y: 0.40 };
const aimed = edgeOn.read(marks, 640, 480, 0);
assert.equal(aimed.down, false);
for (const mark of marks) mark.x += 0.08;
marks[4].x = marks[8].x + 0.06;
const closing = edgeOn.read(marks, 640, 480, 70);
assert.equal(closing.down, false);
assert.equal(closing.x, aimed.x);
marks[4].x = marks[8].x + 0.035;
const latched = edgeOn.read(marks, 640, 480, 140);
assert.equal(latched.down, true);
assert.equal(latched.x, aimed.x);
const heldStill = edgeOn.read(marks, 640, 480, 210);
assert.equal(heldStill.down, true);
assert.equal(heldStill.x, aimed.x);
for (const mark of marks) mark.x += 0.10;
const dragging = edgeOn.read(marks, 640, 480, 280);
assert.equal(dragging.down, true);
assert(dragging.x < aimed.x - 0.10);
for (const mark of marks) mark.x -= 0.05;
marks[4].x = marks[8].x + 0.12;
const opened = edgeOn.read(marks, 640, 480, 350);
assert.equal(opened.down, false);
assert.equal(opened.x, dragging.x);
assert.equal(opened.y, dragging.y);
const p = fresh();
assert(valid(p));
assert.equal(phase(p), 0);
p.cuts = 3;
assert.equal(valid(p), false);
p.stockPlaced = true;
p.cuts = 5;
p.placed = 5;
p.screws.fill(180);
p.back = true;
p.nails.fill(3);
assert(valid(p));
assert.equal(phase(p), 6);
p.nails[3] = 2;
assert.equal(phase(p), 5);
p.screws[1] = 5;
assert.equal(valid(p), false);
console.log(
  'PASS · 재단 치수 / 진행 순서 / 톱 왕복 / 재추적 / 시계 방향 회전 / 망치 재장전 / 핀치',
);
