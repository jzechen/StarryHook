/** 升级提示的输入快照:地基票返回的升级增量,补上登记后的当前等级(Lv.N 文案用) */
export interface ProgressionSnapshot {
  /** 本次登记连升的级数,0 = 未升级 */
  levelsGained: number
  /** 本次新解锁的竿名(连升跨档时是最终竿,中途竿不报);无新竿为 null */
  rodName: string | null
  /** 登记后的当前等级 */
  level: number
}

/** 升级提示文案;null = 不弹(未升级的捕获不弹) */
export function progressionToastText(s: ProgressionSnapshot): string | null {
  if (s.levelsGained <= 0) return null
  if (s.levelsGained === 1) {
    return s.rodName ? `升级!解锁${s.rodName}` : `升级!Lv.${s.level}`
  }
  return s.rodName ? `连升 ${s.levelsGained} 级!解锁${s.rodName}` : `连升 ${s.levelsGained} 级!`
}
