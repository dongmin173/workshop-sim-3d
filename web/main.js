import * as T from 'three';
import { pushOut } from './physics.js';
import { Sound } from './sound.js';
import { Hands } from './workshop/hands.js';
import { Station } from './workshop/station.js';
import { TOP } from './workshop/scenery.js';
import { drawGuides, blueprint, drawSkeleton } from './workshop/guides.js?v=hand-cursor';
import {
  PARTS,
  STEPS,
  Stroke,
  Turn,
  HammerStroke,
  clamp,
  distance,
  fresh,
  restore,
  save,
  phase,
  targetIndex,
  workPoint,
} from './workshop/project.js';
const $ = (id) => document.getElementById(id);
const world = $('world'),
  overlay = $('overlay'),
  ctx = overlay.getContext('2d');
const replay = new URLSearchParams(location.search).get('replay') === '1';
let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas: world, antialias: true, powerPreference: 'low-power' });
} catch (e) {
  $('load-error').hidden = false;
  $('load-error').textContent =
    '3D 화면을 열 수 없어요. Chrome 또는 Edge의 그래픽 가속을 켜고 다시 열어 주세요.';
  throw e;
}
renderer.setPixelRatio(1);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
const scene = new T.Scene();
scene.background = new T.Color(0xe0d6bd);
scene.add(new T.HemisphereLight(0xffefcd, 0xb3b9a0, 2.2));
const sun = new T.DirectionalLight(0xffe2ae, 2.15);
sun.position.set(-3, 5, 3);
scene.add(sun);
const fill = new T.DirectionalLight(0xd6e9e7, 0.48);
fill.position.set(2, 1, -3);
scene.add(fill);
const camera = new T.PerspectiveCamera(47, 1, 0.012, 22);
const station = new Station(scene, camera, world);
const sound = new Sound(scene);
sound.load(['select', 'step_hard', 'wood', 'saw', 'driver', 'hammer', 'finish']).catch(() => {});
const colliders = [
  { type: 'box', lo: [-1.32, -0.56], hi: [1.32, 0.56] },
  { type: 'box', lo: [1.83, -2.02], hi: [2.78, -1.4] },
];
let project = replay ? fresh() : restore(),
  working = false,
  quality = 'normal',
  near = false,
  cameraStatus = 'idle',
  saw = new Stroke();
let held = false,
  latched = false,
  previousDown = false,
  point = null,
  handPose = null,
  gripClosed = false,
  grabOffset = null,
  gripPending = false,
  info = '',
  lastSample = 0;
let turn = new Turn(),
  hammer = new HammerStroke(),
  qualityPreview = true,
  measured = null,
  recording = null;
let workView = null,
  movingCamera = false,
  targetView = null,
  wantsWalk = false,
  downDrag = null,
  lastTime = 0,
  stepTravel = 0;
let finishedAt = 0;
let person = new T.Vector3(1.0, 1.58, 2.34),
  yaw = 0,
  pitch = 0,
  demo = null,
  statusMessage = '';
const keys = new Set(),
  eventLog = [];
function aimFrom(pos, look) {
  const d = look.clone().sub(pos).normalize();
  yaw = Math.atan2(-d.x, -d.z);
  pitch = Math.asin(d.y);
}
aimFrom(person, new T.Vector3(0, TOP + 0.1, -0.18));
function placeEyes() {
  camera.position.copy(person);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
}
function setView() {
  if (!workView) return;
  camera.position.copy(workView.pos);
  camera.lookAt(workView.aim);
  camera.updateMatrixWorld();
}
function persist() {
  if (!replay) save(project);
}
function play(role) {
  sound.play(role, role === 'step_hard' ? person : null);
  if (replay) eventLog.push({ role, t: performance.now() });
}
function updatePreview() {
  $('preview').hidden = !(
    working &&
    qualityPreview &&
    !replay &&
    ['ready', 'tracked', 'missing'].includes(cameraStatus)
  );
}
const hands = new Hands(
  $('camera'),
  (pt, marks) => {
    if (!working || document.hidden || $('settings').open) return;
    if (recording && pt) recording.hands++;
    const v = $('camera');
    if (qualityPreview) {
      const sk = $('skeleton');
      if (sk.width !== v.videoWidth || sk.height !== v.videoHeight) {
        sk.width = v.videoWidth || 640;
        sk.height = v.videoHeight || 480;
        $('preview').style.aspectRatio = `${sk.width} / ${sk.height}`;
      }
      drawSkeleton(sk, marks, pt?.down);
    }
    input(pt, marks, v.videoWidth, v.videoHeight);
  },
  (state, msg) => {
    cameraStatus = state;
    statusMessage = msg;
    if (state === 'error') {
      interruptInput();
      $('alert-text').textContent = msg;
      $('alert').hidden = false;
      cancelMeasurement();
    }
    updatePreview();
    updateUI();
  },
  () => (held ? 500 : 180),
);
const gl = renderer.getContext();
const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
hands.preferGPU =
  !!gpuInfo &&
  !/swiftshader|llvmpipe|software|basic render/i.test(
    gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL),
  );

function resetGrip() {
  held = false;
  previousDown = false;
  grabOffset = null;
  gripPending = false;
  gripClosed = false;
  world.classList.remove('gripping');
  handPose = null;
  turn.reset();
  hammer.armed = false;
  point = null;
}
function interruptInput() {
  resetGrip();
  saw.suspend();
}
function cancelMeasurement() {
  if (recording) {
    recording = null;
    $('meter').textContent = '측정이 중단됐어요. 웹캠을 연결한 뒤 다시 시작하세요.';
  }
}
function renew(cutFrom = null, instant = false) {
  resetGrip();
  latched = false;
  saw = new Stroke();
  turn = new Turn();
  hammer = new HammerStroke();
  info = '';
  station.reset(project, working, cutFrom);
  if (working) {
    const v = station.view();
    targetView = v;
    if (instant || !workView) {
      workView = { pos: v.pos.clone(), aim: v.aim.clone() };
      setView();
      movingCamera = false;
    } else movingCamera = true;
  }
  updateUI();
}
function resize() {
  const { w, h } = station.size;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const lo = quality === 'low',
    scale = Math.min(1, (lo ? 960 : 1280) / w, (lo ? 540 : 720) / h);
  renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
  overlay.width = w;
  overlay.height = h;
  blueprint($('drawing'));
  if (working) {
    workView = station.view();
    targetView = workView;
    setView();
    movingCamera = false;
  }
}
for (const s of STEPS) {
  const li = document.createElement('li'),
    i = document.createElement('i'),
    b = document.createElement('span');
  b.textContent = s;
  li.append(i, b);
  $('steps').append(li);
}
new ResizeObserver(resize).observe($('viewport'));
new ResizeObserver(() => blueprint($('drawing'))).observe($('drawing'));
function setText(id, str) {
  const el = $(id);
  if (el.textContent !== str) el.textContent = str;
}
function updateUI() {
  const s = phase(project),
    i = targetIndex(project);
  $('mode').textContent = working ? (s === 6 ? '작품 완성' : '작업 모드') : '공방 탐색';
  const active = working && s < 6;
  const liveText = replay
    ? '시연 · 합성 손 좌표'
    : !active
      ? '웹캠 대기'
      : {
          idle: '웹캠 대기',
          loading: '웹캠 준비 중',
          error: '웹캠 연결 필요',
          ready: '손 대기',
          tracked: '손 추적 중',
          missing: '손을 보여 주세요',
        }[cameraStatus];
  $('live').dataset.engine = hands.active ? (hands.worker ? 'worker' : 'main') : '';
  setText('live', liveText || '웹캠 대기');
  $('live').dataset.ok = active && (replay || cameraStatus === 'tracked') ? '1' : '0';
  setText('step-count', Math.min(s, 6) + ' / 6');
  [...$('steps').children].forEach((li, j) => {
    li.className = j < s ? 'done' : j === s ? 'current' : '';
    li.firstChild.textContent = j < s ? '✓' : String(j + 1).padStart(2, '0');
  });
  let title, guide, button;
  if (!working) {
    title = s === 6 ? '책장이 완성됐어요' : near ? '작업대에 도착했어요' : '작업대로 다가가세요';
    guide =
      s === 6
        ? '방향키와 마우스로 공방을 돌며 책장의 앞면과 뒷면을 살펴보세요.'
        : '방향키로 이동하고, 3D 화면을 클릭한 뒤 마우스로 둘러보세요.';
    button = s === 6 ? '완성품 가까이 보기' : near ? 'E · 작업 시작' : '작업대로 이동 →';
  } else if (s === 6) {
    title = '한 장으로 만든 책장';
    guide = '부품 6개, 나사 6개, 못 4개를 모두 조립했어요.';
    button = '공방에서 둘러보기';
  } else {
    const headings = [
      '원판을 작업대에 놓으세요',
      (PARTS[i]?.name || '') + ' 재단',
      '' + (PARTS[i]?.name || '') + ' 놓기',
      ['왼쪽', '오른쪽'][i < 3 ? 0 : 1] + ' 옆면 나사 조이기',
      '뒤쪽 보강판 놓기',
      '보강판에 못 박기',
    ];
    title =
      headings[s] +
      (s === 1
        ? ' · ' + (i + 1) + '/5'
        : s === 3
          ? ' · ' + (i + 1) + '/6'
          : s === 5
            ? ' · ' + (i + 1) + '/4'
            : '');
    if (gripPending) guide = '손을 쥔 채 잡기 표시로 이동하세요.';
    else if (s === 0 || s === 2 || s === 4)
      guide = held
        ? station.canPlace()
          ? '손을 펴서 판자를 놓으세요.'
          : '판자를 반투명 윤곽에 맞춰 옮기세요.'
        : '판자 위에서 주먹을 쥐거나 엄지와 검지를 맞대세요.';
    else if (!held && !latched) guide = '공구 손잡이 위에서 주먹을 쥐거나 엄지와 검지를 맞대세요.';
    else if (s === 1)
      guide =
        '톱을 ' +
        (saw.arrivals % 2 ? 'B까지 미세요.' : 'A로 가져오세요.') +
        '   왕복 ' +
        saw.rounds +
        ' / 2';
    else if (s === 3)
      guide = !latched
        ? '손을 빈 원으로 옮겨 드라이버 끝을 나사에 맞추세요.'
        : held
          ? '원 둘레를 따라 시계 방향으로 돌리세요. 다시 잡아 이어갈 수 있어요.'
          : '원 오른쪽 점에서 다시 집고 시계 방향으로 돌리세요.';
    else if (s === 5)
      guide =
        (hammer.armed ? '망치를 왼쪽으로 밀어 못을 치세요.' : '망치를 오른쪽 점선까지 당기세요.') +
        '   ' + project.nails[i] + ' / 3타';
    if (info) guide = info;
    if (!replay && cameraStatus === 'missing')
      guide = '손을 카메라 안에 다시 보여 주세요. 손을 편 뒤 다시 집으세요.';
    if (!replay && ['loading', 'ready', 'error'].includes(cameraStatus)) guide = statusMessage;
    button = 'Esc · 공방으로';
  }
  setText(
    'eyebrow',
    working && s < 6
      ? '단계 ' + String(s + 1).padStart(2, '0') + '  /  06'
      : working
        ? '제작 완료'
        : '공방 탐색',
  );
  setText('action-title', title);
  setText('instruction', guide);
  setText('action', button);
  $('measure').disabled = !(working && !replay && hands.active && !recording);
  $('reset-stage').disabled = !active;
  updatePreview();
}
function proximity() {
  return Math.abs(person.x) < 1.54 && person.z > 0.53 && person.z < 1.67;
}
function enter() {
  if (working) return;
  wantsWalk = false;
  keys.clear();
  downDrag = null;
  if (document.pointerLockElement) document.exitPointerLock();
  working = true;
  workView = null;
  renew(null, true);
  sound.resume();
  if (phase(project) !== 6 && !replay) hands.start();
}
function leave() {
  if (!working) return;
  cancelMeasurement();
  hands.stop();
  $('alert').hidden = true;
  cameraStatus = 'idle';
  working = false;
  workView = null;
  renew();
  placeEyes();
  near = proximity();
  updateUI();
}
function complete(edit, role, cutFrom = null) {
  edit();
  persist();
  play(role);
  renew(cutFrom);
  if (phase(project) === 6) {
    finishedAt = performance.now();
    hands.stop();
    cameraStatus = 'idle';
    cancelMeasurement();
    play('finish');
    updateUI();
  }
}
function input(pt, marks, width, height) {
  const now = performance.now();
  lastSample = now;
  if (!working || phase(project) === 6) return;
  if (!pt) {
    if (point || previousDown) interruptInput();
    cameraStatus = 'missing';
    updateUI();
    return;
  }
  cameraStatus = 'tracked';
  const g = station.guides(),
    s = station.s;
  const size = station.size;
  const p = workPoint(pt, size, width || size.w, height || size.h);
  point = p;
  handPose = marks ? { marks, x: pt.palmX, y: pt.palmY, width, height } : null;
  gripClosed = pt.down;
  world.classList.toggle('gripping', gripClosed);
  const press = pt.down && !previousDown,
    release = !pt.down && previousDown;
  previousDown = pt.down;
  if (press) {
    gripPending = true;
    info = '';
  }
  if (movingCamera || now < station.transitionUntil) {
    if (release) gripPending = false;
    updateUI();
    return;
  }
  if (pt.down && gripPending) {
    const center = g.item || g.pick;
    const nearGrip = center && distance(p, center) <= g.pickRadius;
    if (station.moving && (nearGrip || station.canGrab(p))) {
      const on = station.onPlane(p);
      if (on) {
        grabOffset = station.moving.position.clone().sub(on);
        held = true;
      }
    } else if (!station.moving && (nearGrip || (s === 3 && latched && distance(p, g.c) < g.r * 1.65))) {
      held = true;
      play('select');
    }
    if (held) gripPending = false;
  }
  if (held && station.moving) {
    if (pt.down) {
      const on = station.onPlane(p);
      if (on && grabOffset) station.moving.position.copy(on.add(grabOffset));
    } else if (release) {
      if (station.canPlace()) {
        complete(() => {
          if (s === 0) project.stockPlaced = true;
          else if (s === 2) project.placed++;
          else project.back = true;
        }, 'wood');
        return;
      }
      info = '조금 더 가까이 놓아 주세요. 판자를 다시 집을 수 있어요.';
    }
  } else if (held && pt.down && s === 1) {
    if (saw.update(p, g.a, g.b, Math.max(34, distance(g.a, g.b) * 0.5))) {
      if (saw.arrivals > 1) play('saw');
      if (saw.done) {
        const x = station.cutX;
        complete(() => project.cuts++, 'wood', { x });
        return;
      }
    }
  } else if (held && pt.down && s === 3) {
    if (!latched && distance(p, g.align) < Math.max(20, g.r * 0.38)) {
      latched = true;
      play('select');
      turn.reset();
    } else if (latched) {
      const i = station.idx,
        old = project.screws[i],
        value = Math.min(180, old + turn.update(p, g.c, g.r));
      if (value > old) {
        project.screws[i] = value;
        station.hardware.update(value / 180);
        persist();
        if (Math.floor(value / 45) > Math.floor(old / 45)) play('driver');
        if (value === 180) {
          complete(() => {}, 'wood');
          return;
        }
      }
    }
  } else if (held && pt.down && s === 5 && hammer.update(p, g.strike, g.pull, g.tolerance)) {
    const i = station.idx;
    project.nails[i]++;
    station.hardware.update(project.nails[i] / 3);
    if (project.nails[i] === 3) {
      complete(() => {}, 'hammer');
      return;
    }
    persist();
    play('hammer');
  }
  if (release) {
    held = false;
    grabOffset = null;
    turn.reset();
    hammer.armed = false;
    gripPending = false;
    if (s === 1) saw.suspend();
  }
  updateUI();
}
function walk(dt) {
  let f = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown')),
    r = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  let dx = -Math.sin(yaw) * f + Math.cos(yaw) * r,
    dz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
  if (wantsWalk) {
    const dest = new T.Vector3(0, person.y, 1.2);
    const d = dest.sub(person);
    if (d.length() < 0.09) {
      wantsWalk = false;
      aimFrom(person, new T.Vector3(0, TOP, -0.1));
    } else {
      dx = d.x;
      dz = d.z;
    }
  }
  const len = Math.hypot(dx, dz);
  if (len > 0.001) {
    const step = 1.48 * dt;
    person.x += (dx / len) * step;
    person.z += (dz / len) * step;
    pushOut(person, 0.19, colliders);
    person.x = clamp(person.x, -2.7, 2.7);
    person.z = clamp(person.z, -2.51, 2.5);
    stepTravel += step;
    if (stepTravel > 0.57) {
      play('step_hard');
      stepTravel = 0;
    }
  }
  placeEyes();
  const ok = proximity();
  if (ok !== near) {
    near = ok;
    updateUI();
  }
}
$('action').onclick = () => {
  sound.resume();
  if (working) leave();
  else if (near || phase(project) === 6) enter();
  else wantsWalk = true;
};
world.onpointerdown = (e) => {
  if (working || $('settings').open) return;
  sound.resume();
  downDrag = { x: e.clientX, y: e.clientY };
  try {
    world.requestPointerLock()?.catch(() => {});
  } catch {}
};
window.addEventListener('pointerup', () => {
  downDrag = null;
});
window.addEventListener('mousemove', (e) => {
  if (working || $('settings').open) return;
  let dx, dy;
  if (document.pointerLockElement === world) {
    dx = e.movementX;
    dy = e.movementY;
  } else if (downDrag) {
    dx = e.clientX - downDrag.x;
    dy = e.clientY - downDrag.y;
    downDrag = { x: e.clientX, y: e.clientY };
  } else return;
  yaw -= dx * 0.0023;
  pitch = clamp(pitch - dy * 0.0023, -1.38, 1.32);
});
window.addEventListener('keydown', (e) => {
  if ($('settings').open || ['SELECT', 'INPUT'].includes(e.target.tagName)) return;
  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    if (!working) {
      keys.add(e.key);
      wantsWalk = false;
    }
  }
  if (e.code === 'KeyE' && !e.repeat && !working && proximity()) enter();
  if (e.key === 'Escape' && working) leave();
  if (e.code === 'KeyM' && !e.repeat) $('mute').click();
});
window.addEventListener('keyup', (e) => keys.delete(e.key));
window.addEventListener('blur', () => {
  keys.clear();
  downDrag = null;
  hands.pinch.reset();
  interruptInput();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && working) {
    interruptInput();
    cancelMeasurement();
    hands.pinch.reset();
  }
});
$('options').onclick = () => {
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear();
  interruptInput();
  $('settings').showModal();
  updateUI();
};
$('settings').addEventListener('close', () => {
  hands.pinch.reset();
  interruptInput();
});
$('mute').onclick = () => {
  sound.resume();
  sound.toggleMute();
  $('mute').textContent = sound.muted ? '소리 꺼짐' : '소리 켜짐';
  $('mute').setAttribute('aria-pressed', String(sound.muted));
};
$('retry-camera').onclick = () => {
  $('alert').hidden = true;
  interruptInput();
  hands.start();
};
$('show-preview').onchange = (e) => {
  qualityPreview = e.target.checked;
  updatePreview();
};
$('quality').onchange = (e) => {
  quality = e.target.value;
  hands.setQuality(quality === 'low');
  cancelMeasurement();
  resize();
};
$('reset-stage').onclick = () => {
  if (!working || phase(project) === 6) return;
  const s = phase(project),
    i = targetIndex(project);
  if (s === 3) project.screws[i] = 0;
  if (s === 5) project.nails[i] = 0;
  persist();
  renew(null, true);
  $('settings').close();
};
function startOver() {
  if (!confirm('현재 제작 기록을 지우고 새 판자로 시작할까요?')) return;
  const settings = $('settings');
  if (settings.open) settings.close();
  project = fresh();
  persist();
  finishedAt = 0;
  if (demo) {
    demo.reset();
    eventLog.length = 0;
  }
  if (!working) {
    enter();
    return;
  }
  cancelMeasurement();
  $('alert').hidden = true;
  renew(null, true);
  if (!replay) hands.start();
}
$('restart').onclick = startOver;
$('new').onclick = startOver;
$('measure').onclick = () => {
  if (!hands.active || !working || replay) return;
  recording = { start: performance.now(), frames: [], hands: 0, last: 0 };
  $('meter').textContent = '측정 중 · 작업을 계속해 주세요.';
  $('settings').close();
  updateUI();
};
function measure(t) {
  if (!recording) return;
  if (recording.last) recording.frames.push(t - recording.last);
  recording.last = t;
  if (t - recording.start < 60000) return;
  const data = recording;
  recording = null;
  const sorted = data.frames.sort((a, b) => a - b);
  const med = 1000 / sorted[Math.floor(sorted.length / 2)],
    hz = (1000 * data.hands) / (t - data.start);
  measured =
    world.width +
    ' × ' +
    world.height +
    ' · 중앙값 ' +
    med.toFixed(1) +
    ' FPS · 손 좌표 ' +
    hz.toFixed(1) +
    '회/초';
  $('meter').textContent = measured;
  updateUI();
}
function frame(t) {
  const dt = Math.min(0.05, Math.max(0, (t - lastTime) / 1000));
  lastTime = t;
  if (!working) {
    if (!$('settings').open) walk(dt);
  } else if (movingCamera) {
    const a = 1 - Math.exp(-dt * 15);
    workView.pos.lerp(targetView.pos, a);
    workView.aim.lerp(targetView.aim, a);
    if (
      workView.pos.distanceTo(targetView.pos) < 0.002 &&
      workView.aim.distanceTo(targetView.aim) < 0.002
    ) {
      workView.pos.copy(targetView.pos);
      workView.aim.copy(targetView.aim);
      movingCamera = false;
    }
    setView();
  }
  if (working && !replay && cameraStatus === 'tracked' && t - lastSample > 700) {
    hands.pinch.reset();
    input(null);
  }
  if (replay && working && phase(project) === 6 && !movingCamera && finishedAt) {
    const aim = workView.aim,
      base = targetView.pos.clone().sub(aim);
    base.applyAxisAngle(new T.Vector3(0, 1, 0), Math.max(0, t - finishedAt - 800) * 0.00047);
    camera.position.copy(aim).add(base);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
  }
  station.tick(t);
  if (replay && demo && !$('settings').open) demo.tick(t);
  const guides = working ? station.guides() : {};
  if (working) station.paintTool(guides, held, latched, point);
  const bp = new T.Vector3(0, TOP + 0.12, -0.03),
    cp = bp.clone().project(camera);
  drawGuides(ctx, {
    s: station.s,
    g: guides,
    held,
    latched,
    point,
    handPose,
    gripClosed,
    station,
    work: working,
    near,
    rounds: saw.rounds,
    sawTowardB: saw.arrivals % 2 === 1,
    hammerArmed: hammer.armed,
    benchPoint: cp.z > -1 && cp.z < 1 ? station.screen(bp) : null,
  });
  sound.time = t / 1000;
  sound.setListener(camera.position, camera.quaternion);
  renderer.render(scene, camera);
  measure(t);
}
renew();
placeEyes();
resize();
renderer.setAnimationLoop(frame);
if (replay) {
  const { Rehearsal } = await import('./workshop/replay.js');
  const access = {
    project: () => project,
    station,
    enter,
    input,
    ready: () => !movingCamera && !station.tweens.length,
    state: () => ({
      working,
      held,
      latched,
      point,
      rounds: saw.rounds,
      arrivals: saw.arrivals,
      armed: hammer.armed,
    }),
    sound: () => sound.resume(),
  };
  demo = new Rehearsal(access);
  if (new URLSearchParams(location.search).has('test'))
    window.workshopTest = {
      ...access,
      demo,
      eventLog,
      leave,
      captureAudio: () => {
        const dest = sound.listener.context.createMediaStreamDestination();
        sound.listener.getInput().connect(dest);
        sound.resume();
        return dest.stream;
      },
    };
}
