// 几何检查与人工视觉记录同时通过，才纳入正式清单；记录与原图哈希绑定。
import {access,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareAsset,type AssetSpec} from './art-core.ts';
interface CatalogAsset extends AssetSpec {description:string}
const groups=(await readdir('art')).filter(name=>/^catalog-a[3-6]\.json$/.test(name)).sort().map(name=>name.match(/catalog-(a[3-6])/)! [1]);
for(const group of groups){
const catalog=JSON.parse(await readFile(`art/catalog-${group}.json`,'utf8')) as {assets:CatalogAsset[]};
const manifest=JSON.parse(await readFile('art/manifest.json','utf8')) as {assets:AssetSpec[]};
let reviews:Record<string,{sha256:string;visual:'pass'|'revise';note:string}>={};
try{reviews=JSON.parse(await readFile(`art/reviews-${group}.json`,'utf8'));}catch{/* 尚无人工记录时维持待审，不自动放行。 */}
const catalogIds=new Set(catalog.assets.map(a=>a.id));manifest.assets=manifest.assets.filter(a=>!catalogIds.has(a.id));
const results=[];
for(const item of catalog.assets){
 const file=`art/raw/${item.file}`;
 try{await access(file);}catch{results.push({id:item.id,status:'missing'});continue;}
 try{
  const prepared=await prepareAsset(file,item,2),sha256=createHash('sha256').update(await readFile(file)).digest('hex'),review=reviews[item.id];
  if(!review||review.sha256!==sha256){results.push({id:item.id,status:'needsReview',ratio:prepared.footprint.ratio});continue;}
  if(review.visual!=='pass'){results.push({id:item.id,status:'visualRejected',error:review.note});continue;}
  results.push({id:item.id,status:'approved',ratio:prepared.footprint.ratio,sideHeight:prepared.footprint.sideHeight,sha256});
  const {description,...spec}=item;manifest.assets.push(spec);
 }catch(error){results.push({id:item.id,status:'rejected',error:(error as Error).message});}
}
const approved=results.filter(r=>r.status==='approved').length;
await writeFile('art/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile(`art/${group}-progress.json`,JSON.stringify({planned:catalog.assets.length,plannedStages:catalog.assets.filter(a=>a.id.startsWith('stage_')).length,plannedBuildings:catalog.assets.filter(a=>a.kind==='building').length,plannedTerrain:catalog.assets.filter(a=>a.kind==='terrain').length,plannedDecorations:catalog.assets.filter(a=>a.kind==='decoration').length,approved,results},null,2)+'\n');
console.log(`${group.toUpperCase()}：通过 ${approved}/${catalog.assets.length}；几何不合格 ${results.filter(r=>r.status==='rejected').length}；视觉不合格 ${results.filter(r=>r.status==='visualRejected').length}；待视觉复核 ${results.filter(r=>r.status==='needsReview').length}；未生成 ${results.filter(r=>r.status==='missing').length}`);
for(const r of results.filter(r=>r.status!=='missing'))console.log(JSON.stringify(r));

}
