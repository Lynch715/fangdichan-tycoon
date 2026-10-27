import {mkdir,readdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {packAssets,prepareAsset,type AssetSpec} from './art-core.ts';

export async function buildArt(options:{manifest?:string;raw?:string;out?:string}={}){
  const raw=resolve(options.raw??'art/raw'),out=resolve(options.out??'public/art');
  const manifest=JSON.parse(await readFile(options.manifest??'art/manifest.json','utf8')) as {assets:AssetSpec[]};
  if(!Array.isArray(manifest.assets) || !manifest.assets.length)throw new Error('素材清单为空');
  const ids=new Set<string>();
  for(const s of manifest.assets){
    if(!/^[a-z0-9_-]+$/.test(s.id)||ids.has(s.id))throw new Error(`素材 ID 无效或重复：${s.id}`);ids.add(s.id);
    if(![1,2,3].includes(s.cells)||!['building','terrain','decoration'].includes(s.kind))throw new Error(`素材规格无效：${s.id}`);
    if(resolve(raw,s.file)!==resolve(raw,basename(s.file)))throw new Error('素材文件须位于 art/raw/ 顶层');
  }
  // Validate and prepare everything before touching the existing output atlas.
  const prepared=new Map<1|2,Awaited<ReturnType<typeof prepareAsset>>[]>();
  for(const density of [2,1] as const){
    const assets=[];
    for(const spec of manifest.assets){try{assets.push(await prepareAsset(resolve(raw,spec.file),spec,density));}catch(error){throw new Error(`${spec.id}：${(error as Error).message}`);}}
    prepared.set(density,assets);
  }
  const stage=resolve(out,'.atlas-stage');await mkdir(stage,{recursive:true});
  const summary:{density:number;page:number;png:string;json:string;bytes:number}[]=[],diagnostics=[];
  try{
    for(const density of [2,1] as const){
      const assets=prepared.get(density)!,{placements,pages}=packAssets(assets);
      for(const [page,size] of pages.entries()){
        const name=`atlas@${density}x-${page}`,png=`${name}.png`,json=`${name}.json`;
        const items=placements.filter(p=>p.page===page);
        const image=await sharp({create:{...size,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(items.map(p=>({input:p.asset.png,left:p.x,top:p.y}))).png({compressionLevel:9,palette:true,colours:256,dither:.2}).toBuffer();
        const frames=Object.fromEntries(items.map(({asset:a,x,y})=>[a.spec.id,{frame:{x,y,w:a.width,h:a.height},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:a.width,h:a.height},sourceSize:{w:a.width,h:a.height},anchor:a.anchor,footprint:{cells:a.spec.cells,width:a.spec.cells*128,height:a.spec.cells*64}}]));
        await writeFile(resolve(stage,png),image);await writeFile(resolve(stage,json),JSON.stringify({frames,meta:{app:'房地产大亨 art-pipeline',version:'1',image:png,format:'RGBA8888',size:{w:size.width,h:size.height},scale:String(density)}},null,2)+'\n');
        summary.push({density,page,png,json,bytes:image.length});
      }
      if(density===2)for(const a of assets)diagnostics.push({id:a.spec.id,source:a.spec.file,sourceSize:a.sourceSize,bounds:a.rawBounds,footprint:a.footprint,output:{width:a.width,height:a.height,anchor:a.anchor}});
    }
    const bytes2x=summary.filter(p=>p.density===2).reduce((n,p)=>n+p.bytes,0);
    if(bytes2x>8*1024*1024)throw new Error(`@2x 图集 ${(bytes2x/1024/1024).toFixed(2)} MB 超过 8 MB`);
    await writeFile(resolve(stage,'atlas-manifest.json'),JSON.stringify({assets:manifest.assets.map(a=>a.id),pages:summary,bytes2x,diagnostics},null,2)+'\n');
    const generated=await readdir(stage);
    for(const name of await readdir(out))if(/^atlas(?:@\dx-\d+\.(png|json)|-manifest\.json)$/.test(name)&&!generated.includes(name))await rm(resolve(out,name));
    for(const name of generated)await rename(resolve(stage,name),resolve(out,name));
    console.log(`${manifest.assets.length} 个素材；@2x ${(bytes2x/1024).toFixed(1)} KB；${summary.length} 张图集`);
    return {assets:manifest.assets.length,pages:summary,bytes2x,diagnostics};
  }finally{await rm(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  buildArt({manifest:option('--manifest'),raw:option('--raw'),out:option('--out')}).catch(error=>{console.error((error as Error).message);process.exitCode=1;});
}
