// Classic worker: the pinned Emscripten glue calls importScripts to load WASM.
let task;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const { FilesetResolver, HandLandmarker } = await import(
        '../vendor/vision/vision_bundle.mjs'
      );
      const root = new URL('../vendor/vision/', self.location.href).href;
      const files = await FilesetResolver.forVisionTasks(root + 'wasm');
      const build = (delegate) =>
        HandLandmarker.createFromOptions(files, {
          canvas: new OffscreenCanvas(1, 1),
          baseOptions: { modelAssetPath: root + 'hand_landmarker.task', delegate },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      let delegate = data.preferGPU ? 'GPU' : 'CPU';
      try {
        task = await build(delegate);
      } catch (error) {
        if (delegate === 'CPU') throw error;
        delegate = 'CPU';
        task = await build(delegate);
      }
      self.postMessage({ type: 'ready', delegate });
    } else if (data.type === 'frame') {
      try {
        const result = task.detectForVideo(data.frame, data.time);
        self.postMessage({ type: 'hand', marks: result.landmarks[0] || null, time: data.time });
      } finally {
        data.frame.close();
      }
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e.message || e) });
  }
};
