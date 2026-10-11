"use strict";
const engine=require("../frontend/v03/engine.js");
let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>input+=chunk);process.stdin.on("end",()=>{try{const p=JSON.parse(input),data=p.data||p,mode=p.mode||"compare";if(!["compare","baseline","optimized"].includes(mode))throw Error("计算模式无效");const result=mode==="compare"?{baseline:engine.solve(data,"baseline"),optimized:engine.solve(data)}:engine.solve(data,mode);process.stdout.write(JSON.stringify({result}));}catch(error){process.stdout.write(JSON.stringify({error:error.message}));process.exitCode=1;}});
