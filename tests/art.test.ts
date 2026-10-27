import {describe,expect,it} from 'vitest';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {boundsOf,cleanBackground,detectFootprint,prepareAsset,packAssets,type AssetSpec,type Pixels} from '../scripts/art-core.ts';
import {buildArt} from '../scripts/art-pipeline.ts';
const spec:AssetSpec={id:'building_test_2x2_a',file:'test.png',cells:2,kind:'building'};
function diamond(ratio=2):Pixels {
 const width=200,height=180,data=new Uint8Array(width*height*4),baseWidth=160,baseHeight=baseWidth/ratio,cx=100,cy=125;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(Math.abs((x-cx)/(baseWidth/2))+Math.abs((y-cy)/(baseHeight/2))<=1 || (x>=80&&x<=120&&y>=20&&y<125)){
  const i=(y*width+x)*4;data[i]=190;data[i+1]=175;data[i+2]=150;data[i+3]=255;
 }
 return {data,width,height};
}
describe('素材处理管线',()=>{
 it('透明alpha保留；洋红去底并去除混色边缘',()=>{
  const p={width:4,height:1,data:new Uint8Array([255,0,255,255,220,110,220,255,20,70,100,128,80,90,100,0])};
  const out=cleanBackground(p);expect(out.data[3]).toBe(0);expect(out.data[7]).toBeLessThan(255);expect(out.data[4]-out.data[5]).toBeLessThan(10);expect([...out.data.slice(8,12)]).toEqual([20,70,100,128]);expect([...out.data.slice(12)]).toEqual([0,0,0,0]);
 });
 it('不把白底黑底或整张不透明图片误认成透明素材',()=>{expect(()=>cleanBackground({width:1,height:1,data:new Uint8Array([0,0,0,255])})).toThrow('背景不是');});
 it('从底座前边推导下顶点，不用整栋楼的宽高比冒充菱形比例',()=>{const p=diamond(),g=detectFootprint(p,spec);expect(g.ratio).toBeCloseTo(2,1);expect(g.anchor.x).toBeCloseTo(100,0);expect(g.anchor.y).toBeCloseTo(165,0);expect(boundsOf(p).height/boundsOf(p).width).not.toBeCloseTo(.5,1);});
 it('底座偏离2:1超过5%时直接报错',()=>{expect(()=>detectFootprint(diamond(1.7),spec)).toThrow('超过 5%');expect(()=>detectFootprint(diamond(2.3),spec)).toThrow('超过 5%');});
 it('旧版住宅底座不合规时不悄悄放宽阈值',async()=>{await expect(prepareAsset('art/raw/rejected/residential-tower-v2.png',spec,2)).rejects.toThrow('超过 5%');});
 it('@2x/@1x底座宽512/256，锚点随裁剪与归一化缩放，图像高度符合规范',async()=>{
  const a=await prepareAsset('art/raw/building_tower_2x2_a.png',spec,2),b=await prepareAsset('art/raw/building_tower_2x2_a.png',spec,1);
  expect(Math.abs(a.width/b.width-2)).toBeLessThan(.01);expect(Math.abs(a.height/b.height-2)).toBeLessThan(.01);
  expect(a.anchor.x).toBeCloseTo(b.anchor.x,2);expect(a.anchor.y).toBeCloseTo(b.anchor.y,2);expect(a.footprint.deviation).toBeLessThan(.05);expect(a.height).toBeLessThan(512*1.3);
  const data=await sharp(a.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});const detected=detectFootprint({data:data.data,width:data.info.width,height:data.info.height},spec);expect(detected.width).toBeCloseTo(512,-1);expect(detected.ratio).toBeCloseTo(2,1);
 });
 it('地形按真实侧面识别顶面，输出@2x侧面32px，顶点落在128px处',async()=>{
  const s:AssetSpec={id:'terrain_grass_1x1_a',file:'terrain_grass_1x1_a.png',kind:'terrain',cells:1,sideHeightRatio:.125};
  const a=await prepareAsset('art/raw/'+s.file,s,2);expect(a.footprint.ratio).toBeCloseTo(2,1);expect(a.footprint.sideHeight).toBeGreaterThan(0);
  expect(a.anchor.y*a.height).toBeGreaterThanOrEqual(128);expect(a.anchor.y*a.height).toBeLessThan(129);expect(a.height-a.anchor.y*a.height).toBeGreaterThanOrEqual(32);expect(a.height-a.anchor.y*a.height).toBeLessThan(33);
 });
 it('分页打包无重叠，不旋转锚点；过大的素材拒绝',async()=>{
  const a=await prepareAsset('art/raw/building_tower_2x2_a.png',spec,1),assets=Array.from({length:7},(_,i)=>({...a,spec:{...spec,id:`item${i}`}}));const packed=packAssets(assets,600);
  expect(packed.pages.length).toBeGreaterThan(1);
  for(const p of packed.placements)for(const q of packed.placements)if(p!==q&&p.page===q.page)expect(p.x+p.asset.width<=q.x||q.x+q.asset.width<=p.x||p.y+p.asset.height<=q.y||q.y+q.asset.height<=p.y).toBe(true);
  expect(()=>packAssets([{...a,width:900}],600)).toThrow('尺寸限制');
 });
 it('构建真实PNG+Pixi帧JSON；失败时不覆盖已生成图集',async()=>{
  const out=await mkdtemp(join(tmpdir(),'fdc-art-'));
  try{
   // 用固定的真实原图覆盖建筑/地形/装饰，避免测试耗时随着正式素材清单增长。
   const fixture=join(out,'fixture.json');
   await writeFile(fixture,JSON.stringify({assets:[
    {...spec,id:'building_tower_2x2_a',file:'building_tower_2x2_a.png'},
    {id:'terrain_grass_1x1_a',file:'terrain_grass_1x1_a.png',cells:1,kind:'terrain',sideHeightRatio:.125},
    {id:'decor_lamp_1x1_a',file:'decor_lamp_1x1_a.png',cells:1,kind:'decoration',groundCoverage:.2,maxHeightRatio:.5},
   ]}));
   const result=await buildArt({out,manifest:fixture});expect(result.bytes2x).toBeLessThan(8*1024*1024);
   for(const page of result.pages){const json=JSON.parse(await readFile(join(out,page.json),'utf8'));expect(json.meta.scale).toBe(String(page.density));const frame=json.frames.building_tower_2x2_a;expect(frame.anchor.y).toBeLessThanOrEqual(1.01);const info=await sharp(join(out,page.png)).metadata();expect(info.width).toBe(json.meta.size.w);}
   const before=await readFile(join(out,'atlas@2x-0.png'));const bad=join(out,'bad.json');await writeFile(bad,JSON.stringify({assets:[{...spec,file:'rejected/residential-tower-v2.png'}]}));await expect(buildArt({out,manifest:bad})).rejects.toThrow();expect(await readFile(join(out,'atlas@2x-0.png'))).toEqual(before);
  }finally{await rm(out,{recursive:true,force:true});}
 });
});
