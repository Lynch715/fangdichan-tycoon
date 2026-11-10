import{describe,it,expect}from'vitest';
import{readFile}from'node:fs/promises';
import{constructionArtStage,projectArtKey}from'../src/render/projectArt.ts';
describe('项目施工美术映射',()=>{
 it('按工程进度切换，边界不提前进入下一阶段',()=>{
  expect([0,.079999,.08,.249999,.25,.799999,.8,1].map(p=>constructionArtStage(p))).toEqual(['pit','pit','ground','ground','frame','frame','topped','topped']);
 });
 it('烂尾覆盖原有工程进度，已竣工/交付/清盘保持成品外观',()=>{
  expect(constructionArtStage(.02,true)).toBe('abandoned');
  for(const stage of ['completed','delivered','closed'])expect(projectArtKey({districtId:'yuzhong',stage,progress:1})).toBe('building_tower_2x2_a');
  expect(projectArtKey({districtId:'nanan',stage:'abandoned',progress:.6})).toBe('stage_garden_abandoned_2x2_a');
  expect(projectArtKey({districtId:'yuzhong',stage:'sold',progress:1})).toBeNull();
 });
 it('两条产品线所有进度键都有计划素材，映射不改项目状态',async()=>{
  const all=new Set((JSON.parse(await readFile('art/manifest.json','utf8')).assets as {id:string}[]).map(x=>x.id));
  for(const a of JSON.parse(await readFile('art/catalog-a4.json','utf8')).assets)all.add(a.id);
  for(const districtId of ['yuzhong','jiangbei','nanan','bishan','jiangjin'])for(const progress of [0,.1,.4,.9,1])for(const stage of ['construction','completed','abandoned']){
   const p={districtId,progress,stage},before=JSON.stringify(p),key=projectArtKey(p);expect(all.has(key!)).toBe(true);expect(JSON.stringify(p)).toBe(before);
  }
 });
 it('别墅和商业的地上三个阶段各用专用素材，基础土建复用不影响产品外观',async()=>{
  const ids=new Set(JSON.parse(await readFile('art/manifest.json','utf8')).assets.map((x:{id:string})=>x.id));
  for(const product of ['villa','commercial'] as const){
   for(const [stage,progress,suffix]of [['construction',.5,'frame'],['construction',.9,'topped'],['abandoned',.5,'abandoned']]as const){
    const p={districtId:'nanan',stage,progress,appearance:{product,variant:'a' as const}},before=JSON.stringify(p);
    const key=projectArtKey(p);expect(key).toBe(`stage_${product}_${suffix}_2x2_a`);expect(ids.has(key)).toBe(true);expect(JSON.stringify(p)).toBe(before);
   }
   expect(projectArtKey({districtId:'nanan',stage:'construction',progress:.01,appearance:{product,variant:'a'}})).toBe('stage_garden_pit_2x2_a');
  }
 });
});
