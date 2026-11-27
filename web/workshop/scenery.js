import * as T from 'three';

export const TOP = 0.89;
export function woodTexture(end = false) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d'),
    im = ctx.createImageData(c.width, c.height);
  const palette = end ? [182, 142, 106] : [216, 181, 140];
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const a = (x / c.width) * 2 * Math.PI,
        b = (y / c.height) * 2 * Math.PI;
      const ring = end
        ? Math.hypot((x - 220) * 0.22, (y - 115) * 0.28) + 1.1 * Math.sin(a * 3)
        : b * 15 + 1.25 * Math.sin(a + Math.sin(b)) + 0.42 * Math.sin(3 * a - 2 * b);
      const grain =
        5 * Math.sin(ring) +
        8 * Math.pow(Math.max(0, Math.sin(2 * ring)), 8) +
        2.6 * Math.sin(5 * ring) +
        1.8 * Math.sin(29 * a + 89 * b);
      const i = 4 * (y * c.width + x);
      for (let j = 0; j < 3; j++) im.data[i + j] = palette[j] - grain;
      im.data[i + 3] = 255;
    }
  ctx.putImageData(im, 0, 0);
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}
const std = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const cube = new T.BoxGeometry(1, 1, 1);
export function box(group, x, y, z, sx, sy, sz, mat) {
  const m = new T.Mesh(cube, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  group.add(m);
  return m;
}
function cylinder(group, x, y, z, r1, r2, h, mat, segments = 12) {
  const m = new T.Mesh(new T.CylinderGeometry(r1, r2, h, segments), mat);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}
const pine = std(0xd8a372),
  dark = std(0x28413d),
  iron = std(0x647475, { metalness: 0.42 }),
  brass = std(0xd69c58, { metalness: 0.26 }),
  orange = std(0xba5635),
  ivory = std(0xf3dfb3);
export function tool(type) {
  const g = new T.Group();
  if (type === 'saw') {
    const shape = new T.Shape();
    shape.moveTo(-0.019, 0.018);
    shape.lineTo(0.167, 0.015);
    shape.lineTo(0.161, -0.011);
    for (let i = 21; i >= 0; i--) {
      const x = i * 0.0074;
      shape.lineTo(x + 0.003, -0.017 - i * 0.00028);
      shape.lineTo(x, -0.012 - i * 0.00028);
    }
    shape.lineTo(-0.019, -0.017);
    shape.closePath();
    const blade = new T.Mesh(
      new T.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: false }),
      iron,
    );
    g.add(blade);
    const handle = new T.Shape();
    handle.moveTo(-0.066, 0.022);
    handle.lineTo(-0.012, 0.021);
    handle.lineTo(0.002, 0.003);
    handle.lineTo(-0.025, -0.043);
    handle.lineTo(-0.061, -0.038);
    handle.lineTo(-0.076, -0.015);
    handle.closePath();
    const hole = new T.Path();
    hole.moveTo(-0.058, 0.005);
    hole.lineTo(-0.06, -0.01);
    hole.lineTo(-0.049, -0.026);
    hole.lineTo(-0.035, -0.026);
    hole.lineTo(-0.021, 0.002);
    hole.closePath();
    handle.holes.push(hole);
    const grip = new T.Mesh(
      new T.ExtrudeGeometry(handle, {
        depth: 0.012,
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: 0.002,
        bevelThickness: 0.002,
      }),
      orange,
    );
    grip.position.z = -0.004;
    g.add(grip);
  } else if (type === 'driver') {
    cylinder(g, 0, 0.074, 0, 0.018, 0.014, 0.079, dark);
    cylinder(g, 0, 0.035, 0, 0.015, 0.014, 0.01, orange);
    cylinder(g, 0, 0.009, 0, 0.004, 0.004, 0.046, iron);
    box(g, 0, -0.016, 0, 0.007, 0.01, 0.0025, iron);
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI) / 5;
      box(g, 0.015 * Math.sin(a), 0.079, 0.015 * Math.cos(a), 0.003, 0.05, 0.003, brass);
    }
  } else {
    cylinder(g, 0, 0.059, 0, 0.009, 0.013, 0.12, pine);
    cylinder(g, 0, 0.004, 0, 0.013, 0.011, 0.024, orange);
    box(g, 0, 0.127, 0, 0.075, 0.028, 0.027, iron);
    box(g, -0.033, 0.127, 0, 0.02, 0.038, 0.036, dark);
    const claw = box(g, 0.038, 0.131, 0, 0.032, 0.014, 0.022, iron);
    claw.rotation.z = 0.27;
  }
  return g;
}
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'));
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
const plane = new T.PlaneGeometry(1, 1);
function art(group, x, y, z, w, h, texture) {
  const m = new T.Mesh(plane, new T.MeshBasicMaterial({ map: texture }));
  m.position.set(x, y, z);
  m.scale.set(w, h, 1);
  group.add(m);
  return m;
}
function shadow(group, x, z, w, d, y = 0.003) {
  const tex = canvasTex(64, 64, (ctx) => {
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(38,32,22,.45)');
    grad.addColorStop(1, 'rgba(38,32,22,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  });
  const mesh = new T.Mesh(
    plane,
    new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.scale.set(w, d, 1);
  group.add(mesh);
}
export function buildRoom(scene, grain) {
  const g = new T.Group();
  scene.add(g);
  const wall = std(0xd7d0b6),
    panel = std(0x496052),
    timber = std(0xc19a72, { map: grain }),
    top = std(0xf3d3a2, { map: grain });
  const floorTex = canvasTex(768, 512, (ctx) => {
    ctx.fillStyle = '#a79478';
    ctx.fillRect(0, 0, 768, 512);
    for (let row = 0; row < 8; row++) {
      const v = 153 + Math.round(8 * Math.sin(row * 3.2));
      ctx.fillStyle = 'rgb(' + v + ',' + (v - 13) + ',' + (v - 33) + ')';
      ctx.fillRect(0, 64 * row + 2, 768, 62);
      ctx.fillStyle = '#887a67';
      let x = (137 * row) % 520;
      ctx.fillRect(x, 64 * row, 2, 64);
      ctx.strokeStyle = 'rgba(79,66,43,.12)';
      for (let k = 0; k < 12; k++) {
        ctx.beginPath();
        ctx.moveTo(0, 64 * row + 4 + k * 4.7);
        ctx.bezierCurveTo(
          260,
          64 * row + k * 4.7,
          410,
          64 * row + 8 + k * 4.7,
          768,
          64 * row + 4 + k * 4.7,
        );
        ctx.stroke();
      }
    }
  });
  floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping;
  floorTex.repeat.set(4, 4);
  const floor = new T.Mesh(new T.PlaneGeometry(6, 5.6), std(0xf1e1c5, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  box(g, 0, 1.65, -2.8, 6, 3.3, 0.1, wall);
  box(g, -3, 1.65, 0, 0.1, 3.3, 5.6, wall);
  box(g, 3, 1.65, 0, 0.1, 3.3, 5.6, wall);
  box(g, 0, 1.65, 2.8, 6, 3.3, 0.1, wall);
  box(g, 0, 0.39, -2.735, 6, 0.78, 0.05, panel);
  box(g, 0, 0.8, -2.7, 6, 0.045, 0.085, timber);
  for (const x of [-2.72, -1.2, 0.94, 2.74]) box(g, x, 1.66, -2.71, 0.075, 3.28, 0.09, timber);
  // Daylight window and distant trees painted on a plane behind its timber frame.
  const sky = canvasTex(512, 360, (c) => {
    const gd = c.createLinearGradient(0, 0, 0, 360);
    gd.addColorStop(0, '#a6d1d4');
    gd.addColorStop(0.75, '#e4e5cc');
    gd.addColorStop(1, '#bbc2a4');
    c.fillStyle = gd;
    c.fillRect(0, 0, 512, 360);
    for (let l = 0; l < 2; l++) {
      c.fillStyle = l ? '#92a78c' : '#b4c2a3';
      c.beginPath();
      c.moveTo(0, 360);
      for (let x = 0; x <= 512; x += 3)
        c.lineTo(x, 257 + l * 38 + 18 * Math.sin(x / 73 + l) + 8 * Math.sin(x / 13));
      c.lineTo(512, 360);
      c.fill();
    }
    c.fillStyle = '#d8d1b4';
    c.fillRect(0, 326, 512, 8);
  });
  art(g, -1.96, 1.76, -2.71, 1.4, 1.36, sky);
  for (const x of [-2.67, -1.96, -1.25]) box(g, x, 1.76, -2.65, 0.047, 1.46, 0.07, timber);
  for (const y of [1.06, 1.68, 2.46]) box(g, -1.96, y, -2.65, 1.48, 0.047, 0.07, timber);
  box(g, -1.96, 1.04, -2.6, 1.57, 0.06, 0.22, timber);
  const pegTex = canvasTex(24, 24, (c) => {
    c.fillStyle = '#718475';
    c.fillRect(0, 0, 24, 24);
    c.fillStyle = '#394e43';
    c.beginPath();
    c.arc(12, 12, 2.5, 0, 7);
    c.fill();
  });
  pegTex.wrapS = pegTex.wrapT = T.RepeatWrapping;
  pegTex.repeat.set(29, 14);
  box(g, -0.08, 1.69, -2.68, 1.87, 0.92, 0.1, timber);
  art(g, -0.08, 1.69, -2.62, 1.8, 0.85, pegTex);
  for (const [i, k] of ['saw', 'hammer', 'driver', 'saw'].entries()) {
    const t = tool(k);
    t.position.set(-0.68 + i * 0.35, 1.67, -2.59);
    t.scale.setScalar(k === 'saw' ? 1.65 : 2.05);
    t.rotation.z = k === 'saw' ? -0.35 : Math.PI;
    g.add(t);
  }
  // Shelves, timber offcuts and earthenware glue pots.
  for (const sy of [1.29, 1.93]) {
    box(g, 1.78, sy, -2.52, 1.49, 0.055, 0.36, timber);
    for (const x of [1.18, 2.34]) box(g, x, sy - 0.12, -2.58, 0.045, 0.22, 0.16, dark);
    for (let i = 0; i < 4; i++) {
      const x = 1.23 + 0.25 * i,
        h = 0.14 + 0.035 * (i % 3);
      cylinder(g, x, sy + 0.032 + h / 2, -2.5, 0.065, 0.055, h, i % 2 ? ivory : orange);
      cylinder(g, x, sy + 0.036 + h, -2.5, 0.064, 0.064, 0.018, dark);
    }
  }
  for (let i = 0; i < 6; i++) {
    const p = box(
      g,
      -2.69 + i * 0.105,
      0.68 + (i % 3) * 0.065,
      -1.53,
      0.081,
      1.37 + (i % 3) * 0.13,
      0.12,
      timber,
    );
    p.rotation.z = -0.12 - 0.025 * i;
  }
  // Bench has a laminated top, apron, dark-green frame, lower shelf and a face vise.
  shadow(g, 0, 0, 3.25, 1.64);
  for (let i = 0; i < 8; i++) box(g, 0, TOP - 0.04, -0.49 + i * 0.14, 2.64, 0.08, 0.139, top);
  box(g, 0, TOP - 0.115, 0.45, 2.53, 0.105, 0.095, timber);
  for (const x of [-1.14, 1.14])
    for (const z of [-0.42, 0.42]) box(g, x, 0.405, z, 0.115, 0.81, 0.115, dark);
  for (const z of [-0.42, 0.42]) {
    box(g, 0, 0.23, z, 2.36, 0.075, 0.066, panel);
  }
  for (let i = 0; i < 5; i++) box(g, 0, 0.263, -0.34 + i * 0.17, 2.31, 0.035, 0.15, timber);
  for (let i = 0; i < 3; i++)
    box(g, -0.33 + i * 0.13, 0.305 + i * 0.034, -0.02, 0.95 - i * 0.09, 0.032, 0.17, top);
  box(g, -0.74, 0.79, 0.56, 0.38, 0.12, 0.085, dark);
  const vise = cylinder(g, -0.74, 0.78, 0.62, 0.03, 0.03, 0.1, iron);
  vise.rotation.x = Math.PI / 2;
  const rod = cylinder(g, -0.74, 0.78, 0.676, 0.009, 0.009, 0.2, brass);
  rod.rotation.z = 0.35;
  // Round bench-dog holes and a pair of shallow hardware trays sit beyond the cut line.
  for (const x of [-1.12, -0.9, -0.68, -0.46, -0.24, -0.02, 0.2, 0.42, 0.64, 0.86, 1.08])
    cylinder(g, x, TOP + 0.0008, 0.43, 0.013, 0.013, 0.0015, dark, 12);
  for (let j = 0; j < 2; j++) {
    const x = 0.84 + j * 0.245,
      z = -0.38;
    box(g, x, TOP + 0.008, z, 0.22, 0.016, 0.185, dark);
    for (const sign of [-1, 1]) {
      box(g, x + sign * 0.107, TOP + 0.026, z, 0.009, 0.035, 0.185, pine);
      box(g, x, TOP + 0.026, z + sign * 0.089, 0.22, 0.035, 0.008, pine);
    }
    for (let i = 0; i < (j ? 4 : 6); i++) {
      const px = x - 0.068 + (i % 3) * 0.062,
        pz = z - 0.038 + Math.floor(i / 3) * 0.08;
      const sh = cylinder(g, px, TOP + 0.022, pz, 0.002, 0.002, j ? 0.049 : 0.037, iron, 6);
      sh.rotation.x = 1.4;
      sh.rotation.z = 0.25;
      const hd = cylinder(
        g,
        px,
        TOP + 0.024,
        pz + 0.018,
        j ? 0.005 : 0.008,
        j ? 0.005 : 0.008,
        0.004,
        j ? iron : brass,
        8,
      );
      hd.rotation.x = 1.4;
      sh.userData.supply = hd.userData.supply = { type: j ? 'nail' : 'screw', i };
    }
  }
  // Two task lights and a side cabinet.
  for (const x of [-1.2, 1.13]) {
    cylinder(g, x, 2.94, -0.78, 0.009, 0.009, 0.68, dark);
    cylinder(g, x, 2.55, -0.78, 0.042, 0.2, 0.14, panel, 24);
    cylinder(g, x, 2.476, -0.78, 0.185, 0.185, 0.01, ivory, 24);
  }
  box(g, 2.3, 0.51, -1.72, 0.86, 1.02, 0.5, panel);
  box(g, 2.3, 1.04, -1.72, 0.91, 0.045, 0.55, timber);
  for (const y of [0.28, 0.61, 0.88]) {
    box(g, 2.3, y, -1.45, 0.73, 0.18, 0.03, dark);
    box(g, 2.3, y + 0.03, -1.423, 0.16, 0.018, 0.02, brass);
  }
  return g;
}
