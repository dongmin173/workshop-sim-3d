// A separately labelled presentation route. The normal URL never loads this module.
// These synthetic 21-point samples follow the same Pinch and workbench handlers as the webcam.
import { phase, targetIndex, Pinch } from './project.js';

// Landmark order matches the webcam model. Both poses share the same palm.
const OPEN_HAND = [
  [0, 2.75],
  [2.7, 0.7], [4.4, 0.1], [5.9, -0.9], [6.8, -2.2],
  [3.6, -2.4], [4.3, -4.9], [4.6, -6.6], [4.8, -8.1],
  [1.3, -3.1], [1.4, -6.1], [1.4, -8], [1.4, -9.6],
  [-1.3, -3], [-1.6, -5.7], [-1.8, -7.5], [-2, -8.9],
  [-3.6, -2.5], [-4.3, -4.6], [-4.8, -6], [-5.2, -7.1],
];
const CLOSED_HAND = new Map([
  [3, [5, -1.9]], [4, [5.5, -3]],
  [6, [4, -4.35]], [7, [5, -4.35]], [8, [5.7, -3.1]],
  [10, [1.4, -5.6]], [11, [1.6, -5.4]], [12, [1.8, -3.8]],
  [14, [-1.6, -5.3]], [15, [-1.7, -5.1]], [16, [-1.5, -3.7]],
  [18, [-4.1, -4.4]], [19, [-4.2, -4.2]], [20, [-3.9, -3.1]],
]);

export class Rehearsal {
  constructor(access) {
    this.app = access;
    this.pinch = new Pinch();
    this.reset();
  }
  reset() {
    this.key = '';
    this.queue = [];
    this.first = null;
    this.last = 0;
    this.started = false;
    this.pinch.reset();
    this.completedPasses = 0;
  }
  makeQueue(s, g) {
    const seq = [];
    const add = (p, down, ms) => seq.push({ p: { ...p }, down, ms });
    const hold = (p, down, ms) => {
      add(p, down, ms);
    };
    const pick = (p) => {
      add(p, false, 380);
      hold(p, false, 150);
      hold(p, true, 190);
    };
    if ([0, 2, 4].includes(s)) {
      pick(g.item);
      add(g.dest, true, 570);
      hold(g.dest, true, 240);
      hold(g.dest, false, 300);
    } else if (s === 1) {
      pick(g.pick);
      for (const p of [g.a, g.b, g.a, g.b, g.a]) {
        add(p, true, 285);
        hold(p, true, 125);
      }
      hold(g.a, false, 120);
    } else if (s === 3) {
      pick(g.pick);
      add(g.align, true, 280);
      hold(g.align, true, 190);
      const at = (a) => ({ x: g.c.x + g.r * Math.cos(a), y: g.c.y + g.r * Math.sin(a) });
      add(at(0), true, 270);
      hold(at(0), true, 150);
      for (let j = 1; j <= 28; j++) add(at((j * Math.PI) / 21), true, 68);
      hold(at((28 * Math.PI) / 21), false, 160);
    } else if (s === 5) {
      pick(g.pick);
      const hit = { x: g.seatedStrike.x - 10, y: g.seatedStrike.y };
      for (let n = 0; n < 3; n++) {
        add(g.pick, true, 240);
        hold(g.pick, true, 155);
        add(hit, true, 210);
        hold(hit, true, 115);
      }
      hold(hit, false, 150);
    }
    return seq;
  }
  sample(p, down, t) {
    const { w, h } = this.app.station.size;
    if (!w || !h) return;
    const x = 0.9 - (0.8 * p.x) / w,
      y = 0.1 + (0.8 * p.y) / h,
      scale = Math.min(w, h) * 0.026;
    const marks = OPEN_HAND.map((open, i) => {
      const [dx, dy] = (down && CLOSED_HAND.get(i)) || open;
      return { x: x + (dx * scale) / w, y: y + (dy * scale) / h, z: 0 };
    });
    this.app.input(this.pinch.read(marks, w, h, t), marks, w, h);
  }
  tick(t) {
    if (this.first === null) this.first = t;
    if (!this.started && t - this.first > 2350) {
      this.started = true;
      this.app.enter();
    }
    if (!this.started || !this.app.state().working || !this.app.ready() || t - this.last < 55)
      return;
    this.last = t;
    const project = this.app.project(),
      s = phase(project);
    if (s === 6) return;
    const key = s + '/' + targetIndex(project);
    if (key !== this.key || !this.queue.length) {
      if (key === this.key) this.completedPasses++;
      this.key = key;
      this.queue = this.makeQueue(s, this.app.station.guides());
      this.previous = this.queue[0].p;
      this.segment = t;
      this.pinch.reset();
      this.sample(this.previous, false, t);
      return;
    }
    const next = this.queue[0],
      a = Math.min(1, (t - this.segment) / next.ms);
    const k = a * a * (3 - 2 * a);
    const pt = {
      x: this.previous.x + (next.p.x - this.previous.x) * k,
      y: this.previous.y + (next.p.y - this.previous.y) * k,
    };
    this.sample(pt, next.down, t);
    if (a === 1) {
      this.queue.shift();
      this.previous = next.p;
      this.segment = t;
    }
  }
}
