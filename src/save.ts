// 脚本与既有回归的兼容入口；浏览器代码应使用 saveData 与 replayClient。
export * from './saveData.ts';
export {restore,previewV16,recoverV16} from './saveReplay.ts';
