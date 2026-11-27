import * as T from 'three';
import { mouseRay } from '../physics.js';
import { TOP, buildRoom, woodTexture, tool } from './scenery.js';
import { PARTS, cutList, phase, targetIndex } from './project.js';

const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const BOOK = V(0.22, TOP + 0.003, -0.055),
  RAW_Y = TOP + 0.0095,
  RAW_Z = -0.12;
const HORIZONTAL = new T.Plane(V(0, 1, 0), -RAW_Y);
const wood = new T.MeshStandardMaterial({ map: woodTexture(), roughness: 0.86 });
const end = new T.MeshStandardMaterial({ map: woodTexture(true), roughness: 0.93 });
const woodFaces = [end, end, wood, wood, wood, wood];
const metal = new T.MeshStandardMaterial({ color: 0x55575a, metalness: 0.52, roughness: 0.38 });
const zinc = new T.MeshStandardMaterial({ color: 0xa49b85, metalness: 0.42, roughness: 0.45 });
const slot = new T.MeshBasicMaterial({ color: 0x2d3533 });
function board(piece) {
  const length = piece.length / 1000,
    g = new T.BoxGeometry(length, 0.015, 0.18);
  const pos = g.attributes.position,
    normals = g.attributes.normal,
    uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const endFace = Math.abs(normals.getX(i)) > 0.5,
      broad = Math.abs(normals.getY(i)) > 0.5;
    uv.setXY(
      i,
      endFace ? z / 0.19 + 0.5 : (piece.start / 1000 + x + length / 2) / 0.56,
      endFace ? y / 0.055 + 0.44 : broad ? (z + 0.09) / 0.22 : (y + 0.008) / 0.12,
    );
  }
  return new T.Mesh(g, woodFaces);
}
function clear(group) {
  for (const c of [...group.children]) {
    group.remove(c);
    c.traverse((obj) => {
      if (obj.userData.dispose || obj.isMesh || obj.isLineSegments) obj.geometry?.dispose();
    });
  }
}
function outline(object, color, opacity = 1) {
  const mat = new T.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
  const edges = new T.LineSegments(new T.EdgesGeometry(object.geometry), mat);
  edges.renderOrder = 3;
  object.add(edges);
  return edges;
}
function pose(index) {
  const p = BOOK.clone(),
    r = new T.Euler();
  if (index < 2) {
    p.x += (index ? 1 : -1) * 0.1575;
    p.y += 0.225;
    r.z = Math.PI / 2;
  } else if (index < 5) p.y += [0.0075, 0.225, 0.4425][index - 2];
  else {
    p.y += 0.36;
    p.z -= 0.0975;
    r.x = Math.PI / 2;
  }
  return { p, r };
}
function mountedFastener(kind, i, amount) {
  const screw = kind === 'screw',
    p = BOOK.clone(),
    normal = V();
  if (screw) {
    const side = i < 3 ? -1 : 1;
    p.x += side * 0.165;
    p.y += [0.0075, 0.225, 0.4425][i % 3];
    normal.x = side;
  } else {
    p.x += (i < 2 ? -1 : 1) * 0.1575;
    p.y += [0.303, 0.417][i % 2];
    p.z -= 0.105;
    normal.z = -1;
  }
  const g = new T.Group(),
    travel = screw ? 0.027 : 0.03;
  const headR = screw ? 0.007 : 0.0054;
  const shank = new T.Mesh(new T.CylinderGeometry(0.0022, 0.0016, travel, 10), zinc);
  shank.position.y = -travel / 2;
  g.add(shank);
  const head = new T.Mesh(
    new T.CylinderGeometry(headR, headR * 0.9, 0.0022, 16),
    screw ? metal : zinc,
  );
  g.add(head);
  if (screw) {
    for (const a of [0, Math.PI / 2]) {
      const s = new T.Mesh(new T.BoxGeometry(0.008, 0.0007, 0.0015), slot);
      s.rotation.y = a;
      s.position.y = 0.0012;
      g.add(s);
    }
  }
  const base = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), normal);
  function update(value) {
    g.position.copy(p).addScaledVector(normal, 0.0013 + (1 - value) * travel);
    g.quaternion.copy(base);
    if (screw) g.rotateY(-value * Math.PI);
  }
  update(amount);
  return { g, p, normal, update };
}
function ghostFor(length) {
  const mesh = new T.Mesh(
    new T.BoxGeometry(length, 0.015, 0.18),
    new T.MeshBasicMaterial({
      color: 0x64d9c8,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    }),
  );
  outline(mesh, 0x267b70, 0.95);
  return mesh;
}
export class Station {
  constructor(scene, camera, canvas) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.group = new T.Group();
    scene.add(this.group);
    this.supplies = [];
    buildRoom(scene, wood.map).traverse((obj) => {
      if (obj.userData.supply) this.supplies.push(obj);
    });
    this.tools = { saw: tool('saw'), driver: tool('driver'), hammer: tool('hammer') };
    for (const t of Object.values(this.tools)) {
      scene.add(t);
      t.visible = false;
    }
    this.tweens = [];
    this.transitionUntil = 0;
  }
  get size() {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
  }
  screen(v) {
    const { w, h } = this.size,
      a = v.clone().project(this.camera);
    return { x: ((a.x + 1) * w) / 2, y: ((1 - a.y) * h) / 2 };
  }
  ray(p) {
    const { w, h } = this.size;
    return mouseRay(p.x, p.y, w, h, this.camera);
  }
  onPlane(p) {
    return this.ray(p).intersectPlane(this.plane, V());
  }
  screenPlane(p, anchor) {
    const normal = this.camera.getWorldDirection(V());
    return this.ray(p).intersectPlane(
      new T.Plane().setFromNormalAndCoplanarPoint(normal, anchor),
      V(),
    );
  }
  reset(p, working, cutFrom = null) {
    // Retire only dynamic geometry. Shared timber and hardware materials stay cached.
    this.group.traverse((o) => {
      if (o.isLineSegments || (o.material?.isMeshBasicMaterial && o.material !== slot))
        o.material?.dispose();
    });
    clear(this.group);
    this.tweens = [];
    this.transitionUntil = 0;
    this.cutLabel = null;
    this.working = working;
    this.p = p;
    this.s = phase(p);
    this.idx = targetIndex(p);
    this.moving = null;
    this.ghost = null;
    this.hardware = null;
    this.cutX = null;
    this.activeTool = null;
    for (const t of Object.values(this.tools)) t.visible = false;
    const { pieces, stock } = cutList(p.cuts);
    const all = [...pieces, stock];
    for (let i = 0; i < all.length; i++) {
      const part = all[i],
        m = board(part);
      this.group.add(m);
      if (i === p.cuts && p.cuts < 5) {
        m.position.set(0, RAW_Y, p.stockPlaced ? RAW_Z : 0.23);
        if (this.s === 0 && working) {
          this.moving = m;
          this.configureGhost(m, V(0, RAW_Y, RAW_Z), new T.Euler(), true);
        }
        if (this.s === 1) {
          this.cutX = -stock.length / 2000 + PARTS[p.cuts].length / 1000 + 0.001;
          this.stock = m;
        }
        if (cutFrom)
          this.animate(
            m,
            V(cutFrom.x + part.length / 2000 + 0.001, RAW_Y, RAW_Z),
            m.position.clone(),
          );
      } else {
        const target = pose(i),
          installed = i < p.placed || (i === 5 && p.back);
        if (installed) {
          m.position.copy(target.p);
          m.rotation.copy(target.r);
        } else if (working && ((this.s === 2 && i === p.placed) || (this.s === 4 && i === 5))) {
          m.position.copy(target.p);
          m.position.x = this.s === 4 ? BOOK.x + 0.49 : BOOK.x - 0.52;
          m.position.y = Math.max(TOP + 0.125, target.p.y);
          m.rotation.copy(target.r);
          m.rotation.y += this.s === 4 ? -0.18 : 0.16;
          this.moving = m;
          this.configureGhost(m, target.p, target.r, false);
        } else {
          m.position.set(-0.76 + i * 0.01, RAW_Y + i * 0.019, -0.38);
          if (cutFrom && i === p.cuts - 1) {
            this.animate(
              m,
              V(cutFrom.x - 0.001 - part.length / 2000, RAW_Y, RAW_Z),
              m.position.clone(),
            );
            this.cutLabel = {
              mesh: m,
              name: PARTS[i].name,
              length: part.length,
              until: performance.now() + 1600,
            };
          } else if (cutFrom && i === 5)
            this.animate(
              m,
              V(cutFrom.x + 0.001 + part.length / 2000, RAW_Y, RAW_Z),
              m.position.clone(),
            );
        }
      }
    }
    if (p.cuts === 5 && !p.back && working) {
      for (const side of [-1, 1]) {
        const foot = new T.Mesh(new T.BoxGeometry(0.042, 0.018, 0.17), metal);
        foot.position.copy(BOOK).add(V(side * 0.186, 0.008, 0));
        this.group.add(foot);
        const jaw = new T.Mesh(new T.BoxGeometry(0.014, 0.033, 0.11), zinc);
        jaw.position.copy(BOOK).add(V(side * 0.173, 0.025, 0));
        this.group.add(jaw);
      }
    }
    for (const m of this.supplies) {
      const { type, i } = m.userData.supply,
        screw = type === 'screw';
      const inUse = working && this.s === (screw ? 3 : 5) && this.idx === i;
      m.visible = !(screw ? p.screws[i] : p.nails[i]) && !inUse;
    }
    for (const [kind, items] of [
      ['screw', p.screws],
      ['nail', p.nails],
    ]) {
      for (let i = 0; i < items.length; i++) {
        const isCurrent =
          working &&
          ((this.s === 3 && kind === 'screw') || (this.s === 5 && kind === 'nail')) &&
          this.idx === i;
        if (!isCurrent && !items[i]) continue;
        const h = mountedFastener(kind, i, items[i] / (kind === 'screw' ? 180 : 3));
        this.group.add(h.g);
        if (isCurrent) this.hardware = h;
      }
    }
    if (working && [1, 3, 5].includes(this.s)) {
      this.activeTool = this.tools[{ 1: 'saw', 3: 'driver', 5: 'hammer' }[this.s]];
      this.activeTool.visible = true;
    }
  }
  animate(mesh, from, to) {
    mesh.position.copy(from);
    this.tweens.push({ mesh, from, to });
    this.transitionUntil = performance.now() + 560;
  }
  tick(t) {
    if (!this.tweens.length) return;
    const a = Math.max(0, Math.min(1, 1 - (this.transitionUntil - t) / 560));
    for (const q of this.tweens) {
      q.mesh.position.lerpVectors(q.from, q.to, a * a * (3 - 2 * a));
      q.mesh.position.y += 0.085 * Math.sin(Math.PI * a);
    }
    if (a === 1) this.tweens = [];
  }
  configureGhost(m, p, r, horizontal) {
    this.target = p;
    this.plane = horizontal ? HORIZONTAL : new T.Plane(V(0, 0, 1), -p.z);
    this.ghost = ghostFor(m.geometry.parameters.width);
    this.ghost.position.copy(p);
    this.ghost.rotation.copy(r);
    this.group.add(this.ghost);
    outline(m, 0xf2b454, 0.95);
  }
  canGrab(p) {
    if (!this.moving) return false;
    this.moving.updateWorldMatrix(true, false);
    const caster = new T.Raycaster();
    caster.ray.copy(this.ray(p));
    return caster.intersectObject(this.moving, false).length > 0;
  }
  view() {
    const s = this.s,
      i = this.idx,
      { w, h } = this.size;
    let aim, dir, span, vertical;
    if (s === 0) {
      aim = V(0, RAW_Y, 0.04);
      dir = V(0.03, 1.25, 0.72);
      span = 2.84;
      vertical = 0.85;
    } else if (s === 1) {
      aim = V(this.cutX, RAW_Y, RAW_Z);
      dir = V(0.015, 1, 0.2);
      span = 0.69;
      vertical = 0.48;
    } else if (s === 2) {
      aim = V(BOOK.x - 0.22, TOP + 0.23, BOOK.z);
      dir = V(0.14, 0.42, 1);
      span = 1.18;
      vertical = 0.72;
    } else if (s === 3) {
      aim = this.hardware.p.clone();
      dir = V(i < 3 ? -1 : 1, 0.19, 0.43);
      span = 0.53;
      vertical = 0.37;
    } else if (s === 4) {
      aim = V(BOOK.x + 0.23, TOP + 0.27, BOOK.z);
      dir = V(0.14, 0.3, -1);
      span = 1.25;
      vertical = 0.75;
    } else if (s === 5) {
      aim = this.hardware.p.clone().add(V(0, -0.028, -0.065));
      dir = V(1, 0.12, -0.44);
      span = 0.46;
      vertical = 0.32;
    } else {
      aim = BOOK.clone().add(V(0, 0.22, 0));
      dir = V(0.6, 0.29, 1);
      span = 0.93;
      vertical = 0.8;
    }
    const hWorld = Math.max(vertical, span / (w / h)),
      dist = hWorld / (2 * Math.tan(T.MathUtils.degToRad(this.camera.fov) / 2));
    return { pos: aim.clone().addScaledVector(dir.normalize(), dist), aim };
  }
  guides() {
    const { w, h } = this.size;
    const pickRadius = Math.max(46, Math.min(72, h * 0.1));
    if (this.moving)
      return { item: this.screen(this.moving.position), dest: this.screen(this.target), pickRadius };
    if (!this.activeTool) return {};
    let anchor;
    if (this.s === 1) {
      anchor = V(this.cutX, RAW_Y + 0.011, RAW_Z);
      const a = this.screen(anchor.clone().add(V(0, 0, 0.089))),
        b = this.screen(anchor.clone().add(V(0, 0, -0.089)));
      const pick = { x: a.x + Math.min(82, w * 0.12), y: a.y + 10 };
      return { anchor, a, b, pick, pickRadius };
    }
    if (this.s === 5) {
      const { g, p, normal } = this.hardware;
      anchor = g.position.clone().addScaledVector(normal, 0.0011);
      const scale = 0.76,
        grip = V(0, 0.024, 0),
        face = V(-0.043, 0.127, 0);
      const offset = face.sub(grip).multiplyScalar(scale).applyQuaternion(this.camera.quaternion);
      const strike = this.screen(anchor.clone().sub(offset));
      const seatedStrike = this.screen(p.clone().addScaledVector(normal, 0.0024).sub(offset));
      const pull = Math.min(96, w * 0.17, h * 0.17);
      const pick = { x: strike.x + pull * 1.18, y: strike.y };
      const tolerance = Math.max(24, Math.min(42, h * 0.065));
      return { anchor, c: this.screen(anchor), strike, seatedStrike, pull, pick, pickRadius, tolerance, grip, scale };
    }
    anchor = this.hardware.g.position.clone();
    const c = this.screen(anchor),
      r = Math.min(64, w * 0.12, h * 0.128);
    const pick = { x: c.x + r * 1.45, y: c.y + Math.min(30, h * 0.055) };
    const roll = -0.65, scale = 0.86;
    const grip = V(0, 0.075, 0), tip = V(0, -0.016, 0);
    const front = anchor.clone().addScaledVector(this.camera.getWorldDirection(V()), -0.035);
    const localDelta = tip
      .clone()
      .sub(grip)
      .multiplyScalar(scale)
      .applyAxisAngle(V(0, 0, 1), roll)
      .applyQuaternion(this.camera.quaternion);
    const origin = this.screen(front),
      tipScreen = this.screen(front.clone().add(localDelta));
    const align = { x: c.x - (tipScreen.x - origin.x), y: c.y - (tipScreen.y - origin.y) };
    return { anchor, c, pick, pickRadius, r, front, grip, roll, scale, align };
  }
  paintTool(g, held, latched, point) {
    const t = this.activeTool;
    if (!t || !g.anchor) return;
    t.quaternion.copy(this.camera.quaternion);
    t.scale.setScalar(1);
    if (this.s === 1) {
      const p =
        held && point
          ? { x: g.a.x, y: Math.max(g.b.y - 12, Math.min(g.a.y + 12, point.y)) }
          : g.pick;
      const front = g.anchor.clone().addScaledVector(this.camera.getWorldDirection(V()), -0.025);
      const w = this.screenPlane(p, front);
      if (!w) return;
      t.rotateZ(held ? 1.28 : 0.65);
      t.scale.setScalar(0.7);
      const local = held ? V(0.06, -0.021, 0) : V(-0.047, -0.01, 0);
      t.position.copy(w).sub(local.multiplyScalar(0.7).applyQuaternion(t.quaternion));
    } else if (this.s === 5) {
      let p = g.pick;
      if (held && point) {
        const dy = point.y - g.strike.y;
        p = {
          x: Math.max(g.strike.x, point.x),
          y: g.strike.y + Math.sign(dy) * Math.max(0, Math.abs(dy) - g.tolerance),
        };
      }
      const w = this.screenPlane(p, g.anchor);
      if (!w) return;
      t.scale.setScalar(g.scale);
      t.position.copy(w).sub(g.grip.clone().multiplyScalar(g.scale).applyQuaternion(t.quaternion));
    } else if (latched) {
      t.position.copy(this.hardware.g.position);
      t.quaternion.setFromUnitVectors(V(0, 1, 0), this.hardware.normal);
      t.rotateY((-this.p.screws[this.idx] * Math.PI) / 180);
      t.translateY(0.013);
      t.scale.setScalar(0.82);
    } else {
      const p = held && point ? point : g.pick;
      const w = this.screenPlane(p, g.front);
      if (!w) return;
      t.rotateZ(g.roll);
      t.scale.setScalar(g.scale);
      const local = g.grip.clone().multiplyScalar(g.scale).applyQuaternion(t.quaternion);
      t.position.copy(w).sub(local);
    }
  }
}
