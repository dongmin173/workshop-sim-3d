const DARK = '#213f34',
  MINT = '#e3ffdb',
  GOLD = '#ffc775',
  WHITE = '#fff8e9';
function line(ctx, a, b, color, width = 2, dash = []) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
}
function circle(ctx, p, r, color, fill = false) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}
function text(ctx, p, value, fg = WHITE, bg = DARK) {
  ctx.font = '600 12px "Malgun Gothic","Noto Sans CJK KR",sans-serif';
  const width = ctx.measureText(value).width + 14;
  const x = Math.max(width / 2 + 2, Math.min(ctx.canvas.width - width / 2 - 2, p.x)),
    y = Math.max(12, Math.min(ctx.canvas.height - 14, p.y));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - 11, width, 22, 4);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(value, x, y);
}
function arrow(ctx, a, b, color) {
  line(ctx, a, b, color, 2, [6, 5]);
  const t = Math.atan2(b.y - a.y, b.x - a.x);
  for (const n of [-1, 1])
    line(
      ctx,
      b,
      { x: b.x - 9 * Math.cos(t + n * 0.48), y: b.y - 9 * Math.sin(t + n * 0.48) },
      color,
      2,
    );
}
function marker(ctx, p, color) {
  circle(ctx, p, 9, DARK, true);
  circle(ctx, p, 8, color);
  circle(ctx, p, 2, color, true);
}
export function drawGuides(
  ctx,
  { s, g, held, latched, point, station, work, near, rounds, hammerArmed, benchPoint },
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!work) {
    if (
      benchPoint &&
      benchPoint.x > 10 &&
      benchPoint.x < ctx.canvas.width - 10 &&
      benchPoint.y > 35 &&
      benchPoint.y < ctx.canvas.height - 20
    ) {
      marker(ctx, benchPoint, GOLD);
      line(ctx, benchPoint, { x: benchPoint.x + 24, y: benchPoint.y - 28 }, DARK);
      text(
        ctx,
        { x: benchPoint.x + 48, y: benchPoint.y - 31 },
        s === 6 ? '완성한 책장' : near ? 'E · 작업 시작' : '작업대',
      );
    }
    return;
  }
  if (station.cutLabel && performance.now() < station.cutLabel.until) {
    const item = station.cutLabel,
      q = station.screen(item.mesh.position);
    const p = {
      x: Math.max(93, Math.min(ctx.canvas.width - 93, q.x)),
      y: Math.max(65, Math.min(ctx.canvas.height - 24, q.y - 30)),
    };
    text(ctx, p, item.name + ' · ' + item.length + ' mm', WHITE, '#80502e');
  }
  if (s === 6) return;
  if (g.item) {
    arrow(ctx, g.item, g.dest, DARK);
    if (!held) circle(ctx, g.item, g.pickRadius, '#213f3480');
    marker(ctx, g.item, GOLD);
    marker(ctx, g.dest, MINT);
    const same = Math.hypot(g.item.x - g.dest.x, g.item.y - g.dest.y) < 42;
    if (!held || !same)
      text(ctx, { x: g.item.x, y: g.item.y - 25 }, held ? '이동 중' : '집기', WHITE, '#744522');
    text(ctx, { x: g.dest.x, y: g.dest.y + 25 }, same && held ? '손 펴기' : '놓을 자리');
  } else if (g.pick) {
    if (!held && !latched) {
      circle(ctx, g.pick, g.pickRadius, '#213f3480');
      marker(ctx, g.pick, GOLD);
      text(ctx, { x: g.pick.x, y: g.pick.y + 23 }, '손잡이 집기', WHITE, '#744522');
    }
    if (s === 1) {
      line(ctx, g.a, g.b, DARK, 6);
      line(ctx, g.a, g.b, GOLD, 2.5, [6, 4]);
      for (const [pos, tag] of [
        [g.a, 'A'],
        [g.b, 'B'],
      ]) {
        marker(ctx, pos, GOLD);
        text(ctx, { x: pos.x - 18, y: pos.y }, tag);
      }
      if (held) text(ctx, { x: g.a.x - 66, y: (g.a.y + g.b.y) / 2 }, rounds + ' / 2 왕복');
    } else if (s === 3) {
      if (held && !latched) {
        circle(ctx, g.align, 14, MINT);
        arrow(ctx, point || g.pick, g.align, DARK);
      }
      marker(ctx, g.c, GOLD);
      if (latched) {
        circle(ctx, g.c, g.r, '#334c3c');
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(g.c.x, g.c.y, g.r, -1.35, 1.04);
        ctx.stroke();
        const h = { x: g.c.x + g.r * Math.cos(1.04), y: g.c.y + g.r * Math.sin(1.04) };
        line(ctx, h, { x: h.x + 1, y: h.y - 10 }, GOLD, 3);
        line(ctx, h, { x: h.x + 11, y: h.y - 2 }, GOLD, 3);
        marker(ctx, { x: g.c.x + g.r, y: g.c.y }, MINT);
        text(
          ctx,
          { x: g.c.x, y: g.c.y + g.r + 21 },
          Math.round(station.p.screws[station.idx]) + '° / 180°',
        );
      } else text(ctx, { x: g.c.x - 32, y: g.c.y - 24 }, held ? '끝 맞추기' : '나사');
    } else {
      circle(ctx, g.c, 9, GOLD);
      if (held) {
        const strike = g.strike,
          back = { x: strike.x + g.pull, y: strike.y };
        line(ctx, { x: back.x, y: back.y - 19 }, { x: back.x, y: back.y + 19 }, DARK, 2, [5, 4]);
        line(ctx, { x: strike.x, y: strike.y - 19 }, { x: strike.x, y: strike.y + 19 }, GOLD, 3);
        arrow(ctx, hammerArmed ? back : strike, hammerArmed ? strike : back, DARK);
        text(ctx, { x: back.x, y: back.y + 30 }, '당기기');
        text(ctx, { x: strike.x, y: strike.y + 30 }, '타격');
      }
    }
  }
  if (point) {
    circle(ctx, point, held ? 10 : 13, '#1d3e35', true);
    circle(ctx, point, held ? 9 : 12, held ? GOLD : WHITE);
    circle(ctx, point, 3, held ? GOLD : WHITE, true);
  }
}
export function blueprint(canvas) {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    d = 1.6;
  canvas.width = Math.round(w * d);
  canvas.height = Math.round(h * d);
  const c = canvas.getContext('2d');
  c.scale(d, d);
  const sc = Math.min(w / 2.11, h / 1.86);
  function pt(x, y, z) {
    return {
      x: w * 0.5 + sc * (x * 0.99 + z * 0.61),
      y: h * 0.46 + sc * (-y + z * 0.28 - x * 0.1),
    };
  }
  const panel = (x, y, z, dx, dy, dz) => {
    const p = [
      pt(x, y, z),
      pt(x + dx, y, z),
      pt(x + dx, y + dy, z),
      pt(x, y + dy, z),
      pt(x, y, z + dz),
      pt(x + dx, y, z + dz),
      pt(x + dx, y + dy, z + dz),
      pt(x, y + dy, z + dz),
    ];
    for (const [ids, col] of [
      [[0, 1, 2, 3], '#e2e7d9'],
      [[0, 4, 7, 3], '#c2d0bc'],
      [[3, 2, 6, 7], '#eaf0e3'],
      [[4, 5, 6, 7], '#d2dfcc'],
    ]) {
      c.beginPath();
      ids.forEach((j, i) => (i ? c.lineTo(p[j].x, p[j].y) : c.moveTo(p[j].x, p[j].y)));
      c.closePath();
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = '#446552';
      c.lineWidth = 1.1;
      c.stroke();
    }
  };
  panel(-0.44, 0.12, -0.24, 0.88, 0.4, 0.035);
  panel(0.406, -0.54, -0.21, 0.034, 1.08, 0.46);
  for (const y of [-0.54, -0.018, 0.505]) panel(-0.412, y, -0.21, 0.824, 0.036, 0.46);
  panel(-0.44, -0.54, -0.21, 0.034, 1.08, 0.46);
  for (const [a, b, label, off] of [
    [pt(-0.44, -0.69, 0.25), pt(0.44, -0.69, 0.25), '330', 9],
    [pt(0.64, -0.54, -0.21), pt(0.64, 0.54, -0.21), '450', 0],
  ]) {
    line(c, a, b, '#657b66', 0.85);
    for (const p of [a, b])
      line(c, { x: p.x - 3, y: p.y + 3 }, { x: p.x + 3, y: p.y - 3 }, '#657b66', 0.85);
    c.font = '9px monospace';
    c.textAlign = 'center';
    c.fillStyle = DARK;
    c.fillText(label, (a.x + b.x) / 2 + (off ? 0 : 12), (a.y + b.y) / 2 + off);
  }
}
export function drawSkeleton(canvas, marks) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  if (!marks) return;
  const p = marks.map((m) => ({ x: m.x * canvas.width, y: m.y * canvas.height }));
  for (const chain of [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [5, 9, 10, 11, 12],
    [9, 13, 14, 15, 16],
    [13, 17, 18, 19, 20],
    [17, 0],
  ]) {
    for (let i = 1; i < chain.length; i++) line(c, p[chain[i - 1]], p[chain[i]], MINT, 3);
  }
  for (const q of p) circle(c, q, 3, GOLD, true);
}
