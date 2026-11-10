import {runReplayTask,type ReplayInput} from './replayTasks.ts';
// 每次回放使用独立线程，取消/超时由主线程 terminate，不留后台循环。
self.onmessage=async(event:MessageEvent<ReplayInput>)=>{
 try{self.postMessage({ok:true,result:await runReplayTask(event.data)});}
 catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:'存档回放失败'});}
};
