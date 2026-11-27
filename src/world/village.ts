import villageJson from './village.json'
import { parseWorldMap, type WorldMapData } from './worldMap'

/**
 * 村舍场景图(票 #34,spec §1.1):随包构建的单张世界地图
 * (Vite JSON import,免运行时 fetch;测试可直接 import 同一份数据)。
 */
export const village: WorldMapData = parseWorldMap(villageJson)
