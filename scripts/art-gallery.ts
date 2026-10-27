import {writeFile} from 'node:fs/promises';
// 仅供本地视觉验收，不进入游戏界面或生产构建。
const html=String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>素材拼接与施工阶段验收</title><style>
*{box-sizing:border-box}body{margin:0;background:#152029;color:#ebeee9;font:14px system-ui,sans-serif}header{position:sticky;top:0;z-index:2;background:#202f39;padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}h1{margin:0;font-size:19px}select,button{padding:8px;background:#354750;color:white;border:1px solid #667c83;border-radius:6px}main{padding:16px}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}#progress .cards{grid-template-columns:repeat(6,minmax(180px,1fr))}#cards.landmark-cards{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}@media(max-width:850px){#progress .cards{grid-template-columns:repeat(3,minmax(120px,1fr))}}.card{background:#202f39;border:1px solid #3b5159;border-radius:9px;overflow:hidden}.card canvas{display:block;max-width:100%;margin:auto}.label{font-size:12px;margin:0;padding:8px 10px;word-break:break-all;color:#cbd6d8}.status{color:#d5bb84}#seams{display:block;max-width:100%;background:#253842;margin:12px 0;border:1px solid #526a73}details{margin-bottom:16px}summary{cursor:pointer;padding:10px;background:#202f39}</style>
<header><h1>图集与施工阶段验收</h1><label>分辨率 <select id="density"><option value="1">@1x</option><option value="2">@2x</option></select></label><label>筛选 <select id="filter"><option value="all">全部</option><option value="terrain_">地形</option><option value="decor_">装饰物</option><option value="building_">建筑</option><option value="stage_">施工阶段</option><option value="background_">城市背景</option><option value="parcel_">地块状态</option><option value="landmark_">山城特色</option></select></label><label><input id="guides" type="checkbox" checked> 地面菱形及锚点</label><span id="status" class="status">正在读取图集…</span></header>
<main><details open><summary>连续铺设与侧面堆叠</summary><select id="tile"></select><canvas id="seams" width="680" height="430"></canvas></details><section id="products"></section><section id="parcels"></section><section id="progress"></section><section id="cards" class="cards"></section></main>
<script type="module">
const $=s=>document.querySelector(s);let entries=[],density=1;const images=new Map();
async function load(){density=Number($('#density').value);const manifest=await fetch('/art/atlas-manifest.json').then(r=>r.json());entries=[];
 for(const page of manifest.pages.filter(p=>p.density===density)){
  const sheet=await fetch('/art/'+page.json).then(r=>r.json());const image=new Image();image.src='/art/'+sheet.meta.image;await image.decode();
  for(const [id,frame]of Object.entries(sheet.frames))entries.push({id,...frame,image});
 }
 entries.sort((a,b)=>a.id.localeCompare(b.id));const previous=$('#tile').value;$('#tile').replaceChildren(...entries.filter(e=>e.id.startsWith('terrain_')).map(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.id;return o}));if(previous)$('#tile').value=previous;render();
 $('#status').textContent=entries.length+' 个正式素材；@'+density+'x';
}
function draw(ctx,e,x,y,scale=1,guides=false){
 const f=e.frame,w=f.w/density*scale,h=f.h/density*scale;
 ctx.drawImage(e.image,f.x,f.y,f.w,f.h,x-e.anchor.x*w,y-e.anchor.y*h,w,h);
 if(guides){const cells=e.footprint?.cells??1,W=cells*128*scale,H=W/2;ctx.strokeStyle='#ffb35c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-W/2,y-H/2);ctx.lineTo(x,y-H);ctx.lineTo(x+W/2,y-H/2);ctx.closePath();ctx.stroke();ctx.fillStyle='#ff7474';ctx.fillRect(x-2,y-2,4,4);}
}
function render(){const filter=$('#filter').value,guides=$('#guides').checked;$('#cards').replaceChildren();$('#cards').classList.toggle('landmark-cards',filter==='landmark_');
 for(const e of entries.filter(e=>filter==='all'||e.id.startsWith(filter))){const card=document.createElement('article');card.className='card';const c=document.createElement('canvas');c.width=256;c.height=e.id.startsWith('landmark_')?260:200;const label=document.createElement('p');label.className='label';label.textContent=e.id+' · '+(e.frame.w/density).toFixed(0)+'×'+(e.frame.h/density).toFixed(0);card.append(c,label);$('#cards').append(card);
  const scale=e.id.startsWith('landmark_')?.75:e.id.startsWith('terrain_')?1.45:Math.min(1.25,150/(e.frame.h/density+Math.max(0,(e.anchor.y-1)*e.frame.h/density)),220/(e.frame.w/density));draw(c.getContext('2d'),e,128,e.id.startsWith('landmark_')?245:166,scale,guides);
 }products();parcels();progress();seams();}
function parcels(){const host=$('#parcels');host.replaceChildren();if(!location.pathname.includes('a5-')||!['all','parcel_'].includes($('#filter').value))return;const h=document.createElement('h2');h.textContent='待拍/围挡 · 2×2与3×3按相同世界比例显示';host.append(h);const row=document.createElement('div');row.className='cards';host.append(row);
 for(const state of ['auction','fenced'])for(const cells of [2,3]){const key='parcel_'+state+'_'+cells+'x'+cells+'_a',e=entries.find(e=>e.id===key),card=document.createElement('article');card.className='card';const c=document.createElement('canvas');c.width=256;c.height=240;const label=document.createElement('p');label.className='label';label.textContent=e?key:'待通过验收：'+key;card.append(c,label);row.append(card);if(e)draw(c.getContext('2d'),e,128,220,.6,$('#guides').checked);}
}
function products(){const host=$('#products');host.replaceChildren();if(!location.pathname.includes('a5-')||!['all','building_'].includes($('#filter').value))return;
 for(const[line,name]of [['tower','高层住宅'],['garden','洋房'],['villa','别墅'],['commercial','商业裙楼']]){
 const h=document.createElement('h2');h.textContent=name+' · 三个成品变体（相同占地/缩放）';host.append(h);const row=document.createElement('div');row.className='cards';row.style.gridTemplateColumns='repeat(3,minmax(180px,1fr))';host.append(row);
 for(const v of ['a','b','c']){const key='building_'+line+'_2x2_'+v,e=entries.find(e=>e.id===key),card=document.createElement('article');card.className='card';const c=document.createElement('canvas');c.width=256;c.height=240;const label=document.createElement('p');label.className='label';label.textContent=e?key:'待通过验收：'+key;card.append(c,label);row.append(card);if(e)draw(c.getContext('2d'),e,128,225,.65,$('#guides').checked);}
 }
}
function progress(){const host=$('#progress');host.replaceChildren();if((location.pathname.includes('a5-')||location.pathname.includes('a6-'))&&$('#filter').value!=='stage_')return;
 for(const line of ['tower','garden']){if(!entries.some(e=>e.id==='stage_'+line+'_pit_2x2_a'))continue;
 const h=document.createElement('h2');h.textContent=(line==='tower'?'高层住宅':'洋房')+' · 相同占地/缩放，五阶段与成品';host.append(h);
 const row=document.createElement('div');row.className='cards';host.append(row);
 for(const [stage,name]of [['pit','基坑'],['ground','正负零'],['frame','主体施工'],['topped','封顶'],['abandoned','烂尾'],['finished','成品']]){
 const key=stage==='finished'?'building_'+line+'_2x2_a':'stage_'+line+'_'+stage+'_2x2_a',e=entries.find(e=>e.id===key),card=document.createElement('article');card.className='card';const c=document.createElement('canvas');c.width=256;c.height=260;const label=document.createElement('p');label.className='label';label.textContent=name+' · '+(e?key:'待通过验收');card.append(c,label);row.append(card);if(e)draw(c.getContext('2d'),e,128,245,.75,$('#guides').checked);
 }
 }
}
function seams(){const c=$('#seams'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);const e=entries.find(e=>e.id===$('#tile').value);if(!e)return;
 for(let sum=0;sum<9;sum++)for(let i=0;i<5;i++){const j=sum-i;if(j<0||j>4)continue;const x=340+(i-j)*55,y=65+(i+j)*27.5;const levels=i>=3&&j>=3?2:i>=2&&j>=2?1:0;for(let k=0;k<=levels;k++)draw(ctx,e,x,y-k*13.75,.859375,false);}
}
$('#density').addEventListener('change',()=>load().catch(fail));$('#filter').addEventListener('change',render);$('#guides').addEventListener('change',render);$('#tile').addEventListener('change',seams);function fail(e){$('#status').textContent='图集读取失败：'+e.message;}load().catch(fail);
</script></html>`;
await writeFile('tests/acceptance/a3-gallery.html',html);
await writeFile('tests/acceptance/a4-gallery.html',html);
await writeFile('tests/acceptance/a5-gallery.html',html);
await writeFile('tests/acceptance/a6-gallery.html',html);
console.log('验收入口：http://127.0.0.1:5180/tests/acceptance/a3-gallery.html');
