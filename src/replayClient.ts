import type {ReplayInput,ReplayOutcome} from './replayTasks.ts';
export type {ReplayInput,ReplayOutcome};
export interface ReplayOptions {signal?:AbortSignal;timeoutMs?:number}
export type ReplayRunner=(input:ReplayInput,options?:ReplayOptions)=>Promise<ReplayOutcome>;
export const REPLAY_TIMEOUT_MS=30_000;
export type ReplayWorker=Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'|'onmessageerror'>;

export function createReplayRunner(factory:()=>ReplayWorker):ReplayRunner{
 return(input,options={})=>new Promise((resolve,reject)=>{
  if(options.signal?.aborted){reject(new Error('已取消读档'));return;}
  let worker:ReplayWorker;
  try{worker=factory();}catch{reject(new Error('无法启动安全读档线程，请更新浏览器后重试'));return;}
  let finished=false;
  const finish=(error?:Error,result?:ReplayOutcome)=>{
   if(finished)return;finished=true;clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);
   worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();
   if(error)reject(error);else resolve(result!);
  };
  const cancel=()=>finish(new Error('已取消读档'));
  const timer=setTimeout(()=>finish(new Error('读档超时，已停止回放。可保留原档后重试')),options.timeoutMs??REPLAY_TIMEOUT_MS);
  options.signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=(event:MessageEvent<{ok:boolean;result?:ReplayOutcome;error?:string}>)=>{
   if(event.data.ok&&event.data.result)finish(undefined,event.data.result);else finish(new Error(event.data.error??'存档回放失败'));
  };
  worker.onerror=()=>finish(new Error('读档线程启动或运行失败，原档未改写'));
  worker.onmessageerror=()=>finish(new Error('读档结果无法读取，原档未改写'));
  try{worker.postMessage(input);}catch{finish(new Error('存档无法交给读档线程，原档未改写'));}
 });
}
export const runReplay:ReplayRunner=createReplayRunner(()=>new Worker(new URL('./saveWorker.ts',import.meta.url),{type:'module'}));
