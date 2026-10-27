import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
import {Assets,type Texture} from 'pixi.js';
import {loadArt} from '../src/render/art.ts';
vi.mock('pixi.js',()=>({Assets:{load:vi.fn()}}));
const pages=[{density:1,json:'atlas@1x-0.json'},...Array.from({length:3},(_,i)=>({density:2,json:`atlas@2x-${i}.json`}))];
beforeEach(()=>{
 vi.stubGlobal('window',{devicePixelRatio:2,location:{href:'http://localhost/game/'}});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({pages}))));
 vi.mocked(Assets.load).mockReset();
 vi.mocked(Assets.load).mockResolvedValue({textures:{sample:{} as Texture}});
});
afterEach(()=>vi.unstubAllGlobals());
describe('正式图集按密度加载与失效隔离',()=>{
 it('默认读取屏幕像素密度，高密度只请求@2x页',async()=>{
  await loadArt();expect(vi.mocked(Assets.load).mock.calls.map(c=>c[0])).toEqual(pages.filter(p=>p.density===2).map(p=>'http://localhost/art/'+p.json));
 });
 it('1倍屏默认只读取@1x，不同时下载两个档位',async()=>{
  vi.stubGlobal('window',{devicePixelRatio:1,location:{href:'http://localhost/game/'}});await loadArt();
  expect(Assets.load).toHaveBeenCalledExactlyOnceWith('http://localhost/art/atlas@1x-0.json');
 });
 it('单页加载失败不丢弃其余正常页',async()=>{
  vi.mocked(Assets.load).mockImplementation(async url=>{if(String(url).endsWith('-1.json'))throw Error('PNG or JSON failed');return {textures:{[String(url)]:{} as Texture}};});
  const textures=await loadArt(2,'./art/');expect(Object.keys(textures)).toEqual(expect.arrayContaining(['http://localhost/game/art/atlas@2x-0.json','http://localhost/game/art/atlas@2x-2.json']));expect(Object.keys(textures)).toHaveLength(2);expect(Assets.load).toHaveBeenCalledTimes(3);
 });
 it.each(['http','network','json'])('清单%s失败返回空贴图供程序回退，不中断地图启动',async failure=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{if(failure==='network')throw Error('offline');return failure==='json'?new Response('not json'):new Response('',{status:404});}));
  expect(await loadArt()).toEqual({});expect(Assets.load).not.toHaveBeenCalled();
 });
 it('正式两档图集素材齐全、PNG字节一致且@2x总大小不超过8MB',()=>{
  const manifest=JSON.parse(readFileSync('public/art/atlas-manifest.json','utf8'));
  const formal=JSON.parse(readFileSync('art/manifest.json','utf8')).assets.map((a:{id:string})=>a.id);
  const assets=new Map<number,Set<string>>([[1,new Set()],[2,new Set()]]);let bytes=0;
  for(const page of manifest.pages){
   const sheet=JSON.parse(readFileSync('public/art/'+page.json,'utf8'));expect(sheet.meta.scale).toBe(String(page.density));expect(statSync('public/art/'+page.png).size).toBe(page.bytes);
   for(const id of Object.keys(sheet.frames)){expect(assets.get(page.density)!.has(id)).toBe(false);assets.get(page.density)!.add(id);}
   if(page.density===2)bytes+=page.bytes;
  }
  expect(bytes).toBeLessThanOrEqual(8*1024*1024);expect(assets.get(1)).toEqual(new Set(formal));expect(assets.get(2)).toEqual(new Set(formal));
 });
});
