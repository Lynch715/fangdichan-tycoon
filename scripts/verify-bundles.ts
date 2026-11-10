// 验证首屏预算及按需模块离线完整性；不靠屏蔽构建提示验收拆包。
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
interface Entry {file:string;isEntry?:boolean;imports?:string[]}
const manifest=JSON.parse(readFileSync('dist/build-manifest.json','utf8')) as Record<string,Entry>;
const key=Object.keys(manifest).find(k=>manifest[k].isEntry);if(!key)throw Error('缺少入口构建记录');
const seen=new Set<string>(),initial=new Set<string>();
function visit(k:string){if(seen.has(k))return;seen.add(k);const entry=manifest[k];if(!entry)throw Error('缺失构建依赖 '+k);initial.add(entry.file);for(const child of entry.imports??[])visit(child);}
visit(key);
const bytes=[...initial].filter(p=>p.endsWith('.js')).reduce((n,p)=>n+statSync(join('dist',p)).size,0);
if(bytes>500_000)throw Error(`首屏JS ${bytes}字节超过500KB预算`);
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
const built=files('dist').map(p=>p.slice(5));
const deferred=['saveWorker-','saveReplay-','isoMap-'].map(part=>built.find(p=>p.includes(part)&&p.endsWith('.js')));
if(deferred.some(p=>!p))throw Error('缺少独立的读档/历史/地图模块');
if(deferred.some(p=>initial.has(p!)))throw Error('按需模块重新进入首屏依赖');
const worker=readFileSync('dist/sw.js','utf8'),match=worker.match(/const FILES=(\[[^;]+\]);/);
if(!match)throw Error('缺少离线清单');const cached=new Set(JSON.parse(match[1]) as string[]);
for(const p of built.filter(p=>p!=='sw.js'))if(!cached.has('./'+p))throw Error('按需资源未离线缓存 '+p);
console.log(JSON.stringify({initialJsBytes:bytes,initial:[...initial],deferred,offlineFiles:cached.size}));
