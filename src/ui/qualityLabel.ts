import type { FishQuality } from '../core/types'

/**
 * 品质名(GLOSSARY 品质:普通/银星/金星,票 #39):
 * 银星/金星是渔获的星标,普通无星标——背包/卖鱼列表与捕获结算文本据此
 * 只给银/金星注记,普通渔获不添噪音。
 */
export function qualityLabel(quality: FishQuality): string {
  if (quality === 'silver') return '银星'
  if (quality === 'gold') return '金星'
  return ''
}
