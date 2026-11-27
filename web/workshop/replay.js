// A separately labelled presentation route. The normal URL never loads this module.
// These synthetic 21-point samples follow the same Pinch and workbench handlers as the webcam.
import { phase, targetIndex, Pinch } from './project.js';
export class Rehearsal {
  constructor(access) {
    this.app = access;
    this.key = '';
    this.queue = [];
    this.first = null;
    this.last = 0;
    this.pinch = new Pinch();
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
      hold(g.dest, false, 180);
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
    const { w, h } = this.app.station.size,
      x = 1 - (0.1 + (0.8 * p.x) / w),
      y = 0.1 + (0.8 * p.y) / h;
    const marks = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
    marks[4] = { x: x + (down ? 0.012 : 0.084), y, z: 0 };
    marks[5] = { x: x + 0.055, y, z: 0 };
    marks[17] = { x: x - 0.055, y, z: 0 };
    this.app.input(this.pinch.read(marks, 640, 480, t));
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
