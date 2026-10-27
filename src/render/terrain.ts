// 纯视觉地形布局：不改变片区、地价、可开发区域或模拟随机数。
import {MAP_SIZE,terrainAt} from '../sim/map.ts';
export interface TileArt { key:string; fallback:string; elevation:number; road:boolean; decor:string|null }
export const TILE_SIDE_HEIGHT=8;
// 复用图集；远郊偏草木与暖土，城区保留原混凝土地表。
export function terrainTint(key:string,mapId:string):number {
 if(mapId!=='suburb')return 0xffffff;
 if(/_(grass|mountain|slope)_/.test(key))return 0xc6d5aa;
 if(key==='terrain_earth_1x1_a')return 0xeac59d;
 if(key==='terrain_paved_1x1_a')return 0xd8cbb5;
 if(key.startsWith('terrain_road_'))return 0xf0e4d2;
 return 0xffffff;
}
const hash=(i:number,j:number)=>(Math.imul(i+19,73856093)^Math.imul(j+37,19349663))>>>0;
const valid=(i:number,j:number)=>i>=0&&j>=0&&i<MAP_SIZE&&j<MAP_SIZE;
export function roadAt(i:number,j:number,mapId:string):boolean {
 if(!valid(i,j))return false;
 const t=terrainAt(i,j,mapId);if(t==='river'||t==='hill')return false;
 if(t==='bridge')return true;
 // 24×24 路网：主干道连通大桥，外加次干道把大片土地切成街区
 if(mapId==='outer')return i===8||j===6||(j===18&&i<17)||(i===16&&j<12)||(j===21&&i<17);
 if(mapId==='suburb')return i===8||j===5||(j===17&&i<18)||(i===16&&j<11)||(j===21&&i<18);
 return i===6||j===8||(i===16&&j<17)||(j===13&&i<11)||(i===17&&j<16)||(j===21&&i<15)||(i===3&&j>=3&&j<=8)||(j===3&&i>=3&&i<=6)||(i===20&&j<17)||(j===4&&i>=13);
}
export function tileArtAt(i:number,j:number,mapId='city'):TileArt {
 const t=terrainAt(i,j,mapId),h=hash(i,j),road=roadAt(i,j,mapId);
 let key:string,fallback='terrain_grass_1x1_a',elevation=0;
 if(t==='bridge'){
  key=(mapId!=='city'||j>=17)?'terrain_bridge_nw_se_1x1_a':'terrain_bridge_ne_sw_1x1_a';fallback='terrain_paved_1x1_a';
 }else if(t==='river'){
  fallback='terrain_water_calm_1x1_a';
  const land=(a:number,b:number)=>valid(a,b)&&terrainAt(a,b,mapId)==='land';
  const sides={n:land(i,j-1),e:land(i+1,j),s:land(i,j+1),w:land(i-1,j)};
  const corner=sides.n&&sides.e?'ne':sides.n&&sides.w?'nw':sides.s&&sides.e?'se':sides.s&&sides.w?'sw':null;
  const edge=sides.n?'n':sides.e?'e':sides.s?'s':sides.w?'w':null;
  key=corner?`terrain_shore_corner_${corner}_1x1_a`:edge?`terrain_shore_${edge}_1x1_a`:h%3===0?'terrain_water_ripple_1x1_a':fallback;
 }else if(t==='hill'){
  elevation=1+Math.min(2,Math.floor((i+j-(mapId==='city'?35:mapId==='outer'?34:33))/2));
  elevation=Math.max(1,elevation);
  const direction=['ne','nw','se','sw'][h%4],grade=Math.floor(h/4)%2?'gentle':'steep';
  key=h%5===0?'terrain_mountain_rock_1x1_a':h%5===1?'terrain_mountain_grass_1x1_a':`terrain_slope_${direction}_${grade}_1x1_a`;
 }else if(road){
  const x1=roadAt(i-1,j,mapId),x2=roadAt(i+1,j,mapId),y1=roadAt(i,j-1,mapId),y2=roadAt(i,j+1,mapId);
  const count=Number(x1)+Number(x2)+Number(y1)+Number(y2);
  key=count>=4?'terrain_road_cross_1x1_a':count===3?(x2?'terrain_road_tee_1x1_a':'terrain_road_tee_alt_1x1_a'):count===2&&(x1||x2)&&(y1||y2)?'terrain_road_curve_1x1_a':(x1||x2)?'terrain_road_straight_ne_sw_1x1_a':'terrain_road_straight_nw_se_1x1_a';
  fallback='terrain_paved_1x1_a';
 }else{
  key=mapId==='suburb'?(h%4===0?'terrain_earth_1x1_a':'terrain_grass_1x1_a'):h%5===0?'terrain_earth_1x1_a':h%3===0?'terrain_grass_1x1_a':'terrain_paved_1x1_a';
  fallback=key==='terrain_grass_1x1_a'?key:'terrain_paved_1x1_a';
 }
 const decorations=['trees','tree_tall','rocks','boulder','lamp','bench','shrubs','flowers'];
 const decor=t==='land'&&!road&&h%5===0?`decor_${decorations[Math.floor(h/5)%decorations.length]}_1x1_a`:t==='hill'&&h%3===0?`decor_${h%2?'rocks':'shrubs'}_1x1_a`:null;
 return {key,fallback,elevation,road,decor};
}
