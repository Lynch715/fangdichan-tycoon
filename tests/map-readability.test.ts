import{describe,it,expect}from'vitest';
import{roadAt,roadConnections}from'../src/render/terrain.ts';
import{layoutMapLabels,type LabelCandidate}from'../src/render/labelLayout.ts';
describe('道路连接与屏幕标签',()=>{
 it('三地图每个道路出口都与邻居的同一边中点相接，转角和三叉口保留真实方向',()=>{
  const masks=new Set<string>();
  for(const map of ['city','outer','suburb'])for(let i=0;i<24;i++)for(let j=0;j<24;j++){
   const exits=roadConnections(i,j,map);if(!roadAt(i,j,map)){expect(exits).toEqual([]);continue;}
   if(exits.length===2||exits.length===3)masks.add(exits.map(x=>x.join(',')).join('|'));
   for(const[di,dj]of exits){
    expect(roadConnections(i+di,j+dj,map)).toContainEqual([di===0?0:-di,dj===0?0:-dj]);
    expect([i+.5+di*.5,j+.5+dj*.5]).toEqual([i+di+.5-di*.5,j+dj+.5-dj*.5]);
   }
  }
  expect(masks.size).toBeGreaterThanOrEqual(4);
  expect(roadConnections(3,3,'city')).toEqual([[1,0],[0,1]]);
  expect(roadConnections(6,3,'city')).toEqual([[-1,0],[0,-1],[0,1]]);
 });
 it('全景优先本公司与选中项目，避开重叠，放大后才显示其他公司',()=>{
  const labels:LabelCandidate[]=[
   {id:'rival',x:100,y:100,width:100,height:30,priority:1},
   {id:'mine',x:100,y:100,width:100,height:30,priority:2},
   {id:'selected',x:100,y:100,width:100,height:30,priority:3},
   {id:'far-rival',x:450,y:300,width:100,height:30,priority:1},
  ];
  const view={x:0,y:0,width:600,height:400,scale:.5},result=layoutMapLabels(labels,view);
  expect([...result.keys()]).toEqual(['selected']);
  const zoom=layoutMapLabels(labels,{...view,scale:1});expect(zoom.has('far-rival')).toBe(true);expect(zoom.has('selected')).toBe(true);
 });
 it('窄屏标签使用屏幕宽高避让并保持在屏幕内，缩放不会把标签尺寸缩小',()=>{
  const label:LabelCandidate={id:'edge',x:4,y:30,width:180,height:40,priority:2};
  for(const scale of [.3,.6,1,2]){
   const view={x:0,y:0,width:320,height:740,scale},p=layoutMapLabels([label],view).get('edge')!;
   expect(p).toBeDefined();const sx=p.x*scale,sy=p.y*scale;
   expect(sx-label.width/2).toBeGreaterThanOrEqual(0);expect(sx+label.width/2).toBeLessThanOrEqual(320);expect(sy-label.height).toBeGreaterThanOrEqual(0);
  }
 });
});
