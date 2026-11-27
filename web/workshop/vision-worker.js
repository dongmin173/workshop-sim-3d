// Classic worker: the pinned Emscripten glue calls importScripts to load WASM.
let task;
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init'){
      const { FilesetResolver, HandLandmarker }=await import('../vendor/vision/vision_bundle.mjs');
      const root=new URL('../vendor/vision/',self.location.href).href;
      const files=await FilesetResolver.forVisionTasks(root+'wasm');
      task=await HandLandmarker.createFromOptions(files,{canvas:new OffscreenCanvas(1,1),
        baseOptions:{modelAssetPath:root+'hand_landmarker.task',delegate:'CPU'},
        runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.5,minTrackingConfidence:.5});
      self.postMessage({type:'ready'});
    }else if(data.type==='frame'){
      try {
        const result=task.detectForVideo(data.frame,data.time);
        self.postMessage({type:'hand',marks:result.landmarks[0]||null,time:data.time});
      }finally {data.frame.close();}
    }
  }catch(e){self.postMessage({type:'error',message:String(e.message||e)});}
};

