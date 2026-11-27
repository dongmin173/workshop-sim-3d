export const RAW_LENGTH = 2140;
export const KERF = 2;
export const PARTS = [
  { id: 'left', name: '왼쪽 옆판', length: 450 },
  { id: 'right', name: '오른쪽 옆판', length: 450 },
  { id: 'base', name: '바닥판', length: 300 },
  { id: 'middle', name: '중간 선반', length: 300 },
  { id: 'top', name: '윗판', length: 300 },
  { id: 'back', name: '뒤쪽 보강판', length: 330 },
];
export const STEPS = [
  '원판 놓기',
  '판자 자르기',
  '책장 틀 조립',
  '나사 조이기',
  '보강판 놓기',
  '못 박기',
];
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// All lengths and offsets in the cut list are integer millimetres.
export function splitBoard(board, length) {
  if (length <= 0 || length + KERF >= board.length) throw Error('재단 치수를 확인하세요.');
  return [
    { start: board.start, length },
    { start: board.start + length + KERF, length: board.length - length - KERF },
  ];
}
export function cutList(count) {
  const pieces = [];
  let stock = { start: 0, length: RAW_LENGTH };
  for (let i = 0; i < count; i++) {
    const [piece, rest] = splitBoard(stock, PARTS[i].length);
    pieces.push(piece);
    stock = rest;
  }
  return { pieces, stock };
}
export function fresh() {
  return {
    version: 1,
    stockPlaced: false,
    cuts: 0,
    placed: 0,
    screws: Array(6).fill(0),
    back: false,
    nails: Array(4).fill(0),
  };
}
export function phase(p) {
  if (!p.stockPlaced) return 0;
  if (p.cuts < 5) return 1;
  if (p.placed < 5) return 2;
  if (p.screws.some((x) => x < 180)) return 3;
  if (!p.back) return 4;
  return p.nails.some((x) => x < 3) ? 5 : 6;
}
export function targetIndex(p) {
  switch (phase(p)) {
    case 1:
      return p.cuts;
    case 2:
      return p.placed;
    case 3:
      return p.screws.findIndex((x) => x < 180);
    case 4:
      return 5;
    case 5:
      return p.nails.findIndex((x) => x < 3);
    default:
      return 0;
  }
}
export function valid(p) {
  const integerIn = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  const seq = (a, n, max, integers) =>
    Array.isArray(a) &&
    a.length === n &&
    a.every(
      (v, i) =>
        Number.isFinite(v) &&
        v >= 0 &&
        v <= max &&
        (!integers || Number.isInteger(v)) &&
        (i === 0 || a[i - 1] === max || v === 0),
    );
  return (
    p?.version === 1 &&
    typeof p.stockPlaced === 'boolean' &&
    typeof p.back === 'boolean' &&
    integerIn(p.cuts, 5) &&
    integerIn(p.placed, 5) &&
    seq(p.screws, 6, 180, false) &&
    seq(p.nails, 4, 3, true) &&
    (p.stockPlaced || !p.cuts) &&
    (p.cuts === 5 || !p.placed) &&
    (p.placed === 5 || !p.screws[0]) &&
    (!p.back || p.screws[5] === 180) &&
    (p.back || !p.nails[0])
  );
}
export const SAVE_KEY = 'one-board-workshop-v1';
export function restore() {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (valid(p)) return p;
  } catch {}
  return fresh();
}
export function save(p) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {}
}

// Input uses CSS pixels relative to the 3D viewport, with y increasing downwards.
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export class Stroke {
  constructor() {
    this.reset();
  }
  reset() {
    this.arrivals = 0;
    this.rounds = 0;
  }
  update(p, a, b, tolerance) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    if (len < 1) return false;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
    const side = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    if (side > tolerance || t < -0.45 || t > 1.45) return false;
    const reached = this.arrivals % 2 === 0 ? t <= 0.23 : t >= 0.77;
    if (reached) {
      this.arrivals++;
      this.rounds = Math.max(this.rounds, Math.floor((this.arrivals - 1) / 2));
    }
    return reached;
  }
  suspend() {
    this.arrivals = 2 * this.rounds;
  }
  get done() {
    return this.arrivals >= 5;
  }
}
export class Turn {
  constructor() {
    this.reset();
  }
  reset() {
    this.last = null;
    this.sweep = 0;
    this.peak = 0;
  }
  update(p, c, r) {
    const radius = distance(p, c);
    if (radius < 0.5 * r || radius > 1.65 * r) {
      this.reset();
      return 0;
    }
    const angle = Math.atan2(p.y - c.y, p.x - c.x);
    if (this.last === null) {
      this.last = angle;
      return 0;
    }
    const delta =
      (Math.atan2(Math.sin(angle - this.last), Math.cos(angle - this.last)) * 180) / Math.PI;
    this.last = angle;
    if (Math.abs(delta) > 80) {
      this.reset();
      return 0;
    }
    this.sweep += delta;
    const gain = this.sweep - this.peak;
    if (gain + 1e-8 < 3) return 0;
    this.peak = this.sweep;
    return gain;
  }
}
export class HammerStroke {
  constructor() {
    this.armed = false;
  }
  update(p, c, lift, width) {
    if (Math.abs(p.x - c.x) > width) {
      this.armed = false;
      return false;
    }
    if (p.y <= c.y - lift) this.armed = true;
    if (this.armed && p.y >= c.y - 4 && p.y <= c.y + lift * 0.75) {
      this.armed = false;
      return true;
    }
    return false;
  }
}
export class Pinch {
  constructor() {
    this.reset();
  }
  reset() {
    this.down = false;
    this.ready = false;
    this.point = null;
  }
  read(marks, width, height, timestamp) {
    const dist = (a, b) =>
      Math.hypot((marks[a].x - marks[b].x) * width, (marks[a].y - marks[b].y) * height);
    const ratio = dist(4, 8) / Math.max(8, dist(5, 17));
    if (ratio >= 0.45) {
      this.down = false;
      this.ready = true;
    } else if (this.ready && ratio <= 0.3) this.down = true;
    // The index and pinky base joints move less than the tips during a pinch.
    const indexBase = marks[5], pinkyBase = marks[17];
    const palmX = (indexBase.x + pinkyBase.x) / 2,
      palmY = (indexBase.y + pinkyBase.y) / 2;
    const x = clamp((1 - palmX - 0.1) / 0.8, 0, 1),
      y = clamp((palmY - 0.1) / 0.8, 0, 1);
    const dt = this.point ? timestamp - this.point.t : 0;
    const alpha = this.point ? 1 - Math.exp(-clamp(dt, 1, 200) / 32) : 1;
    this.point = {
      x: this.point ? this.point.x + alpha * (x - this.point.x) : x,
      y: this.point ? this.point.y + alpha * (y - this.point.y) : y,
      t: timestamp,
    };
    return { ...this.point, down: this.down };
  }
}
