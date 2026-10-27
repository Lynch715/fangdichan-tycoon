// 图集是只读视觉资源，与模拟状态、随机数和存档无关。
import {Assets,type Spritesheet,type Texture} from 'pixi.js';
interface ArtManifest { pages:{density:number;json:string}[] }
export async function loadArt(density=window.devicePixelRatio,root=`${import.meta.env.BASE_URL}art/`):Promise<Record<string,Texture>> {
  const base=new URL(root,window.location.href),textures:Record<string,Texture>={};
  try{
    const response=await fetch(new URL('atlas-manifest.json',base));
    if(!response.ok)throw new Error('图集清单读取失败');
    const manifest=await response.json() as ArtManifest;
    const level=density>1?2:1;
    await Promise.all(manifest.pages.filter(p=>p.density===level).map(async p=>{
      try{const sheet=await Assets.load<Spritesheet>(new URL(p.json,base).href);Object.assign(textures,sheet.textures);}catch{/* 此页不可用时，对应对象回退到程序绘制。 */}
    }));
  }catch{/* 清单不可用时，整张地图仍可程序绘制。 */}
  return textures;
}
