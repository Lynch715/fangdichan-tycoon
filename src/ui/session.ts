import {defaultConfig,buildSessionConfig,DIFFICULTIES,validateSessionOptions,type SessionOptions,type GameState,type Config} from '../sim/index.ts';
import {COMPANY_NAME_MAX} from '../sim/sessionConfig.ts';
import {esc,yi} from './format.ts';
import type {Game} from '../game.ts';

export function sessionPanel(c:Config,s:GameState):string {
 const x=s.session;if(!x)return '<section class="session-card"><b>选择开局</b><p class="small muted">选择模式和难度后开始经营。</p><button data-act="restart">设置新游戏</button></section>';
 const o=x.options,mode=o.mode==='challenge'?c.sessions.challenges[o.challenge].name:o.mode==='sandbox'?'沙盒经营':'生涯经营';
 let content='';
 if(o.mode==='challenge'){
  const remaining=Math.max(0,Math.ceil((x.targetDay!-s.day)/c.time.daysPerMonth));
  const progress=o.challenge==='sales'?`${yi(x.sales)} / ${yi(c.sessions.challenges.sales.targetSales)}`:o.challenge==='delivery'?`已交付 ${x.deliveredProjectIds.length} / ${x.requiredProjectIds.length} 个目标项目`:`距本轮下行结束 ${remaining} 个月`;
  content=`<b class="${x.result==='won'?'ok-text':x.result==='lost'?'danger-text':''}">${x.result==='running'?progress:x.result==='won'?'挑战完成':'挑战失败'}</b><p class="small muted">${x.result==='running'?`剩余 ${remaining} 个月。${o.challenge==='sales'?'只计本公司新增权益销售，增资和借款不计入。':o.challenge==='delivery'?'交付前转让或被接管即失败；须恢复正常经营。':'结束时须正常经营、现金非负且净资产为正。'}`:esc(x.reason)+'；结果已记录，可继续经营。'+(o.challenge==='sales'?` 累计 ${yi(x.sales)}。`:'')}</p>`;
 }else if(o.mode==='sandbox'){
  content=`<p class="small muted">全部地图已开放。现金不足时自动注资防止公司破产；项目仍按实际工程和交付规则运行。</p><button data-act="sandbox-grant">注入 ${yi(c.sessions.sandbox.grant)} 沙盒资金</button><p class="small muted">额外注资累计 ${yi(x.sandboxCapitalIn)}，列资本投入，不计利润。</p>`;
 }else content=`<p class="small muted">第 ${c.time.careerYears} 年结算生涯，可继续经营。${x.origin==='legacy'?'旧档按标准生涯续玩，历史保留。':''}</p>`;
 return `<section class="session-card"><div class="row between"><b>${esc(mode)}</b><span class="pill">${esc(c.sessions.difficulties[o.difficulty].name)}</span></div>${content}</section>`;
}

const NAME_HEADS=['渝江','嘉陵','朝天','两江','南山','鹅岭','歌乐','磁器口','解放','龙湖湾','长滨','云岭','金沙','白鹭'];
const NAME_TAILS=['置业','地产','发展','城建','实业','控股','集团','建设'];
/** 随机公司名（避开同行与默认名）。界面草稿用，不进模拟。 */
export function randomCompanyName(rand=Math.random):string {
 const taken=new Set([defaultConfig.start.companyName,...defaultConfig.rivals.companies.map(r=>r.name)]);
 for(let i=0;i<20;i++){const n=NAME_HEADS[Math.floor(rand()*NAME_HEADS.length)]+NAME_TAILS[Math.floor(rand()*NAME_TAILS.length)];if(!taken.has(n))return n;}
 return '渝江置业';
}

export function setupMarkup(options:SessionOptions,replace:boolean,companyName=''):string {
 const c=buildSessionConfig(defaultConfig,options),challenge=options.mode==='challenge'?options.challenge:'sales';
 const choices=Object.entries(defaultConfig.sessions.challenges).map(([id,terms])=>`<option value="${id}" ${challenge===id?'selected':''}>${esc(terms.name)}</option>`).join('');
 let brief='从一家新公司起步，在30年生涯中开发项目、融资和应对市场周期。';
 if(options.mode==='sandbox')brief='全部地图首日开放，可主动注入资金，现金缺口会自动补资。仍保留真实成本、借款、监管、停工和交付，不参与挑战。';
 else if(options.mode==='challenge'){
  if(challenge==='sales')brief=`大型公司开局，首日开放全部地图，每季供地 ${c.land.parcelsPerQuarter.join('–')} 宗，地块面积 ${c.land.siteAreaRange.map(n=>(n/10000).toFixed(0)).join('–')} 万㎡。5年内新增权益销售达到1000亿元；借款、增资、旧合同均不计入。`;
  else if(challenge==='downturn')brief='以实际橙档承接3处在建项目、14亿元长期借款，监管已生效。走出本轮下行时须正常经营、现金非负且净资产为正；下行时长由本局种子决定。';
  else brief=`接手已违约的嘉岳置业：原现金缺口1亿元，6亿元债务，2处已停工4个月的在建项目及其预售交付义务。救助资本 ${yi(c.start.cash)} 到账后，36个月内由本公司全部交付并恢复正常经营；交付前转让或政府接管均失败。`;
 }
 const preset=c.sessions.difficulties[options.difficulty];
 const actualCash=options.mode==='challenge'&&challenge==='delivery'?c.start.cash+c.sessions.challenges.delivery.openingCash:c.start.cash;
 return `<h2 id="setup-title">${replace?'重新开始':'选择你的开局'}</h2><p class="small muted">模式与难度在开局后固定，随存档保留。</p><form id="setup-form" class="setup-form">
 <label for="setup-mode">游戏模式</label><select id="setup-mode" name="mode"><option value="career" ${options.mode==='career'?'selected':''}>生涯</option><option value="challenge" ${options.mode==='challenge'?'selected':''}>挑战</option><option value="sandbox" ${options.mode==='sandbox'?'selected':''}>沙盒</option></select>
 <div ${options.mode==='challenge'?'':'hidden'}><label for="setup-challenge">挑战关卡</label><select id="setup-challenge" name="challenge">${choices}</select></div>
 ${options.mode==='challenge'&&challenge==='delivery'
   ?`<p class="small muted">公司名称：${esc(c.start.companyName)}（本关为接管剧情，沿用原公司名）</p>`
   :`<label for="setup-name">公司名称</label><div class="row"><input id="setup-name" name="companyName" maxlength="${COMPANY_NAME_MAX}" autocomplete="off" placeholder="${esc(defaultConfig.start.companyName)}" value="${esc(companyName)}"><button type="button" class="ghost" data-setup-random>随机</button></div>`}
 <label for="setup-difficulty">难度</label><select id="setup-difficulty" name="difficulty">${DIFFICULTIES.map(id=>`<option value="${id}" ${options.difficulty===id?'selected':''}>${esc(c.sessions.difficulties[id].name)}</option>`).join('')}</select>
 <p class="setup-brief">${brief}</p><dl class="setup-facts"><div><dt>开局可用现金</dt><dd>${yi(actualCash)}</dd></div><div><dt>周期幅度</dt><dd>${preset.cycleStrength} 倍</dd></div><div><dt>监管预警</dt><dd>${c.regulation.startYear===1?'已生效':`提前 ${c.regulation.announceMonthsBefore} 个月`}</dd></div><div><dt>AI 激进程度</dt><dd>${preset.aiAggression} 倍</dd></div></dl>
 ${replace?'<p class="warn-text small">确认后替换当前进度。建议先导出存档；本机另保留一份重开前备份。</p>':''}<p data-setup-error class="danger-text" role="status"></p><div class="row"><button type="button" class="ghost" data-setup-cancel>${replace?'取消，继续当前游戏':'稍后选择'}</button><button type="submit">${replace?'确认重开':'开始经营'}</button></div></form>`;
}

const NAME_KEY='fdc-company-name';
/** 草稿只在控制器中；确认才调用Game.restart，取消没有经营指令或存档写入。 */
export class SessionController {
 private game:Game;private dialog:HTMLDialogElement;private afterStart:()=>void;
 private options:SessionOptions={mode:'career',difficulty:'standard'};private replace=false;
 /** 公司名草稿：默认上次用过的名字（只存本机）。 */
 private companyName=(()=>{try{return localStorage.getItem(NAME_KEY)??'';}catch{return '';}})();
 constructor(game:Game,dialog:HTMLDialogElement,afterStart:()=>void){
  this.game=game;this.dialog=dialog;this.afterStart=afterStart;
  dialog.addEventListener('input',e=>{if((e.target as HTMLElement).id==='setup-name')this.companyName=(e.target as HTMLInputElement).value;});
  dialog.addEventListener('change',e=>{
   if((e.target as HTMLElement).id==='setup-name')return; // 改名不重绘表单
   const mode=(dialog.querySelector('#setup-mode') as HTMLSelectElement).value;
   const difficulty=(dialog.querySelector('#setup-difficulty') as HTMLSelectElement).value;
   const challenge=(dialog.querySelector('#setup-challenge') as HTMLSelectElement).value;
   const next=validateSessionOptions({mode,difficulty,...(mode==='challenge'?{challenge}:{})});
   if(next){const focused=(document.activeElement as HTMLElement)?.id;this.options=next;this.paint();if(focused)dialog.querySelector<HTMLElement>(`#${focused}`)?.focus();}
  });
  dialog.addEventListener('click',e=>{
   const t=e.target as HTMLElement;
   if(t.closest('[data-setup-cancel]'))dialog.close();
   if(t.closest('[data-setup-random]')){this.companyName=randomCompanyName();const input=dialog.querySelector<HTMLInputElement>('#setup-name');if(input)input.value=this.companyName;}
  });
  dialog.addEventListener('submit',e=>{
   e.preventDefault();
   const name=this.companyName.trim(),delivery=this.options.mode==='challenge'&&this.options.challenge==='delivery';
   const result=game.restart(name&&!delivery?{...this.options,companyName:name}:this.options);
   if(result.ok){if(name&&!delivery)try{localStorage.setItem(NAME_KEY,name);}catch{/* 只是不记住 */}dialog.close();this.afterStart();}
   else dialog.querySelector('[data-setup-error]')!.textContent=result.error??'开局失败，原进度已保留';
  });
 }
 open(){this.replace=!this.game.needsSetup;this.game.setSpeed(0);this.paint();if(!this.dialog.open)this.dialog.showModal();}
 private paint(){this.dialog.innerHTML=setupMarkup(this.options,this.replace,this.companyName);}
}
