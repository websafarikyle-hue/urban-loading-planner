importScripts("engine.js");
self.onmessage=e=>{try{const {data,mode="compare",request_id}=e.data;const result=mode==="compare"?{baseline:UrbanEngine.solve(data,"baseline"),optimized:UrbanEngine.solve(data)}:UrbanEngine.solve(data,mode);self.postMessage({request_id,result});}catch(error){self.postMessage({request_id:e.data.request_id,error:error.message});}};
