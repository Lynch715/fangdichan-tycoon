// 屏幕空间避让；不读取或修改模拟状态。
export interface LabelCandidate {id:string;x:number;y:number;width:number;height:number;priority:1|2|3}
export interface LabelViewport {x:number;y:number;scale:number;width:number;height:number}
export function layoutMapLabels(candidates:LabelCandidate[],view:LabelViewport):Map<string,{x:number;y:number}>{
 const placed=new Map<string,{x:number;y:number}>(),rects:{left:number;right:number;top:number;bottom:number}[]=[];
 const sorted=[...candidates].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 for(const c of sorted){
  if(c.priority===1&&view.scale<.85)continue;
  const ax=view.x+c.x*view.scale,ay=view.y+c.y*view.scale;
  if(ax<0||ax>view.width||ay<0||ay>view.height)continue;
  const x=Math.max(c.width/2+5,Math.min(view.width-c.width/2-5,ax));
  const y=Math.max(c.height+5,Math.min(view.height-8,ay));
  const r={left:x-c.width/2-4,right:x+c.width/2+4,top:y-c.height-4,bottom:y+4};
  if(rects.some(p=>r.left<p.right&&r.right>p.left&&r.top<p.bottom&&r.bottom>p.top))continue;
  placed.set(c.id,{x:(x-view.x)/view.scale,y:(y-view.y)/view.scale});rects.push(r);
 }
 return placed;
}
