import type{BuildingAppearance,BuildingProduct}from'./sim/types.ts';
export const PRODUCT_NAMES:Record<BuildingProduct,string>={tower:'高层住宅',garden:'洋房',villa:'别墅',commercial:'商业裙楼'};
export function appearanceOf(p:{districtId:string;appearance?:BuildingAppearance}):BuildingAppearance {
 return p.appearance??{product:['nanan','bishan','jiangjin'].includes(p.districtId)?'garden':'tower',variant:'a'};
}
