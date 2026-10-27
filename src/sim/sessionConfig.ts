import type {Config} from './config.ts';

export const GAME_MODES=['career','challenge','sandbox'] as const;
export const DIFFICULTIES=['easy','standard','hard'] as const;
export const CHALLENGES=['sales','downturn','delivery'] as const;
export type GameMode=typeof GAME_MODES[number];
export type Difficulty=typeof DIFFICULTIES[number];
export type ChallengeId=typeof CHALLENGES[number];
export type SessionOptions=
 | {mode:'career'|'sandbox';difficulty:Difficulty}
 | {mode:'challenge';difficulty:Difficulty;challenge:ChallengeId};

/** 校验开局选择，返回独立的规范化值；不读取或修改当前游戏。 */
export function validateSessionOptions(value:unknown):SessionOptions|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const options=value as Record<string,unknown>;
 if(!GAME_MODES.includes(options.mode as GameMode)||!DIFFICULTIES.includes(options.difficulty as Difficulty))return null;
 const difficulty=options.difficulty as Difficulty;
 if(options.mode==='challenge'){
  if(!CHALLENGES.includes(options.challenge as ChallengeId))return null;
  return {mode:'challenge',difficulty,challenge:options.challenge as ChallengeId};
 }
 if(options.challenge!==undefined)return null;
 return {mode:options.mode as 'career'|'sandbox',difficulty};
}

/**
 * 从未应用难度的基础配置派生独立规则。调用者必须保存该结果供整局共用，
 * 不能在每次结算时再次叠乘。标准档逐值保留基础配置（含自定义测试参数）。
 * B13a只提供派生函数；开局指令、存档版本与场景在B13b接入。
 */
export function buildDifficultyConfig(base:Config,difficulty:Difficulty):Config {
 if(!DIFFICULTIES.includes(difficulty))throw new Error('未知难度');
 const config=structuredClone(base);
 const preset=base.sessions.difficulties[difficulty];
 config.start.cash*=preset.initialCashFactor;
 if(preset.signalLeadFactor!==1){
  config.regulation.announceMonthsBefore=Math.max(0,Math.round(base.regulation.announceMonthsBefore*preset.signalLeadFactor));
 }
 if(preset.cycleStrength!==1){
  for(const phase of config.cycle.phases){
   phase.priceDrift*=preset.cycleStrength;
   phase.absorption=Math.max(base.sessions.minimumAbsorption,1+(phase.absorption-1)*preset.cycleStrength);
   phase.sentiment=Math.max(0,Math.min(100,base.sessions.neutralSentiment+(phase.sentiment-base.sessions.neutralSentiment)*preset.cycleStrength));
  }
 }
 if(preset.aiAggression!==1){
  for(const rival of config.rivals.companies){
   rival.premiumFactor*=preset.aiAggression;
   rival.trustUsage=Math.min(1,rival.trustUsage*preset.aiAggression);
   rival.devLoanUsage=Math.min(1,rival.devLoanUsage*preset.aiAggression);
   rival.minMargin/=preset.aiAggression;
   rival.cashReserve/=preset.aiAggression;
   rival.buildReserveRate/=preset.aiAggression;
   rival.maxActive=Math.max(1,Math.round(rival.maxActive*preset.aiAggression));
  }
 }
 return config;
}
