import {describe,expect,it,vi} from 'vitest';
import {runInNewContext} from 'node:vm';
import {offlineWorker} from '../scripts/offline-template.ts';
function harness(){
 const handlers:Record<string,(e:any)=>void>={};
 const shell=new Response('<html>cached generation</html>');
 const asset=new Response('cached asset');
 const network=vi.fn(()=>Promise.reject(new Error('offline')));
 const match=vi.fn(async (request:any,options?:any)=>typeof request==='string'?shell:options?.ignoreVary?asset:undefined);
 runInNewContext(offlineWorker('test',['./index.html','./assets/app.js']),{URL,Response,fetch:network,self:{registration:{scope:'http://localhost/game/'},location:new URL('http://localhost/game/sw.js'),clients:{claim:()=>Promise.resolve()},addEventListener:(name:string,fn:any)=>handlers[name]=fn},caches:{open:()=>Promise.resolve({match,addAll:()=>Promise.resolve()}),keys:()=>Promise.resolve([])}});
 const call=(url:string,mode='cors',method='GET')=>{let response:Promise<Response>|undefined;handlers.fetch({request:{url,mode,method},respondWith:(p:Promise<Response>)=>response=p});return response;};
 return {call,network,match};
}
describe('离线缓存世代与静态资源',()=>{
 it('导航始终使用同一代缓存 HTML，不混用服务器上的新版壳',async()=>{const h=harness();expect(await (await h.call('http://localhost/game/','navigate'))?.text()).toBe('<html>cached generation</html>');expect(h.network).not.toHaveBeenCalled();});
 it('离线命中带 Vary: Origin 的预缓存模块与样式',async()=>{const h=harness();expect(await (await h.call('http://localhost/game/assets/app.js'))?.text()).toBe('cached asset');expect(h.match).toHaveBeenCalledWith(expect.anything(),{ignoreSearch:true,ignoreVary:true});expect(h.network).not.toHaveBeenCalled();});
 it('不拦截跨域、scope外及非GET请求',()=>{const h=harness();expect(h.call('http://other.example/app.js')).toBeUndefined();expect(h.call('http://localhost/other/')).toBeUndefined();expect(h.call('http://localhost/game/data','cors','POST')).toBeUndefined();});
});
