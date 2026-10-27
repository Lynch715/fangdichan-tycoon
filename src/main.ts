import{CapitalController}from'./ui/capitalController.ts';
import {SessionController,sessionPanel} from './ui/session.ts';
import{districtsPanel}from'./ui/regions.ts';
import{issueBondFromForm}from'./ui/bondController.ts';
import{AuctionController}from'./ui/auctionController.ts';
import{AcquisitionController}from'./ui/acquisitionController.ts';
import './style.css';
import { Game, type Speed } from './game.ts';
import { IsoMap } from './render/isoMap.ts';
import {visibleMapProjects} from './render/cityArt.ts';
import { auctionsPanel, financePanel, headerDate, newsLine, projectsPanel, statusLine } from './ui/panels.ts';
import { allMapProjects,activeProject, district, mapUnlocked, type Pace, type Tile } from './sim/index.ts';
import type{BuildingProduct,BuildingVariant,ContractorId}from'./sim/types.ts';
import{ReportController}from'./ui/reportController.ts';
import{badgeText,inboxList,newsKey,unreadCount}from'./ui/inbox.ts';
import{goalTitle,goals,milestonesPanel,companyTitle,totalSales}from'./ui/milestones.ts';
import{yi}from'./ui/format.ts';
import{guideStep}from'./ui/guide.ts';

const PAUSE_TEXT: Record<string, string> = {
  startProject:'已暂停：拿地完成，请选择总包开工',
  settlement:'已暂停：项目清盘，查看结算',
  risk: '已暂停：项目风险事件或监管处罚，点此查看消息',
  auction: '已暂停：新一批土地挂牌',
  cashWarning: '已暂停：未来 3 个月到期款超过现金，可去财务页融资，或给项目放缓工程',
  regulation: '已暂停：监管政策变化',
  gameOver: '公司已破产清算',
  challenge:'已暂停：挑战结果已记录，可在财务页查看',
};

const game = new Game();
// 自动暂停偏好：只存在浏览器本地
const PAUSE_PREF='fdc-pause-auction';
try{if(localStorage.getItem(PAUSE_PREF)==='off')game.ignoredPauses.add('auction');}catch{/* 无本地存储时保持默认 */}
function syncPauseToggle(){const b=document.getElementById('auction-pause-toggle');if(b)b.textContent=`新地挂牌时自动暂停：${game.ignoredPauses.has('auction')?'关':'开'}`;}
let config = game.config;
let selectedId: string | null = null;
let mapId = 'city';
const auctionController=new AuctionController(game,document,r=>report(r,'出价已提交，开拍日揭晓结果'));
const bidDrafts=auctionController.bids,amenityDrafts=auctionController.amenities;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const reportController=new ReportController(game,config,$<HTMLDialogElement>('#reports-dialog'));
const capitalController=new CapitalController(game,$<HTMLDialogElement>('#capital-dialog'),r=>report(r,'股权自救方案已执行'));
const acquisitionController=new AcquisitionController(game,$<HTMLDialogElement>('#acquisition-dialog'),r=>report(r,'项目已收购，交付义务已承接'));
const sessionController=new SessionController(game,$<HTMLDialogElement>('#setup-dialog'),()=>{
 selectedId=null;mapId='city';bidDrafts.clear();amenityDrafts.clear();reportController.reset();resetCelebrations();setTab('map');render();map.fit();
});

// 已读标记只是界面偏好：存在浏览器本地，不进存档、不影响模拟。
const SEEN_KEY='fdc-inbox-seen';
let seenNews:string|null=(()=>{try{return localStorage.getItem(SEEN_KEY);}catch{return null;}})();
let highlightFrom:string|null=null; // 本次打开消息前的已读位置，用来在列表里标出“新”
const inboxOpen=()=>document.body.dataset.tab==='inbox'||document.body.dataset.inbox==='open';
function markNewsSeen(){
  const top=game.state.news[0];if(!top)return;
  const key=newsKey(top);if(key===seenNews)return;
  seenNews=key;try{localStorage.setItem(SEEN_KEY,key);}catch{/* 隐私模式等：只是不记住已读 */}
}

function setTab(tab: string) {
  document.body.dataset.tab = tab;
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if(tab==='inbox'){highlightFrom=seenNews;markNewsSeen();paintInbox();}
}

/** 点击当前已打开的标签收起面板，回到地图。 */
function toggleTab(tab:string){setTab(document.body.dataset.tab===tab&&tab!=='map'?'map':tab);}

function closeSheet(){if(document.body.dataset.inbox==='open')toggleInbox(false);else setTab('map');}

/** 桌面：消息弹层；手机：切到“消息”标签。 */
function toggleInbox(open=!inboxOpen()){
  if(matchMedia('(max-width: 820px)').matches){setTab(open?'inbox':'map');return;}
  if(open)document.body.dataset.inbox='open';else delete document.body.dataset.inbox;
  if(open){highlightFrom=seenNews;markNewsSeen();paintInbox();}
}

function paintInbox(){
  if(inboxOpen())markNewsSeen();
  const s=game.state,{total,warnings}=unreadCount(s.news,seenNews,config.start.companyName),text=badgeText(total);
  document.querySelectorAll<HTMLElement>('#inbox-badge,#tab-badge').forEach(b=>{b.textContent=text;b.classList.toggle('warn',warnings>0);});
  const list=$('#inbox-list');list.innerHTML=inboxList(config,s,inboxOpen()?highlightFrom:seenNews);
}

/** linkInbox：游戏事件类提示可点按，直接打开消息。 */
function toast(text: string, kind: 'info' | 'error' = 'info',linkInbox=false) {
  const el = $('#toast');
  el.textContent = text;
  if(linkInbox)el.dataset.act='toast';else el.removeAttribute('data-act');
  el.className = `toast show ${kind}${linkInbox?' link':''}`;
  window.clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => (el.className = 'toast'), 3500);
}

/** 庆祝条：开盘、售罄、交付、里程碑与每月销售。最多同时 3 条。 */
function cheer(text:string,kind:'big'|'sales'='big'){
  const host=$('#cheers'),el=document.createElement('div');
  el.className=`cheer ${kind}`;el.textContent=text;host.prepend(el);
  while(host.children.length>3)host.lastElementChild!.remove();
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300);},kind==='sales'?2600:4500);
}

type Snap={sold:boolean;out:boolean;del:boolean};
let prevProjects:Map<string,Snap>|null=null,prevMonth=-1,prevTitle=-1,silentGoals=false;
/** 新开局/导入存档后：已达成的目标静默记录，不补放庆祝。 */
function resetCelebrations(){prevProjects=null;prevMonth=-1;prevTitle=-1;silentGoals=true;}
function celebrate(){
  const s=game.state,dpm=config.time.daysPerMonth;
  const snap=new Map(s.projects.map(p=>[p.id,{sold:p.soldArea>0,out:p.saleableArea>0&&p.soldArea>=p.saleableArea*0.999,del:p.deliveredDay!==null} as Snap]));
  if(prevProjects)for(const p of s.projects){
    const a=prevProjects.get(p.id),b=snap.get(p.id)!;if(!a)continue;
    if(!a.sold&&b.sold)cheer(`🎉 ${p.name} 开盘热销，首批回款到账`);
    if(!a.out&&b.out)cheer(`🏆 ${p.name} 全部售罄！累计回款 ${yi(p.salesIn)}`);
    if(!a.del&&b.del)cheer(`🔑 ${p.name} 交付入伙${p.quality!==null&&p.quality>=config.quality.complaintThreshold?'，业主满意，品牌提升':''}`);
  }
  prevProjects=snap;
  const month=Math.floor(s.day/dpm),last=s.reports.months.at(-1);
  if(prevMonth>=0&&month>prevMonth&&last){
    let sales=0;for(const e of s.reports.journal.slice(last.fromEntry,last.toEntry))if(e.kind==='saleBooked')sales+=e.amount;
    if(sales>0)cheer(`本月销售 +${yi(sales)}`,'sales');
  }
  prevMonth=month;
  const title=companyTitle(totalSales(s));
  if(prevTitle>0&&title.level>prevTitle)cheer(`⭐ 公司晋级「${title.name}」`);
  prevTitle=title.level;
  // 里程碑：首次见到这局时只记录，不补放庆祝
  const key=`fdc-goals-${s.seed}`,done=goals(s).achieved;
  let seen:string[]|null=null;try{seen=JSON.parse(localStorage.getItem(key)??'null');}catch{seen=null;}
  if(seen&&!silentGoals){for(const id of done)if(!seen.includes(id))cheer(`✅ 达成目标：${goalTitle(id)}`);}
  if(!seen||silentGoals||done.length!==seen.length){try{localStorage.setItem(key,JSON.stringify(done));}catch{/* 只是不记住 */}}
  silentGoals=false;
}

/** 输入框获得焦点时不重绘该面板，避免打字被打断。 */
function paint(el: HTMLElement, html: string,force=false) {
  if (!force&&el.contains(document.activeElement) && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) return;
  const previous = new Map(Array.from(el.querySelectorAll<HTMLDetailsElement>('details')).map(d=>[d.dataset.key ?? '',d.open]));
  el.innerHTML = html;
  el.querySelectorAll<HTMLDetailsElement>('details').forEach(d=>{const key=d.dataset.key ?? '';if(previous.has(key))d.open=previous.get(key)!;});
}

function render() {
  config=game.config;
  const s = game.state;
  $('.company').textContent=config.start.companyName;
  paint($('#session'),sessionPanel(config,s));
  paint($('#milestones'),milestonesPanel(config,s));
  $('#storage-status').textContent = game.storageStatus;
  const suburb = document.querySelector<HTMLButtonElement>('[data-map="suburb"]')!;
  suburb.disabled = !mapUnlocked(s,config,'suburb');
  suburb.textContent = suburb.disabled ? `远郊 · 第 ${config.maps.suburbUnlockYear} 年开放` : '远郊区县';
  document.querySelectorAll<HTMLElement>('[data-map]').forEach(b=>b.classList.toggle('on',b.dataset.map===mapId));
  $('#date').textContent = headerDate(config, s);
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === game.speed));
  $('#sentiment').textContent = s.market.sentiment.toFixed(0);
  const st = statusLine(config, s);
  $('#m-cash').textContent = st.cash;
  $('#m-tier').textContent = st.tier;
  $('#m-tier').className = `pill tier-${st.tierIdx}`;
  $('#m-rating').textContent = st.rating;
  const b = s.regulation.breaches;
  $('#m-lights').innerHTML = [b.liabilityRatio, b.netGearing, b.cashToShortDebt].map((x) => `<span class="dot ${s.regulation.active && x ? 'red' : 'green'}"></span>`).join('');
  paint($('#finance'), financePanel(config, s,capitalController.selectedShare));
  paint($('#districts'),districtsPanel(config,s,mapId));
  paint($('#projects'), projectsPanel(config, s, selectedId));
  auctionController.prune();
  const shownAuctions=s.auctions.filter(a=>district(config,a.districtId).mapId===mapId),auctionHost=$('#auctions');
  const currentIds=Array.from(auctionHost.querySelectorAll<HTMLElement>('[data-select]')).map(el=>el.dataset.select).join(',');
  // 地块退出拍卖或切换片区时，即使仍在输入，也要移除过期卡片。
  paint(auctionHost,auctionsPanel(config,{...s,auctions:shownAuctions},selectedId,bidDrafts,amenityDrafts),currentIds!==shownAuctions.map(a=>a.id).join(','));
  for(const a of s.auctions)auctionController.refresh(a.id);
  $('#news').innerHTML = `<b class="news-label">新闻</b>${newsLine(config, s)}`;
  $('#auction-count').textContent = `${s.auctions.filter(a=>district(config,a.districtId).mapId===mapId).length} 宗`;
  map.update(s, selectedId, mapId);
  paintInbox();
  celebrate();
  const g=guideStep(s),guide=$<HTMLButtonElement>('#guide');
  guide.hidden=!g||game.needsSetup;
  if(g){guide.dataset.tab=g.tab;guide.innerHTML=`<span class="guide-step">${g.step}/${g.total}</span><span>${g.text}</span>${g.tab==='map'?'':'<span class="guide-go">›</span>'}`;}
  if (game.lastPause) {
    toast(PAUSE_TEXT[game.lastPause] ?? '已暂停','info',true);
    game.lastPause = null;
  }
  reportController.sync();
}

function onTap(tile: Tile) {
  const hit = (tiles: Tile[]) => tiles.some((t) => t[0] === tile[0] && t[1] === tile[1]);
  const a = game.state.auctions.find((x) => district(config,x.districtId).mapId===mapId && hit(x.tiles));
  const visible=visibleMapProjects(allMapProjects(game.state).filter(p=>district(config,p.districtId).mapId===mapId),game.state.auctions.filter(a=>district(config,a.districtId).mapId===mapId));
  const p = visible.find((x) => (activeProject(x)||x.stage==='abandoned') && hit(x.tiles));
  selectedId = a?.id ?? p?.id ?? null;
  if (a) setTab('land');
  else if (p) setTab('projects');
  else if (document.body.dataset.tab!=='map') setTab('map'); // 点地图空白处收起面板
  render();
  if (selectedId) document.querySelector(`[data-select="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const map = new IsoMap($('#map-canvas'), onTap);

// 手机底部面板：按住标题栏下拉超过 70px 收起。
document.querySelectorAll<HTMLElement>('.sheet-head').forEach(head=>{
  let startY:number|null=null;const sheet=head.closest<HTMLElement>('.panel')!;
  head.addEventListener('pointerdown',e=>{if((e.target as HTMLElement).closest('button'))return;startY=e.clientY;head.setPointerCapture(e.pointerId);sheet.style.transition='none';});
  head.addEventListener('pointermove',e=>{if(startY===null)return;const dy=Math.max(0,e.clientY-startY);sheet.style.transform=dy?`translateY(${dy}px)`:'';});
  const end=(e:PointerEvent)=>{if(startY===null)return;const dy=e.clientY-startY;startY=null;sheet.style.transition='';sheet.style.transform='';if(dy>70)closeSheet();};
  head.addEventListener('pointerup',end);head.addEventListener('pointercancel',end);
});

const amountFrom = (id: string) => Number((document.getElementById(id) as HTMLInputElement | null)?.value ?? 0) * 10000;

function report(r: { ok: boolean; error?: string }, okText: string) {
  if (r.ok) toast(okText);
  else toast(r.error ?? '操作失败', 'error');
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const act = target.closest<HTMLElement>('[data-act]');
  if (act) {
    const id = act.dataset.id ?? '';
    switch (act.dataset.act) {
      case 'strategic-investment':capitalController.open({type:'strategicInvestment',share:Number($<HTMLSelectElement>('#capital-share').value)});break;
      case 'restructure-debt':capitalController.open({type:'restructureDebt'});break;
      case 'acquire-project':
        acquisitionController.open(act.dataset.rival!,id);break;
      case 'reports':reportController.open(game.state.status==='bankrupt'?'review':'month');break;
      case 'sandbox-grant':report(game.issue({type:'sandboxGrant'}),'沙盒资金已到账，列为资本投入');break;
      case 'appearance': {
        const product=$<HTMLSelectElement>(`#appearance-product-${id}`).value as BuildingProduct;
        const variant=$<HTMLSelectElement>(`#appearance-variant-${id}`).value as BuildingVariant;
        report(game.issue({type:'setAppearance',projectId:id,product,variant}),'建筑外观已更新');
        break;
      }
      case 'import': $('#import-save').click();break;
      case 'export': {
        const url=URL.createObjectURL(new Blob([game.exportSave()],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='房地产大亨-存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;
      }
      case 'marketing':report(game.issue({type:'setMarketing',projectId:id,rate:(document.getElementById(`marketing-${id}`) as HTMLInputElement).valueAsNumber/100}),'营销投入已更新');break;
      case 'start-project':report(game.issue({type:'startProject',projectId:id,contractor:act.dataset.contractor as ContractorId}),'总包已选定，项目开工');break;
      case 'borrow-hidden': report(game.issue({type:'borrow',channel:'hidden',amount:amountFrom('hidden-amt')}),'明股实债资金已到账');break;
      case 'extend': report(game.issue({type:'extend',debtId:id}),'展期完成');break;
      case 'paper': {const p=game.state.projects.find(p=>p.id===id);if(p)report(game.issue({type:'setPaper',projectId:id,enabled:p.paperRatio===0}),'商票支付方式已更新');break;}
      case 'cooperate':
        if(confirm('引入合作方后，未来成本和回款按权益分摊，无法撤销。确定继续？'))report(game.issue({type:'cooperate',projectId:id}),'合作资金已到账');break;
      case 'file': report(game.issue({type:'filePrice',projectId:id}),'备案已申请');break;
      case 'divert':
        if(confirm('挪用监管款属于违规，抽查会要求补缴、罚款并冻结融资。确定执行？'))report(game.issue({type:'divert',projectId:id}),'监管资金已挪用，关注度上升');break;
      case 'sell':
        if(confirm('按当前报价转让并结清项目融资，买方承接后续交付。项目不能赎回。确定转让？'))report(game.issue({type:'sellProject',projectId:id}),'项目已转让');break;
      case 'borrow-bond':
        report(issueBondFromForm(game,document),'公司债已发行');break;
      case 'borrow-trust':
        report(game.issue({ type: 'borrow', channel: 'trust', amount: amountFrom('trust-amt') }), '信托资金已到账');
        break;
      case 'borrow-dev': {
        const projectId = ($('#dev-project') as HTMLSelectElement).value;
        report(game.issue({ type: 'borrow', channel: 'devLoan', amount: amountFrom('dev-amt'), projectId }), '开发贷已放款');
        break;
      }
      case 'repay':
        report(game.issue({ type: 'repay', debtId: id }), '已提前还款');
        break;
      case 'pace':
        game.issue({ type: 'setPace', projectId: id, pace: act.dataset.pace as Pace });
        break;
      case 'price': {
        const p = game.state.projects.find((x) => x.id === id);
        if (p) report(game.issue({ type: 'setPrice', projectId: id, priceFactor: p.priceFactor + Number(act.dataset.delta) }),'售价已更新');
        break;
      }
      case 'zoom-in':
        map.zoom(1.25);
        break;
      case 'zoom-out':
        map.zoom(0.8);
        break;
      case 'fit':
        map.fit();
        break;
      case 'restart':
        sessionController.open();
        break;
      case 'close-sheet':closeSheet();break;
      case 'inbox':toggleInbox();break;
      case 'toast':toggleInbox(true);$('#toast').className='toast';break;
      case 'toggle-auction-pause':{
        const off=!game.ignoredPauses.has('auction');if(off)game.ignoredPauses.add('auction');else game.ignoredPauses.delete('auction');
        try{localStorage.setItem(PAUSE_PREF,off?'off':'on');}catch{/* 只是不记住 */}
        syncPauseToggle();toast(off?'新地挂牌时不再自动暂停，可在消息里查看':'新地挂牌时会自动暂停');break;
      }
      case 'guide':if(act.dataset.tab&&act.dataset.tab!=='map')setTab(act.dataset.tab);break;
    }
    return;
  }
  const region=target.closest<HTMLElement>('[data-map]');
  if(region && mapUnlocked(game.state,config,region.dataset.map!)){mapId=region.dataset.map!;selectedId=null;render();map.fit();return;}
  const speed = target.closest<HTMLElement>('[data-speed]');
  if (speed) return game.setSpeed(Number(speed.dataset.speed) as Speed);
  const tab = target.closest<HTMLElement>('[data-tab]');
  if (tab) return toggleTab(tab.dataset.tab!);
  const sel = target.closest<HTMLElement>('[data-select]');
  if (sel && !target.closest('details') && !(target instanceof HTMLInputElement)) {
    selectedId = sel.dataset.select!;
    const selected = allMapProjects(game.state).find(p=>p.id===selectedId) ?? game.state.auctions.find(a=>a.id===selectedId);
    if(selected) mapId=district(config,selected.districtId).mapId;
    render();
  }
});

// 桌面消息弹层：在弹层外按下即关闭（地图画布会吞掉 click，所以用 pointerdown）。
document.addEventListener('pointerdown',e=>{
  const t=e.target as HTMLElement;
  if(document.body.dataset.inbox==='open'&&!t.closest('.panel.inbox,[data-act="inbox"]'))toggleInbox(false);
},true);

document.addEventListener('keydown', (e) => {
  if(document.querySelector('dialog[open]'))return;
  if(e.key==='Escape'&&(document.body.dataset.tab!=='map'||document.body.dataset.inbox==='open')){closeSheet();return;}
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    game.setSpeed(game.speed === 0 ? 1 : 0);
  }
});

async function start() {
  await game.init();
  reportController.reset();
  await map.init();
  setTab('map');syncPauseToggle();
  game.onChange(render);
  render();
  if(game.needsSetup)sessionController.open();
  let last = performance.now();
  const loop = (now: number) => {
    game.frame(now - last);
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

$('#import-save').addEventListener('change',async(e)=>{
  const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
  if(confirm('导入存档会替换当前进度，建议先导出备份。确定继续？')) {
    selectedId=null;mapId='city';bidDrafts.clear();amenityDrafts.clear();resetCelebrations();reportController.suspended=true;report(game.importSave(await file.text()),'存档已导入');reportController.reset();reportController.suspended=false;
  }
  input.value='';
});
window.addEventListener('pagehide' ,()=>game.save());
document.addEventListener('visibilitychange',()=>{if(document.hidden){game.setSpeed(0);game.save();}});
start().catch(e=>{toast(`启动失败：${e.message}`,'error');});
const offlineStatus=$('#offline-status');
if('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    const update=()=>{offlineStatus.textContent=reg.waiting?'离线缓存有更新，关闭本游戏所有标签后生效':reg.active?'离线缓存已就绪':'离线资源缓存中，请保持联网';};
    update();reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',update);});
    reg.installing?.addEventListener('statechange',update);
    navigator.serviceWorker.ready.then(update);
  }).catch(error=>{offlineStatus.textContent=`当前浏览器无法启用离线缓存：${error.message}`;});
} else offlineStatus.textContent=import.meta.env.PROD?'当前浏览器不支持离线缓存，请使用支持 PWA 的浏览器':'开发模式不启用离线缓存';
