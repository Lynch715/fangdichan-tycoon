import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {roadAt,tileArtAt,TILE_SIDE_HEIGHT} from '../src/render/terrain.ts';
import {terrainAt,MAP_SIZE} from '../src/sim/map.ts';
import {detectFootprint,type Pixels} from '../scripts/art-core.ts';
const catalog=JSON.parse(readFileSync('art/catalog-a3.json','utf8')).assets as {id:string}[];
describe('地形贴图选择',()=>{
 it('两张地图所有视觉素材都来自完整清单，不调用模拟随机数',()=>{
  const allowed=new Set(catalog.map(a=>a.id));
  for(const map of ['city','suburb'])for(let i=0;i<MAP_SIZE;i++)for(let j=0;j<MAP_SIZE;j++){
   const a=tileArtAt(i,j,map);expect(allowed.has(a.key)).toBe(true);expect(allowed.has(a.fallback)).toBe(true);if(a.decor)expect(allowed.has(a.decor)).toBe(true);expect(tileArtAt(i,j,map)).toEqual(a);
  }
 });
 it('桥梁与街道连接，河道和山体不穿地面道路',()=>{
  for(const map of ['city','suburb'])for(let i=0;i<MAP_SIZE;i++)for(let j=0;j<MAP_SIZE;j++){
   const t=terrainAt(i,j,map);if(t==='river'||t==='hill')expect(roadAt(i,j,map)).toBe(false);if(t==='bridge')expect(roadAt(i,j,map)).toBe(true);
  }
  expect(roadAt(-1,0,'city')).toBe(false);expect(tileArtAt(6,8,'city').key).toBe('terrain_road_cross_1x1_a');
  expect(tileArtAt(3,8,'city').key).toBe('terrain_road_tee_1x1_a');expect(tileArtAt(6,3,'city').key).toBe('terrain_road_tee_alt_1x1_a');
 });
 it('山地逐层堆叠，侧面与图集规范保持8个世界像素',()=>{
  expect(TILE_SIDE_HEIGHT).toBe(8);expect(tileArtAt(23,23,'city').elevation).toBe(3);expect(tileArtAt(2,2,'city').elevation).toBe(0);
 });
 it('装饰物无可见底座时，以实际足点建立有限宽度的虚拟地面',()=>{
  const data=new Uint8Array(100*160*4);for(let y=20;y<140;y++)for(let x=45;x<55;x++)data[(y*100+x)*4+3]=255;
  const p:Pixels={data,width:100,height:160};const f=detectFootprint(p,{id:'decor_lamp',file:'lamp.png',kind:'decoration',cells:1});
  expect(f.ratio).toBe(2);expect(f.width).toBeGreaterThan(90);expect(f.anchor.x).toBe(50);expect(f.anchor.y).toBeGreaterThan(139);
  expect(()=>detectFootprint(p,{id:'bad',file:'bad.png',kind:'decoration',cells:1,groundCoverage:2})).toThrow();
 });
});
