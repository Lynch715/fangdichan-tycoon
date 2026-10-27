// 纯显示地标，全部位于河道/山地，不占用或改变模拟可开发地块。
export interface Landmark { key:string; i:number; j:number; cells:2; elevation:number; kind:'bridge'|'stilts'|'cableway'|'trail' }
const city:ReadonlyArray<Landmark>=[
 {key:'landmark_bridge_i_2x2_a',i:11,j:8,cells:2,elevation:0,kind:'bridge'},
 {key:'landmark_bridge_j_2x2_a',i:6,j:17,cells:2,elevation:0,kind:'bridge'},
 {key:'landmark_bridge_j_2x2_a',i:16,j:17,cells:2,elevation:0,kind:'bridge'},
 {key:'landmark_cableway_2x2_a',i:11,j:12,cells:2,elevation:0,kind:'cableway'},
 {key:'landmark_stilts_2x2_a',i:15,j:20,cells:2,elevation:2,kind:'stilts'},
 {key:'landmark_stilts_2x2_b',i:18,j:20,cells:2,elevation:3,kind:'stilts'},
 {key:'landmark_trail_2x2_a',i:21,j:20,cells:2,elevation:3,kind:'trail'},
];
const suburb:ReadonlyArray<Landmark>=[{key:'landmark_bridge_j_2x2_a',i:8,j:11,cells:2,elevation:0,kind:'bridge'}];
export const landmarksForMap=(mapId:string):ReadonlyArray<Landmark>=>mapId==='city'?city:mapId==='suburb'?suburb:mapId==='outer'?[{key:'landmark_bridge_j_2x2_a',i:8,j:12,cells:2,elevation:0,kind:'bridge'}]:[];
export const landmarkContains=(l:Landmark,i:number,j:number)=>i>=l.i&&i<l.i+l.cells&&j>=l.j&&j<l.j+l.cells;
