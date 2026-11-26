/**
 * 限时局结算提示文案(纯函数,票 #24):「本局得分 X」必现,
 * 破纪录才追加「破纪录!」——是否破纪录的判定源在组合根
 * (timedBest.recordIfHigher 的返回值,归零定格分上恰好调用一次),本函数只管文案。
 */
export function roundSettlementText(roundScore: number, recordBroken: boolean): string {
  return recordBroken ? `本局得分 ${roundScore} · 破纪录!` : `本局得分 ${roundScore}`
}
