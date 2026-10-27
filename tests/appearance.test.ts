import{describe,it,expect}from'vitest';
import{readFile}from'node:fs/promises';
import{applyCommand,computeMetrics,type Command,type LoggedCommand}from'../src/sim/index.ts';
import{validateSave,restore}from'../src/save.ts';
import{appearanceOf}from'../src/appearance.ts';
import{projectArtKey}from'../src/render/projectArt.ts';
import{BACKGROUND_ART_KEYS,backgroundArtKey,parcelArtKey,spriteScale,visibleMapProjects}from'../src/render/cityArt.ts';
import{BUILDING_PRODUCTS,BUILDING_VARIANTS}from'../src/sim/types.ts';
import{backgroundBuildings}from'../src/sim/map.ts';
const replay=(seed:number,log:LoggedCommand[],day:number)=>restore(validateSave({version:2,seed,log,day})!);
const bid:LoggedCommand={day:0,command:{type:'bid',parcelId:'L1',amount:31146}};
describe('建筑外观与地图素材',()=>{
 it('四类三变体均能保存并回放，外观不改变经济结果或随机数',()=>{
  const baseline=replay(7,[bid],720);
  for(const product of BUILDING_PRODUCTS)for(const variant of BUILDING_VARIANTS){
   const initial=replay(7,[bid],90),id=initial.projects[0].id;
   const command:Command={type:'setAppearance',projectId:id,product,variant};
   const log=[bid,{day:90,command}],save=validateSave({version:2,seed:7,day:720,log,revision:0});expect(save).not.toBeNull();
   const state=restore(save!);expect(state.projects[0].appearance).toEqual({product,variant});expect(projectArtKey(state.projects[0])).toBe(`building_${product}_2x2_${variant}`);
   expect(computeMetrics(state)).toEqual(computeMetrics(baseline));expect(state.rng).toBe(baseline.rng);expect(state.news).toEqual(baseline.news);
   const {appearance,...project}=state.projects[0];expect(project).toEqual(baseline.projects[0]);
  }
 });
 it('无外观字段的旧档保留默认样式；无效指令和转让后项目不可改外观',()=>{
  const s=replay(7,[bid],90),p=s.projects[0];expect(p.appearance).toBeUndefined();expect(appearanceOf(p)).toEqual({product:'garden',variant:'a'});
  const before=JSON.stringify(s);expect(applyCommand(s,{type:'setAppearance',projectId:p.id,product:'bad',variant:'a'} as unknown as Command).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  expect(validateSave({version:2,seed:7,day:90,log:[bid,{day:90,command:{type:'setAppearance',projectId:p.id,product:'villa',variant:'d'}}]})).toBeNull();
  expect(applyCommand(s,{type:'setAppearance',projectId:'missing',product:'villa',variant:'a'}).ok).toBe(false);
  expect(applyCommand(s,{type:'sellProject',projectId:p.id}).ok).toBe(true);
  expect(applyCommand(s,{type:'setAppearance',projectId:p.id,product:'villa',variant:'a'}).ok).toBe(false);
 });
 it('10个城市素材实际覆盖现有背景位置；四个地块状态与12成品有计划素材',async()=>{
  const ids=new Set(JSON.parse(await readFile('art/catalog-a5.json','utf8')).assets.map((x:{id:string})=>x.id));
  expect(new Set(backgroundBuildings.map((_,i)=>backgroundArtKey(i)))).toEqual(new Set(BACKGROUND_ART_KEYS));
  for(const id of BACKGROUND_ART_KEYS)expect(ids.has(id)).toBe(true);
  for(const product of BUILDING_PRODUCTS)for(const v of BUILDING_VARIANTS)expect(ids.has(`building_${product}_2x2_${v}`)).toBe(true);
  for(const cells of [2,3]){const tiles=Array.from({length:cells*cells},(_,k)=>[Math.floor(k/cells),k%cells] as const);for(const stage of ['auction','fenced']as const)expect(ids.has(parcelArtKey(stage,tiles)!)).toBe(true);}
  expect(spriteScale('building_villa_2x2_a',3)).toBe(.75);expect(spriteScale('parcel_fenced_3x3_a',3)).toBe(.5);
 });
 it('重建地块不透出旧清盘楼；较新的转让项目也覆盖旧历史楼',()=>{
  const tiles=[[0,0],[1,0],[0,1],[1,1]] as const;
  const old={id:'old',stage:'closed',tiles},next={id:'next',stage:'construction',tiles};
  expect(visibleMapProjects([old,next],[]).map(x=>x.id)).toEqual(['next']);
  expect(visibleMapProjects([old,{...next,stage:'sold'}],[])).toEqual([]);
  expect(visibleMapProjects([old],[])).toEqual([old]);expect(visibleMapProjects([old],[{tiles}])).toEqual([]);
 });
});
