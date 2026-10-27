// 构建后枚举实际产物，带内容哈希的独立缓存；不请求远程字体或第三方资源。
import {offlineWorker} from './offline-template.ts';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(join(dir,x.name)):[join(dir,x.name)]);}
const paths=files('dist').filter(x=>!x.endsWith('/sw.js')).sort();
const hash=createHash('sha256');hash.update(offlineWorker('',[]));for(const path of paths)hash.update(readFileSync(path));
const version=hash.digest('hex').slice(0,16);
const urls=paths.map(x=>'./'+x.slice(5));
writeFileSync('dist/sw.js',offlineWorker(version,urls));
console.log(`离线缓存 ${version}：${urls.length} 个本地文件`);
