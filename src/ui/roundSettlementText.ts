import type { FishQuality } from '../core/types'
import { qualityLabel } from './qualityLabel'

/**
 * 限时局结算提示文案(纯函数,票 #24):「本局得分 X」必现,
 * 破纪录才追加「破纪录!」——是否破纪录的判定源在组合根
 * (timedBest.recordIfHigher 的返回值,归零定格分上恰好调用一次),本函数只管文案。
 */
export function roundSettlementText(roundScore: number, recordBroken: boolean): string {
  return recordBroken ? `本局得分 ${roundScore} · 破纪录!` : `本局得分 ${roundScore}`
}

/**
 * 捕获结算文本(纯函数,票 #39 结算文本注品质):「钓到了「鱼名」 +分 分!」必现,
 * 银/金星渔获在鱼名后注品质(普通无星标,不注)——spec §4.2 呈现项,
 * 沿 roundSettlementText 同款纯函数风格,由 Hud 在 caught 相位消费。
 */
export function catchSettlementText(fishName: string, score: number, quality: FishQuality): string {
  const mark = qualityLabel(quality)
  const qualityNote = mark ? `·${mark}` : ''
  return `钓到了「${fishName}」${qualityNote} +${score} 分!`
}
