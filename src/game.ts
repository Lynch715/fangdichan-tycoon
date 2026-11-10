// 同步脚本/既有回归兼容入口。浏览器使用 GameCore 的异步 Worker 入口。
import {GameCore} from './gameCore.ts';
import {restore,previewV16,recoverV16} from './saveReplay.ts';
export * from './gameCore.ts';
export class Game extends GameCore {
 constructor(){super({restore,previewV16,recoverV16});}
}
