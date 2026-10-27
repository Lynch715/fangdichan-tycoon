// Focus prior feature tests on ordinary, unencumbered auctions. This uses the CURRENT
// kernel with only NEW B7 format weights B8 downgrade/call settings, and B9 additions controlled;
// no pre-existing economic parameter changes. Dedicated B7/B8/B9 tests use live defaults.
export * from '../../src/sim/index.ts';
import * as sim from '../../src/sim/index.ts';
import type {Config,GameState,Command,LoggedCommand,Strategy} from '../../src/sim/index.ts';
export const defaultConfig:Config=structuredClone(sim.defaultConfig);
defaultConfig.compliance.enabled=false;
defaultConfig.capitalRescue.enabled=false;
defaultConfig.housingPolicy.enabled=false;
defaultConfig.siteAttributes.enabled=false;
defaultConfig.regions.enabled=false;
defaultConfig.districts=defaultConfig.districts.filter(d=>d.id!=='outer');
defaultConfig.finance.covenants.fraction=0;
defaultConfig.finance.covenants.distressMonthsForC=defaultConfig.finance.distressMonthsToBankrupt;
defaultConfig.auctions.formats={ascending:1,lottery:0,amenity:0};
defaultConfig.auctions.baseAmenities.none.weight=1;
defaultConfig.auctions.baseAmenities.school.weight=0;
defaultConfig.auctions.baseAmenities.affordable.weight=0;
export const newGame=(seed:number,c=defaultConfig)=>sim.newGame(seed,c);
export const stepDay=(s:GameState,c=defaultConfig)=>sim.stepDay(s,c);
export const applyCommand=(s:GameState,command:Command,c=defaultConfig)=>sim.applyCommand(s,command,c);
export const replay=(seed:number,log:LoggedCommand[],day:number,c=defaultConfig)=>sim.replay(seed,log,day,c);
export const runGame=(seed:number,strategy:Strategy,years:number,c=defaultConfig)=>sim.runGame(seed,strategy,years,c);
