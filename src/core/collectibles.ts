/**
 * 收藏品目录(票 #40 立缝,spec §4.4;内容表由票 #41 宝箱落地时填充):
 * 收藏品 = 宝箱产出的观赏物品,存于背包/储物箱,无玩法消耗(GLOSSARY 收藏品)。
 * 本票只立单一来源:背包/储物箱 store 的收藏品分区按本表校验(目录外忽略),
 * 背包/储物箱两块面板按本表取显示名;表为空 = 还没有收藏品(面板空区占位)。
 * #41 落地内容表时往 COLLECTIBLES 追加条目即可,store/面板两侧自动跟随。
 */
export interface CollectibleDef {
  /** 物品 id(kv 快照与堆叠键;目录外 id 不入包) */
  id: string
  /** 显示名(面板行文案) */
  name: string
}

/** 收藏品目录(词条序即面板行序;id 唯一) */
export const COLLECTIBLES: readonly CollectibleDef[] = []

/** 收藏品显示名(目录外 id = null;面板不渲染目录外条目) */
export function collectibleName(id: string): string | null {
  return COLLECTIBLES.find(c => c.id === id)?.name ?? null
}
