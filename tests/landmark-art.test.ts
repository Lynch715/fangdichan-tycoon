import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {landmarksForMap,landmarkContains} from '../src/render/landmarks.ts';
import {MAP_SIZE,terrainAt,backgroundOccupied} from '../src/sim/map.ts';
const catalog=JSON.parse(readFileSync('art/catalog-a6.json','utf8')).assets as {id:string;cells:number}[];
describe('山城特色地图接入',()=>{
 it('六种素材全部接入，地标不侵占开发用地或背景楼',()=>{
  expect(new Set(landmarksForMap('city').map(l=>l.key))).toEqual(new Set(catalog.map(a=>a.id)));
  for(const map of ['city','suburb'])for(const l of landmarksForMap(map)){
   expect(catalog.find(a=>a.id===l.key)?.cells).toBe(l.cells);
   for(let i=l.i;i<l.i+l.cells;i++)for(let j=l.j;j<l.j+l.cells;j++){
    expect(i>=0&&j>=0&&i<MAP_SIZE&&j<MAP_SIZE).toBe(true);
    expect(terrainAt(i,j,map)).not.toBe('land');expect(backgroundOccupied(map).has(`${i},${j}`)).toBe(false);
   }
  }
 });
 it('两张地图每一段桥梁由且只由一座同方向大桥覆盖',()=>{
  for(const map of ['city','suburb'])for(let i=0;i<MAP_SIZE;i++)for(let j=0;j<MAP_SIZE;j++){
   if(terrainAt(i,j,map)!=='bridge')continue;
   const covering=landmarksForMap(map).filter(l=>l.kind==='bridge'&&landmarkContains(l,i,j));
   expect(covering).toHaveLength(1);
   const l=covering[0];expect(l.key.includes('_i_')?j===l.j:i===l.i).toBe(true);
  }
 });
 it('地标不相互重叠，河道设施与山地景观类型对应',()=>{
  for(const map of ['city','suburb']){const occupied=new Set<string>();for(const l of landmarksForMap(map)){
   for(let i=l.i;i<l.i+l.cells;i++)for(let j=l.j;j<l.j+l.cells;j++){
    const key=`${i},${j}`;expect(occupied.has(key)).toBe(false);occupied.add(key);
    if(l.kind==='stilts'||l.kind==='trail')expect(terrainAt(i,j,map)).toBe('hill');
    if(l.kind==='cableway')expect(terrainAt(i,j,map)).toBe('river');
   }
  }}
 });
});
