import { Pinch } from './project.js';
const root = new URL('../vendor/vision/', import.meta.url).href;
const messages = {
  NotAllowedError: '카메라 권한이 꺼져 있어요. 주소창의 카메라 설정에서 허용한 뒤 다시 연결하세요.',
  NotFoundError: '연결된 웹캠을 찾지 못했어요. 카메라를 연결한 뒤 다시 시도하세요.',
  NotReadableError: '웹캠을 열 수 없어요. 카메라를 사용하는 앱을 닫고 다시 연결하세요.',
};
export class Hands {
  constructor(video, onFrame, onStatus) {
    this.video = video;
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.pinch = new Pinch();
    this.generation = 0;
    this.hz = 14;
    this.active = false;
    this.frameId = 0;
  }
  async start() {
    this.stop();
    const gen = this.generation;
    this.onStatus('loading', '웹캠을 연결하는 중');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error('localhost 또는 HTTPS로 접속해 주세요.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      if (gen !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      if (gen !== this.generation) return;
      for (const track of stream.getVideoTracks())
        track.onended = () => this.fail(gen, '웹캠 연결이 끊겼어요. 다시 연결해 주세요.');
      this.onStatus('loading', '손 인식 모델 준비 중');
      try {
        await this.loadWorker(gen);
      } catch (e) {
        if (gen !== this.generation) return;
        this.worker?.terminate();
        this.worker = null;
        const { FilesetResolver, HandLandmarker } = await import(
          '../vendor/vision/vision_bundle.mjs'
        );
        const files = await FilesetResolver.forVisionTasks(root + 'wasm');
        const task = await HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: root + 'hand_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        });
        if (gen !== this.generation) {
          task.close();
          return;
        }
        this.mainTask = task;
      }
      if (gen !== this.generation) return;
      this.active = true;
      this.busy = false;
      this.lastTime = 0;
      this.lastVideo = -1;
      this.onStatus('ready', '손을 펴서 웹캠에 보여 주세요');
      this.schedule(gen);
    } catch (e) {
      this.fail(gen, messages[e.name] || e.message || '카메라를 연결할 수 없어요.');
    }
  }
  loadWorker(gen) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./vision-worker.js', import.meta.url));
      this.worker = worker;
      const timeout = setTimeout(() => reject(Error('worker init timeout')), 20000);
      this.cancelInit = () => {
        clearTimeout(timeout);
        reject(Error('cancelled'));
      };
      worker.onerror = (e) => {
        clearTimeout(timeout);
        if (this.active) this.fail(gen, '손 인식이 중단됐어요. 다시 연결해 주세요.');
        else reject(Error(e.message));
      };
      worker.onmessage = ({ data }) => {
        if (gen !== this.generation) return;
        if (data.type === 'ready') {
          clearTimeout(timeout);
          this.cancelInit = null;
          resolve();
        } else if (data.type === 'error') {
          clearTimeout(timeout);
          if (this.active) this.fail(gen, '손 인식이 중단됐어요. 다시 연결해 주세요.');
          else reject(Error(data.message));
        } else if (data.type === 'hand') {
          this.busy = false;
          this.deliver(data.marks, data.time);
        }
      };
      worker.postMessage({ type: 'init' });
    });
  }
  deliver(marks, time) {
    if (!marks) this.pinch.reset();
    const pt = marks
      ? this.pinch.read(marks, this.video.videoWidth, this.video.videoHeight, time)
      : null;
    this.onFrame(pt, marks);
  }
  schedule(gen) {
    const loop = async (time) => {
      if (!this.active || gen !== this.generation) return;
      this.frameId = requestAnimationFrame(loop);
      if (
        this.busy ||
        this.video.readyState < 2 ||
        time - this.lastTime < 1000 / this.hz ||
        this.video.currentTime === this.lastVideo
      )
        return;
      this.busy = true;
      this.lastTime = time;
      this.lastVideo = this.video.currentTime;
      try {
        if (this.worker) {
          const frame = await createImageBitmap(this.video);
          if (gen !== this.generation) {
            frame.close();
            return;
          }
          this.worker.postMessage({ type: 'frame', frame, time }, [frame]);
        } else {
          const r = this.mainTask.detectForVideo(this.video, time);
          this.busy = false;
          this.deliver(r.landmarks[0] || null, time);
        }
      } catch (e) {
        this.fail(gen, '웹캠 영상을 처리할 수 없어요. 다시 연결해 주세요.');
      }
    };
    this.frameId = requestAnimationFrame(loop);
  }
  fail(gen, msg) {
    if (gen !== this.generation) return;
    this.stop();
    this.onStatus('error', msg);
  }
  stop() {
    this.generation++;
    this.active = false;
    this.busy = false;
    cancelAnimationFrame(this.frameId);
    this.cancelInit?.();
    this.cancelInit = null;
    this.worker?.terminate();
    this.worker = null;
    this.mainTask?.close();
    this.mainTask = null;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.pinch.reset();
  }
}
