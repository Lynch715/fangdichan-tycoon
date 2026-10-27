import type{Tile}from'../sim/types.ts';
export const BACKGROUND_ART_KEYS=[
 'background_walkup_1x1_a','background_walkup_1x1_b','background_walkup_1x1_c',
 'background_office_1x1_a','background_office_1x1_b','background_school_1x1_a','background_school_1x1_b',
 'background_metro_1x1_a','background_metro_1x1_b','background_shop_1x1_a',
] as const;
export const backgroundArtKey=(index:number)=>BACKGROUND_ART_KEYS[index%BACKGROUND_ART_KEYS.length];
export function plotGeometry(tiles:ReadonlyArray<Tile>){
 const i=Math.min(...tiles.map(t=>t[0])),j=Math.min(...tiles.map(t=>t[1]));
 const cells=Math.max(Math.max(...tiles.map(t=>t[0]))-i+1,Math.max(...tiles.map(t=>t[1]))-j+1);
 return {i,j,cells};
}
export function parcelArtKey(state:'auction'|'fenced',tiles:ReadonlyArray<Tile>):string|null {
 if(!tiles.length)return null;const {cells}=plotGeometry(tiles);
 return cells===2||cells===3?`parcel_${state}_${cells}x${cells}_a`:null;
}
export function spriteScale(key:string,cells:number){
 const sourceCells=Number(key.match(/_(\d)x\d_/)?.[1]??2);
 return .5*cells/sourceCells;
}
export function visibleMapProjects<T extends{stage:string;tiles:ReadonlyArray<Tile>}>(projects:ReadonlyArray<T>,auctions:ReadonlyArray<{tiles:ReadonlyArray<Tile>}>):T[]{
 const covered=new Set(auctions.flatMap(a=>a.tiles.map(([i,j])=>`${i},${j}`))),visible:T[]=[];
 for(const p of [...projects].reverse()){
  const overlaps=p.tiles.some(([i,j])=>covered.has(`${i},${j}`));
  for(const[i,j]of p.tiles)covered.add(`${i},${j}`);
  if(p.stage==='sold'||(p.stage==='closed'||p.stage==='abandoned')&&overlaps)continue;
  visible.push(p);
 }
 return visible.reverse();
}
