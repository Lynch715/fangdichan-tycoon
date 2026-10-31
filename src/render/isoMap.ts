import{allMapProjects}from'../sim/rivals.ts';
import { salesStatus, soldRatio } from '../ui/sales.ts';
// 等距地图渲染：只读模拟状态；正常显示图集，资源失败时逐对象程序回退。
import {tileArtAt,terrainTint,roadAt,TILE_SIDE_HEIGHT,type TileArt} from './terrain.ts';
import {projectArtKey} from './projectArt.ts';
import {landmarksForMap,landmarkContains,type Landmark} from './landmarks.ts';
import{backgroundArtKey,parcelArtKey,plotGeometry,spriteScale,visibleMapProjects}from'./cityArt.ts';
import {loadArt} from './art.ts';
import {builtArea,growthTiles,urbanization} from './growth.ts';
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { defaultConfig, district, activeProject, MAP_SIZE, backgroundBuildings, terrainAt, districtAt, type GameState, type Tile } from '../sim/index.ts';

// 世界尺寸随网格大小推导（24×24 时为 1536×956）
const OX = 32 * MAP_SIZE;
const OY = 150;
const WORLD_W = 64 * MAP_SIZE;
const WORLD_H = OY + 32 * MAP_SIZE + 38;

const P = (i: number, j: number): [number, number] => [OX + (i - j) * 32, OY + (i + j) * 16];

const COLORS = {
  river: [0x3b8c99, 0x3f93a0],
  bridge: 0x8d9298,
  hill: [0x6f9b55, 0x678f4f],
  core: [0xc8c2b5, 0xc2bbad],
  land: [0xcfc9bc, 0xc9c2b4],
  park: 0x8db066,
  city: [0xe7e2d6, 0xc2baab, 0xa0988a],
  mine: [0xf7d3a1, 0xe3a866, 0xc4864a],
  build: [0xbdbdb9, 0xa3a39f, 0x8a8a86],
  orange: 0xf59a3c,
};

function tileColor(i: number, j: number, mapId: string): number {
  const t = terrainAt(i, j,mapId);
  if (t === 'bridge') return COLORS.bridge;
  if (t === 'river') return COLORS.river[(i + j) % 2];
  if (t === 'hill') return COLORS.hill[(i * 7 + j * 3) % 3 ? 0 : 1];
  if(mapId==='suburb')return (i*5+j*3)%4===0?0xc9ad86:0x8da36a;
  if (districtAt(i, j,mapId) === 'yuzhong') return COLORS.core[(i + j) % 2];
  return (i * 5 + j * 3) % 4 === 0 ? COLORS.park : COLORS.land[(i + j) % 2];
}

interface Block {
  order: number;
  draw: (g: Graphics) => void;
}

/** 在 (i0,j0) 起、size×size 的占地上画一个方块楼。 */
function blockAt(i0: number, j0: number, size: number, h: number, pal: number[], inset = 0.72): (g: Graphics) => void {
  const [nx, ny] = P(i0, j0);
  const [ex, ey] = P(i0 + size, j0);
  const [sx, sy] = P(i0 + size, j0 + size);
  const [wx, wy] = P(i0, j0 + size);
  const cx = (nx + sx) / 2;
  const cy = (ny + sy) / 2;
  const s = (x: number, y: number): [number, number] => [cx + (x - cx) * inset, cy + (y - cy) * inset];
  const N = s(nx, ny), E = s(ex, ey), S = s(sx, sy), W = s(wx, wy);
  return (g) => {
    g.poly([W[0], W[1], S[0], S[1], S[0], S[1] - h, W[0], W[1] - h]).fill(pal[1]);
    g.poly([S[0], S[1], E[0], E[1], E[0], E[1] - h, S[0], S[1] - h]).fill(pal[2]);
    g.poly([N[0], N[1] - h, E[0], E[1] - h, S[0], S[1] - h, W[0], W[1] - h]).fill(pal[0]);
  };
}

function footprintPoly(tiles: Tile[]): number[] {
  const i0 = Math.min(...tiles.map((t) => t[0]));
  const j0 = Math.min(...tiles.map((t) => t[1]));
  const i1 = Math.max(...tiles.map((t) => t[0])) + 1;
  const j1 = Math.max(...tiles.map((t) => t[1])) + 1;
  return [...P(i0, j0), ...P(i1, j0), ...P(i1, j1), ...P(i0, j1)];
}

export class IsoMap {
  private app = new Application();
  private terrain = new Container();
  private textures: Record<string,Texture> = {};
  private terrainSignature = '';
  /** 图集到达前不画地图：否则会先画出无贴图的程序地形，且该帧不会被替换。 */
  private ready = false;
  private pending: [GameState, string | null, string] | null = null;
  /** 当前地图城市化程度 0–1（供界面显示）。 */
  urbanization = 0;
  private occupied = new Set<string>();
  private terrainDecor:{i:number;j:number;elevation:number;key:string}[]=[];
  private region = 'city';
  private world = new Container();
  private dynamic = new Container();
  private labels = new Container();
  private salesEffects = new Container();
  private salesAnchors = new Map<string, [number, number]>();
  private salesAnimations = new Set<() => void>();
  private pointers = new Map<number, { x: number; y: number }>();
  private dragDist = 0;
  private pinchStart: { dist: number; scale: number } | null = null;

  private host: HTMLElement;
  private onTap: (tile: Tile) => void;

  constructor(host: HTMLElement, onTap: (tile: Tile) => void) {
    this.host = host;
    this.onTap = onTap;
  }

  async init(loadTextures:()=>Promise<Record<string,Texture>>=loadArt) {
    // 图集下载与渲染器初始化并行；手机首次打开约 3MB，期间显示加载提示而不是半成品地图。
    const art=loadTextures().catch(()=>({} as Record<string,Texture>));
    const loading=this.showLoading();
    await this.app.init({
      resizeTo: this.host,
      background: '#0F1419',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.host.insertBefore(this.app.canvas,loading);
    this.app.stage.addChild(this.world);
    // 三个图层在图集到达前就挂好：期间若有读档/开局触发 update，也不会只剩地形。
    this.world.addChild(this.terrain, this.dynamic, this.labels, this.salesEffects);
    this.fit();
    this.bindInput();
    window.addEventListener('resize', () => requestAnimationFrame(() => this.fit()));
    this.textures=await art;
    this.ready=true;loading.remove();
    // 图集到达前的 update 只记下参数；现在用贴图补画最新一帧（start() 随后的 render 也会再画）。
    this.terrainSignature='';
    if(this.pending)this.update(...this.pending);
  }

  private showLoading():HTMLElement {
    const el=document.createElement('div');
    el.className='map-loading';el.setAttribute('role','status');el.textContent='城市素材加载中…';
    this.host.appendChild(el);
    return el;
  }

  fit() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    // 竖屏时放大到约 1.8 倍宽度，两侧可拖动查看
    const portrait = window.innerWidth <= 820 && h > w;
    // 地图放大后竖屏默认放大到约 2.4 倍宽度，格子大小与旧版接近，可拖动/双指缩放查看全城
    const scale = portrait ? Math.min((w / WORLD_W) * 2.4, h / WORLD_H * 1.6) : Math.min(w / WORLD_W, h / WORLD_H) * 1.05;
    this.world.scale.set(scale);
    this.world.position.set((w - WORLD_W * scale) / 2, (h - WORLD_H * scale) / 2);
  }

  zoom(factor: number, cx = this.app.screen.width / 2, cy = this.app.screen.height / 2) {
    const old = this.world.scale.x;
    const next = Math.max(0.3, Math.min(4, old * factor));
    const k = next / old;
    this.world.position.set(cx - (cx - this.world.position.x) * k, cy - (cy - this.world.position.y) * k);
    this.world.scale.set(next);
  }

  private drawTerrain(): Container {
    const layer=new Container();this.terrainDecor=[];
    for(let sum=0;sum<2*MAP_SIZE-1;sum++)for(let i=0;i<MAP_SIZE;i++){
      const j=sum-i;if(j<0||j>=MAP_SIZE)continue;
      const art=tileArtAt(i,j,this.region);
      const landmark=landmarksForMap(this.region).find(l=>landmarkContains(l,i,j));
      // 大桥完整素材覆盖原桥梁格；未加载到大桥时仍用原桥梁瓦片/程序回退。
      if(landmark?.kind==='bridge'&&this.textures[landmark.key])art.key='terrain_water_calm_1x1_a';
      if(landmark?.elevation)art.elevation=landmark.elevation;
      const texture=this.textures[art.key];
      if(texture){
        const foundation=this.textures.terrain_grass_1x1_a;
        if(!foundation&&art.elevation>0){const base=new Graphics();this.drawTerrainFallback(base,i,j,art);layer.addChild(base);}
        for(let level=foundation?0:art.elevation;level<=art.elevation;level++){
          const tile=new Sprite(level===art.elevation?texture:foundation);tile.scale.set(.5);
          tile.tint=terrainTint(art.key,this.region);
          const [x,y]=P(i+1,j+1);tile.position.set(x,y-level*TILE_SIDE_HEIGHT);layer.addChild(tile);
        }
      }else{
        const tile=new Graphics();this.drawTerrainFallback(tile,i,j,art);layer.addChild(tile);
      }
      if(art.decor&&!this.occupied.has(`${i},${j}`))this.terrainDecor.push({i,j,elevation:art.elevation,key:art.decor});
    }
    return layer;
  }

  update(state: GameState, selectedId: string | null, mapId = 'city') {
    if(this.pending?.[2]!==mapId)this.clearSalesEffects();
    this.salesAnchors.clear();
    this.pending=[state,selectedId,mapId];
    if(!this.ready){
      const years=state.day/(defaultConfig.time.daysPerMonth*12);
      this.urbanization=urbanization(years,builtArea(allMapProjects(state),id=>district(defaultConfig,id).mapId===mapId));
      return;
    }
    const owners=new Map(state.rivals.flatMap(r=>r.company.projects.map(p=>[p.id,r.name] as const)));
    const auctions=state.auctions.filter(a=>district(defaultConfig,a.districtId).mapId===mapId);
    // 旧清盘楼仅在地块未再开发时保留；避免透明施工图后面露出历史楼体。
    const visible=visibleMapProjects(allMapProjects(state).filter(p=>district(defaultConfig,p.districtId).mapId===mapId),auctions);
    const occupied=new Set((mapId==='city'?backgroundBuildings:[]).map(b=>`${b.i},${b.j}`));
    for(const l of landmarksForMap(mapId))for(let i=l.i;i<l.i+l.cells;i++)for(let j=l.j;j<l.j+l.cells;j++)occupied.add(`${i},${j}`);
    for(const p of visible)for(const[i,j]of p.tiles)occupied.add(`${i},${j}`);
    for(const a of auctions)for(const[i,j]of a.tiles)occupied.add(`${i},${j}`);
    // 城市自然生长：随年份与本图已交付面积扩张，不占用模拟地块
    const years=state.day/(defaultConfig.time.daysPerMonth*12);
    const built=builtArea(allMapProjects(state),id=>district(defaultConfig,id).mapId===mapId);
    const growth=growthTiles(mapId,urbanization(years,built),occupied,(i,j)=>roadAt(i,j,mapId));
    this.urbanization=urbanization(years,built);
    for(const g of growth)occupied.add(`${g.i},${g.j}`);
    const signature=mapId+'|'+[...occupied].sort().join(';');
    if(this.terrainSignature!==signature){
      this.region=mapId;this.occupied=occupied;this.terrainSignature=signature;
      this.world.removeChild(this.terrain);this.terrain.destroy({children:true});this.terrain=this.drawTerrain();this.world.addChildAt(this.terrain,0);
    }

    this.dynamic.removeChildren().forEach((c) => c.destroy());
    this.labels.removeChildren().forEach((c) => c.destroy());
    const blocks:Block[]=(mapId==='city'?backgroundBuildings:[]).map((b,index)=>({
      order:b.i+b.j+1,draw:gg=>{
        const texture=this.textures[backgroundArtKey(index)];
        if(texture){const sprite=new Sprite(texture);sprite.scale.set(.5);sprite.position.set(...P(b.i+1,b.j+1));this.dynamic.addChild(sprite);}
        else blockAt(b.i,b.j,1,b.h,COLORS.city)(gg);
      },
    }));
    const growthHeight={0:0,1:46,2:78,3:120};
    for(const g of growth)blocks.push({order:g.i+g.j+1,draw:gg=>{
      const texture=this.textures[g.key];
      if(texture){const sprite=new Sprite(texture);sprite.scale.set(spriteScale(g.key,1));sprite.position.set(...P(g.i+1,g.j+1));this.dynamic.addChild(sprite);}
      else if(g.tier>0)blockAt(g.i,g.j,1,growthHeight[g.tier],COLORS.city)(gg);
    }});
    for(const decor of this.terrainDecor)blocks.push({order:decor.i+decor.j+1,draw:gg=>{
      const texture=this.textures[decor.key];
      if(texture){const sprite=new Sprite(texture);sprite.scale.set(.5);const[x,y]=P(decor.i+1,decor.j+1);sprite.position.set(x,y-decor.elevation*TILE_SIDE_HEIGHT);this.dynamic.addChild(sprite);}
      else this.drawDecorationFallback(gg,decor);
    }});
    for(const landmark of landmarksForMap(mapId))blocks.push({order:landmark.i+landmark.j+landmark.cells,draw:gg=>{
      const texture=this.textures[landmark.key];
      if(texture){const sprite=new Sprite(texture);sprite.scale.set(.5);const[x,y]=P(landmark.i+landmark.cells,landmark.j+landmark.cells);sprite.position.set(x,y-landmark.elevation*TILE_SIDE_HEIGHT);this.dynamic.addChild(sprite);}
      else this.drawLandmarkFallback(gg,landmark);
    }});
    for(const a of auctions){
      const sel=a.id===selectedId,key=parcelArtKey('auction',a.tiles),texture=key?this.textures[key]:null,{i,j,cells}=plotGeometry(a.tiles);
      blocks.push({order:i+j+cells,draw:gg=>{
        if(texture&&key){const sprite=new Sprite(texture);sprite.scale.set(spriteScale(key,cells));sprite.position.set(...P(i+cells,j+cells));this.dynamic.addChild(sprite);}
        const outline=texture?new Graphics():gg;
        outline.poly(footprintPoly(a.tiles)).fill({color:COLORS.orange,alpha:texture?(sel ? .12 : 0):sel ? .35 : .18}).stroke({width:sel?4:2.5,color:sel?0xffffff:COLORS.orange});
        if(texture)this.dynamic.addChild(outline);
      }});
    }
    for(const p of visible){
      const {i:i0,j:j0,cells}=plotGeometry(p.tiles);
      const order = i0 + j0 + cells;
      const sel = p.id === selectedId;
      const key=projectArtKey(p),art=key?this.textures[key]:null;
      const scale=key?spriteScale(key,cells):.5;
      if(art){
        blocks.push({order,draw:()=>{
          // 选中边框属于地面，先画以免穿过楼体立面。
          if(sel){const outline=new Graphics();outline.poly(footprintPoly(p.tiles)).stroke({width:3,color:0xffffff});this.dynamic.addChild(outline);}
          // 本公司建成的楼：地面淡橙描边，满城高楼里也能认出自己的作品
          else if(!owners.has(p.id)){const mine=new Graphics();mine.poly(footprintPoly(p.tiles)).fill({color:COLORS.orange,alpha:.14}).stroke({width:2,color:COLORS.orange,alpha:.75});this.dynamic.addChild(mine);}
          const sprite=new Sprite(art);sprite.scale.set(scale);
          const [x,y]=P(i0+cells,j0+cells);sprite.position.set(x,y);this.dynamic.addChild(sprite);
        }});
      }else if(p.stage==='land'){
        blocks.push({order,draw:gg=>{
          const points=footprintPoly(p.tiles);gg.poly(points).fill({color:0x9a7b55,alpha:.65}).stroke({width:4,color:sel?0xffffff:COLORS.orange});
          for(let k=0;k<points.length;k+=2)gg.moveTo(points[k],points[k+1]).lineTo(points[k],points[k+1]-8).stroke({width:3,color:COLORS.orange});
        }});
      }else if (p.stage === 'construction' && p.progress < 0.08) {
        blocks.push({ order, draw: (gg) => { gg.poly(footprintPoly(p.tiles)).fill({ color: 0x9a7b55, alpha: 0.6 }).stroke({ width: sel ? 4 : 3, color: sel ? 0xffffff : COLORS.orange }); } });
      } else {
        const h = p.stage === 'construction' ? 16 + p.progress * 104 : 120;
        const pal = p.stage === 'construction' ? COLORS.build : COLORS.mine;
        const body = blockAt(i0, j0, cells, h, pal, 0.62);
        blocks.push({
          order,
          draw: (gg) => {
            body(gg);
            if (p.stage === 'construction') {
              const [cx, cy] = P(i0 + cells/2, j0 + cells/2);
              const top = cy - h - 40;
              gg.moveTo(cx + 10, cy).lineTo(cx + 10, top).moveTo(cx - 16, top + 8).lineTo(cx + 64, top - 16).stroke({ width: 3, color: COLORS.orange });
            }
            if (sel) gg.poly(footprintPoly(p.tiles)).stroke({ width: 3, color: 0xffffff });
          },
        });
      }
      if (activeProject(p) || p.stage==='closed'&&sel&&!owners.has(p.id)) {
        const [lx, ly] = P(i0 + cells/2, j0 + cells/2);
        const t = new Text({
          text: (owners.has(p.id)?owners.get(p.id)+' · ':'')+p.name.replace(/ P?L?\d+$/, ''),
          style: { fontFamily: 'Noto Sans SC, system-ui, sans-serif', fontSize: 13, fontWeight: '700', fill: 0xe8eaed, stroke: { color: 0x0f1419, width: 4 } },
        });
        t.anchor.set(0.5, 1);
        const labelY=art?P(i0+cells,j0+cells)[1]-(art.defaultAnchor?.y??1)*art.height*scale-6:ly-(p.stage==='land'?20:p.stage==='construction'?30+p.progress*104:130);
        t.position.set(lx,labelY);
        this.labels.addChild(t);
        if(!owners.has(p.id)){
          const status=salesStatus(state.rules??defaultConfig,state,p);
          if(status){
            const badge=new Text({text:`${status.text} · ${(soldRatio(p)*100).toFixed(0)}%`,style:{fontFamily:'system-ui, sans-serif',fontSize:12,fontWeight:'700',fill:status.tone==='muted'?0xb4bcc6:status.tone==='gold'?0xffcf6b:0x75e3b1,stroke:{color:0x0f1419,width:4}}});
            badge.anchor.set(.5,1);badge.position.set(lx,labelY-20);this.labels.addChild(badge);
            this.salesAnchors.set(p.id,[lx,labelY-42]);
          }
        }
      }
    }
    blocks.sort((a, b) => a.order - b.order).forEach((b) => {const layer=new Graphics();this.dynamic.addChild(layer);b.draw(layer);});
  }

  /** 成交飘字独立于静态图层，存档状态变化/重复重绘不会重新播放。 */
  showSales(projectId:string,text:string){
    const anchor=this.salesAnchors.get(projectId);if(!anchor)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const effect=new Container(),label=new Text({text,style:{fontFamily:'system-ui, sans-serif',fontSize:16,fontWeight:'800',fill:0xffdc88,stroke:{color:0x13251f,width:5}}});
    label.anchor.set(.5,1);effect.position.set(...anchor);effect.addChild(label);this.salesEffects.addChild(effect);
    let elapsed=0;
    const cleanup=()=>{this.app.ticker.remove(tick);this.salesAnimations.delete(cleanup);effect.destroy({children:true});};
    const tick=()=>{elapsed+=this.app.ticker.deltaMS;const t=Math.min(1,elapsed/2600);if(!reduced)effect.y=anchor[1]-t*38;effect.alpha=t<.7?1:(1-t)/.3;if(t>=1)cleanup();};
    this.salesAnimations.add(cleanup);this.app.ticker.add(tick);
  }

  clearSalesEffects(){for(const cleanup of this.salesAnimations)cleanup();}

  private screenToTile(x: number, y: number): Tile {
    const local = this.world.toLocal({ x, y });
    const u = (local.x - OX) / 32;
    const v = (local.y - OY) / 16;
    return [Math.floor((u + v) / 2), Math.floor((v - u) / 2)];
  }

  private drawTerrainFallback(g:Graphics,i:number,j:number,art:TileArt){
    const N=P(i,j),E=P(i+1,j),S=P(i+1,j+1),W=P(i,j+1),z=art.elevation*TILE_SIDE_HEIGHT;
    g.poly([W[0],W[1]-z,S[0],S[1]-z,S[0],S[1]+TILE_SIDE_HEIGHT,W[0],W[1]+TILE_SIDE_HEIGHT]).fill(0x826646);
    g.poly([S[0],S[1]-z,E[0],E[1]-z,E[0],E[1]+TILE_SIDE_HEIGHT,S[0],S[1]+TILE_SIDE_HEIGHT]).fill(0x715536);
    g.poly([N[0],N[1]-z,E[0],E[1]-z,S[0],S[1]-z,W[0],W[1]-z]).fill(tileColor(i,j,this.region)).stroke({width:1,color:0x0f1419,alpha:.1});
    if(art.road){
      const c=P(i+.5,j+.5);for(const[di,dj]of [[-1,0],[1,0],[0,-1],[0,1]])if(roadAt(i+di,j+dj,this.region)){
        const p=P(i+.5+di*.5,j+.5+dj*.5);g.moveTo(c[0],c[1]-z).lineTo(p[0],p[1]-z).stroke({width:9,color:0x6f7474});
      }
    }
  }

  private drawDecorationFallback(g:Graphics,d:{i:number;j:number;elevation:number;key:string}){
    const[x,y]=P(d.i+.5,d.j+.5);g.position.y=-d.elevation*TILE_SIDE_HEIGHT;
    if(d.key.includes('tree')){g.rect(x-2,y-19,4,19).fill(0x806043);g.ellipse(x,y-24,12,16).fill(0x486d45);if(d.key.includes('trees'))g.ellipse(x+10,y-16,9,12).fill(0x567c49);}
    else if(/rock|boulder/.test(d.key))blockAt(d.i+.2,d.j+.2,.6,8,[0xaaa99d,0x8e9087,0x787d76],.8)(g);
    else if(d.key.includes('lamp')){g.moveTo(x,y).lineTo(x,y-25).lineTo(x+6,y-25).stroke({width:2,color:0xa8aaa2});g.circle(x+6,y-24,3).fill(0xe3c48a);}
    else if(d.key.includes('bench')){g.moveTo(x-7,y).lineTo(x-7,y-5).moveTo(x+7,y).lineTo(x+7,y-5).stroke({width:2,color:0x777b73});g.moveTo(x-10,y-6).lineTo(x+10,y-6).stroke({width:4,color:0x9e8058});}
    else{g.ellipse(x,y-3,11,6).fill(0x547849);if(d.key.includes('flowers'))for(const[dx,dy]of [[-5,-4],[0,-7],[6,-3]])g.circle(x+dx,y+dy,2).fill(0xd9aa64);}
  }

  private drawLandmarkFallback(g:Graphics,l:Landmark){
    if(l.kind==='bridge')return; // 原桥梁瓦片/程序地形已经绘制。
    g.position.y=-l.elevation*TILE_SIDE_HEIGHT;
    if(l.kind==='stilts'){
      for(const[di,dj]of [[0,0],[1,0],[0,1]])blockAt(l.i+di,l.j+dj,1,20,COLORS.city,.65)(g);
    }else if(l.kind==='trail'){
      const points=[P(l.i,l.j+1.8),P(l.i+1.7,l.j+1.8),P(l.i+.3,l.j+.9),P(l.i+1.7,l.j+.9),P(l.i+1,l.j+.2)];
      points.forEach(([x,y],index)=>{if(index===0)g.moveTo(x,y);else g.lineTo(x,y-index*4);});g.stroke({width:5,color:0xb7b09c});
      blockAt(l.i+.7,l.j+.1,.5,12,COLORS.city)(g);
    }else{
      const[a,b]=[P(l.i,l.j+.5),P(l.i+2,l.j+.5)];
      g.moveTo(a[0],a[1]).lineTo(a[0],a[1]-43).moveTo(b[0],b[1]).lineTo(b[0],b[1]-43).stroke({width:3,color:0xb6b9b5});
      g.moveTo(a[0],a[1]-40).lineTo(b[0],b[1]-40).stroke({width:1,color:0x69757c});
      const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2-33;g.moveTo(x,y-7).lineTo(x,y).stroke({width:1,color:0x69757c});g.roundRect(x-5,y,10,8,2).fill(COLORS.orange);
    }
  }

  private bindInput() {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      this.dragDist = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.world.scale.x };
      }
    });
    stage.on('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.global.x, y: e.global.y };
      this.pointers.set(e.pointerId, cur);
      if (this.pointers.size === 2 && this.pinchStart) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const target = this.pinchStart.scale * (dist / this.pinchStart.dist);
        this.zoom(target / this.world.scale.x, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.dragDist += 10;
        return;
      }
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      this.dragDist += Math.abs(dx) + Math.abs(dy);
      this.world.position.set(this.world.position.x + dx, this.world.position.y + dy);
    });
    const end = (e: { pointerId: number; global: { x: number; y: number } }) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchStart = null;
      if (this.pointers.size === 0 && this.dragDist < 6) this.onTap(this.screenToTile(e.global.x, e.global.y));
    };
    stage.on('pointerup', end);
    stage.on('pointerupoutside', end);
    this.app.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.app.canvas.getBoundingClientRect();
        this.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );
  }
}
