import sharp from 'sharp';

export interface Pixels { data: Uint8Array; width: number; height: number }
export interface Bounds { left:number; top:number; width:number; height:number }
export interface Footprint { width:number; height:number; ratio:number; deviation:number; anchor:{x:number;y:number}; corners:{x:number;y:number}[]; edgeError:number; sideHeight:number }
export interface AssetSpec { id:string; file:string; cells:1|2|3; kind:'building'|'terrain'|'decoration'; sideHeightRatio?:number; maxHeightRatio?:number; ground?:{x:number;y:number;width:number;height:number}; groundCoverage?:number }
export interface PreparedAsset { spec:AssetSpec; png:Buffer; width:number; height:number; anchor:{x:number;y:number}; footprint:Footprint; rawBounds:Bounds; sourceSize:{w:number;h:number} }

/** Alpha is preserved; opaque magenta mattes are keyed and mixed edge pixels unmatted. */
export function cleanBackground(input:Pixels, cutoff=32):Pixels {
  const data=new Uint8Array(input.data);
  let transparent=0,magenta=0;
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
    if(a<=cutoff){data[i]=data[i+1]=data[i+2]=data[i+3]=0;transparent++;continue;}
    const distance=Math.max(255-r,g,255-b);
    if(distance<=35){data[i]=data[i+1]=data[i+2]=data[i+3]=0;magenta++;continue;}
    // Recover foreground RGB from a magenta/foreground mixture, rather than leaving pink fringes.
    const spill=Math.min(r,b)-g;
    if(r>128 && b>128 && spill>48){
      const alpha=1-Math.min(.98,spill/255);
      data[i]=Math.max(0,Math.min(255,Math.round((r-255*(1-alpha))/alpha)));
      data[i+1]=Math.min(255,Math.round(g/alpha));
      data[i+2]=Math.max(0,Math.min(255,Math.round((b-255*(1-alpha))/alpha)));
      data[i+3]=Math.round(a*alpha);
    }
  }
  if(!transparent && !magenta)throw new Error('背景不是透明 alpha 或纯洋红 #FF00FF，请重新生成');
  return {...input,data};
}
export function boundsOf(p:Pixels, threshold=1):Bounds {
  let left=p.width,top=p.height,right=-1,bottom=-1;
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(p.data[(y*p.width+x)*4+3]>=threshold){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left)throw new Error('素材中没有可见像素');
  return {left,top,width:right-left+1,height:bottom-top+1};
}
function regress(points:{x:number;y:number}[]){
  const meanY=points.reduce((s,p)=>s+p.y,0)/points.length,meanX=points.reduce((s,p)=>s+p.x,0)/points.length;
  const variance=points.reduce((s,p)=>s+(p.y-meanY)**2,0);
  const slope=points.reduce((s,p)=>s+(p.y-meanY)*(p.x-meanX),0)/variance;
  const intercept=meanX-slope*meanY;
  const error=Math.sqrt(points.reduce((s,p)=>s+(p.x-(slope*p.y+intercept))**2,0)/points.length);
  return {slope,intercept,error};
}
/** Infer the two front boundary lines from alpha, not from the tall sprite's bounding box. */
export function detectFootprint(p:Pixels,spec:AssetSpec):Footprint {
  const b=boundsOf(p,96);
  if(spec.kind==='decoration'){
    // 独立装饰物没有可见底座；以足点建立1格虚拟地面，冠幅/物体高度受规范约束。
    const coverage=spec.groundCoverage??.7;
    if(!(coverage>0&&coverage<=1))throw new Error('装饰物地面覆盖比例无效');
    const width=Math.max(b.width/coverage,b.height/(spec.maxHeightRatio??1.3));
    const g=spec.ground??{x:b.left+b.width/2,y:b.top+b.height-1+width/4,width,height:width/2};
    const ratio=g.width/g.height,deviation=Math.abs(ratio/2-1);
    if(deviation>.05)throw new Error(`底座比例 ${ratio.toFixed(3)}:1，偏离 2:1 ${(deviation*100).toFixed(2)}%，超过 5%`);
    return {width:g.width,height:g.height,ratio,deviation,anchor:{x:g.x,y:g.y},corners:[{x:g.x,y:g.y-g.height},{x:g.x+g.width/2,y:g.y-g.height/2},{x:g.x,y:g.y},{x:g.x-g.width/2,y:g.y-g.height/2}],edgeError:0,sideHeight:0};
  }
  const rows:{y:number;left:number;right:number}[]=[];
  for(let y=b.top+Math.floor(b.height*.35);y<b.top+b.height;y++){
    let left=p.width,right=-1;
    for(let x=b.left;x<b.left+b.width;x++)if(p.data[(y*p.width+x)*4+3]>=96){left=Math.min(left,x);right=Math.max(right,x);}
    if(right>=left)rows.push({y,left,right});
  }
  const width=Math.max(...rows.map(r=>r.right-r.left+1));
  const bottom=b.top+b.height-1;
  const frontRows=rows.filter(r=>r.y>=bottom-width*.20 && r.y<=bottom-width*.05);
  if(frontRows.length<8)throw new Error('无法检测底座前边，请提供边缘清晰的菱形底座');
  const left=regress(frontRows.map(r=>({x:r.left,y:r.y}))),right=regress(frontRows.map(r=>({x:r.right,y:r.y})));
  const ratio=(left.slope-right.slope)/2,deviation=Math.abs(ratio/2-1);
  const edgeError=Math.max(left.error,right.error)/width;
  if(!Number.isFinite(ratio) || left.slope<=0 || right.slope>=0 || edgeError>.015)throw new Error('底座前边不清晰或不对称，需重新生成');
  if(deviation>.05)throw new Error(`底座比例 ${ratio.toFixed(3)}:1，偏离 2:1 ${(deviation*100).toFixed(2)}%，超过 5%`);
  if(Math.abs(left.slope+right.slope)/4>.05)throw new Error(`底座两边不对称：左 ${left.slope.toFixed(3)}，右 ${(-right.slope).toFixed(3)}，超过5%容差`);
  const tipY=(right.intercept-left.intercept)/(left.slope-right.slope);
  const tipX=left.slope*tipY+left.intercept;
  const bottomCornerY=tipY-width/(2*ratio);
  const topCornerY=rows.find(r=>r.right-r.left+1>=width*.995)?.y ?? bottomCornerY;
  const sideHeight=spec.kind==='terrain'?Math.max(0,bottomCornerY-topCornerY):0;
  if(spec.kind==='terrain' && spec.sideHeightRatio && sideHeight<1)throw new Error('无法检测地形侧面厚度，请重生成带明确侧面的瓦片');
  const anchor={x:tipX,y:tipY-sideHeight},height=width/ratio;
  return {width,height,ratio,deviation,anchor,corners:[{x:tipX,y:anchor.y-height},{x:tipX+width/2,y:anchor.y-height/2},anchor,{x:tipX-width/2,y:anchor.y-height/2}],edgeError,sideHeight};
}
export async function prepareAsset(file:string,spec:AssetSpec,density:1|2):Promise<PreparedAsset> {
  const decoded=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const p=cleanBackground({data:decoded.data,width:decoded.info.width,height:decoded.info.height});
  const footprint=detectFootprint(p,spec),rawBounds=boundsOf(p);
  const ratio=rawBounds.height/footprint.width;
  if(spec.kind==='building' && ratio>(spec.maxHeightRatio??1.3))throw new Error(`素材总高/占地宽 ${ratio.toFixed(3)} 超过 ${spec.maxHeightRatio??1.3}，请压缩楼层重新生成`);
  const scale=spec.cells*128*density/footprint.width;
  const scaleY=scale*footprint.ratio/2; // 仅对已通过5%门槛的小偏差归一化到精确2:1。
  const width=Math.max(1,Math.round(rawBounds.width*scale)),height=Math.max(1,Math.round(rawBounds.height*scaleY));
  let png=await sharp(p.data,{raw:{width:p.width,height:p.height,channels:4}}).extract(rawBounds).resize(width,height,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
  const anchorX=(footprint.anchor.x-rawBounds.left)*scale,anchorY=(footprint.anchor.y-rawBounds.top)*scaleY;
  let outputHeight=height,finalAnchorY=anchorY;
  if(spec.kind==='terrain' && spec.sideHeightRatio){
    const oldSide=footprint.sideHeight*scaleY,newSide=spec.cells*128*density*spec.sideHeightRatio;
    const offsetY=Math.max(0,Math.ceil(spec.cells*64*density-anchorY));
    outputHeight=Math.max(1,Math.ceil(anchorY+offsetY+newSide));
    const input=await sharp(png).ensureAlpha().raw().toBuffer(),output=new Uint8Array(width*outputHeight*4);
    for(let y=0;y<outputHeight;y++)for(let x=0;x<width;x++){
      const yy=y-offsetY,top=anchorY-Math.abs(x-anchorX)/2;
      const sourceY=yy>top?top+(yy-top)*oldSide/newSide:yy;
      const y0=Math.floor(sourceY),mix=sourceY-y0;
      for(let ch=0;ch<4;ch++){
        const at=(row:number)=>row>=0&&row<height?input[(row*width+x)*4+ch]:0;
        output[(y*width+x)*4+ch]=Math.round(at(y0)*(1-mix)+at(y0+1)*mix);
      }
    }
    finalAnchorY+=offsetY;
    png=await sharp(output,{raw:{width,height:outputHeight,channels:4}}).png().toBuffer();
  }
  return {spec,png,width,height:outputHeight,anchor:{x:anchorX/width,y:finalAnchorY/outputHeight},footprint,rawBounds,sourceSize:{w:p.width,h:p.height}};
}
export interface Placement { asset:PreparedAsset; x:number; y:number; page:number }
export function packAssets(assets:PreparedAsset[],limit=2048,padding=2):{placements:Placement[];pages:{width:number;height:number}[]} {
  const placements:Placement[]=[],pages:{width:number;height:number}[]=[];
  let x=padding,y=padding,rowHeight=0,page=0,usedWidth=1;
  for(const asset of [...assets].sort((a,b)=>b.height-a.height||a.spec.id.localeCompare(b.spec.id))){
    if(asset.width+2*padding>limit || asset.height+2*padding>limit)throw new Error(`${asset.spec.id} 超过单页图集尺寸限制`);
    if(x+asset.width+padding>limit){x=padding;y+=rowHeight+padding*2;rowHeight=0;}
    if(y+asset.height+padding>limit){pages.push({width:usedWidth,height:y+rowHeight+padding});page++;x=padding;y=padding;rowHeight=0;usedWidth=1;}
    placements.push({asset,x,y,page});x+=asset.width+padding*2;rowHeight=Math.max(rowHeight,asset.height);usedWidth=Math.max(usedWidth,x-padding);
  }
  if(assets.length)pages.push({width:usedWidth,height:y+rowHeight+padding});
  return {placements,pages};
}
