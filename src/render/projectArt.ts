// 纯显示映射，不修改项目、成本、工期、销售或模拟随机数。
import{appearanceOf}from'../appearance.ts';
import type{BuildingAppearance}from'../sim/types.ts';
import type{Tile}from'../sim/types.ts';
import{parcelArtKey}from'./cityArt.ts';
export type BuildingLine='tower'|'garden';
export type ConstructionArtStage='pit'|'ground'|'frame'|'topped'|'abandoned';
interface VisualProject {districtId:string;stage:string;progress:number;appearance?:BuildingAppearance;tiles?:Tile[]}
export function buildingLine(p:VisualProject):BuildingLine {
 // 当前住宅体量按片区选择，后续成品变体沿用同一条产品线。
 return appearanceOf(p).product==='tower'?'tower':'garden';
}
export function constructionArtStage(progress:number,abandoned=false):ConstructionArtStage {
 if(abandoned)return 'abandoned';
 if(progress<.08)return 'pit';
 if(progress<.25)return 'ground';
 if(progress<.8)return 'frame';
 return 'topped';
}
export function projectArtKey(p:VisualProject):string|null {
 if(p.stage==='sold')return null;
 if(p.stage==='land')return parcelArtKey('fenced',p.tiles??[[0,0],[1,0],[0,1],[1,1]]);
 const line=buildingLine(p);
 return p.stage==='construction'||p.stage==='abandoned'
  ?`stage_${line}_${constructionArtStage(p.progress,p.stage==='abandoned')}_2x2_a`
  :`building_${appearanceOf(p).product}_2x2_${appearanceOf(p).variant}`;
}
