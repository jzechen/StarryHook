import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * DOM 皮肤令牌契约(票 #48,spec #45「星露谷风格全铺」):index.html `<style>`
 * 顶部 `:root` 一处定义、全 DOM 生效(#42 纪律延续)。#47 选型定案 = CC0 九宫格
 * 素材载体(public/ui/kenney-rpg/),本测试钉死全铺后的令牌存在性与几何约束:
 *
 *   - 新增画布面三令牌(顶栏裸文本/hint/seed 浮在场景上,暖米白 + 轻投影);
 *   - 素材载体下退役的旧令牌(含大满贯金带遗留)全文件零残留;
 *   - 素材件圆角自带,radius 三枚置 0;面板内浅底不投影;
 *   - #47 几何清单:商店面板 276→336px、按钮族 nowrap 防标签折行。
 *
 * 视觉本身不入单测(素材渲染、九宫格观感以无头截图自查为准,#48 验收口径)。
 */
const INDEX_URL = new URL('../../index.html', import.meta.url)
const html = readFileSync(INDEX_URL, 'utf8')

/** :root 令牌块(第一处 `<style>` 内,一处定义) */
const rootBlock = html.slice(html.indexOf(':root'), html.indexOf('}', html.indexOf(':root')))

function tokenValue(name: string): string | null {
  const match = rootBlock.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
  return match ? match[1]!.trim() : null
}

describe('皮肤令牌契约(票 #48:星露谷风格全铺)', () => {
  it(':root 仅一处定义(新风格一处定义全生效)', () => {
    expect(html.match(/:root/g)).toHaveLength(1)
  })

  it('新增画布面三令牌(#47 草案值):暖米白裸文字 + 暖金数字 + 轻投影', () => {
    expect(tokenValue('--ui-canvas-text')).toBe('#f2e7cf')
    expect(tokenValue('--ui-canvas-accent')).toBe('#ffd77a')
    expect(tokenValue('--ui-canvas-text-shadow')).toBe('0 1px 3px rgba(0, 0, 0, .55)')
  })

  it('素材载体下退役的旧令牌零残留(全文件,含注释)', () => {
    // --ui-row 用负向断言排除 --ui-row-raised / --ui-row-hover 前缀误伤
    const retired = [
      '--ui-surface-pill',
      '--ui-surface-toast',
      '--ui-titlebar',
      '--ui-row(?![\\w-])',
      '--ui-row-raised',
      '--ui-row-hover',
      '--ui-surface-hover',
      '--ui-band-gold',
      '--ui-gold-text',
    ]
    for (const name of retired) {
      expect(html.match(new RegExp(name)), name).toBeNull()
    }
  })

  it('批一/批二深色旧色值零残留(深青蓝面板面/浅青描边/金色强调/胶囊圆角)', () => {
    const darkLiterals = [
      'rgba(12, 47, 63',
      'rgba(23, 80, 107',
      'rgba(9, 34, 46',
      '#eaf4f6',
      '#9fb4ba',
      '#ffd23f',
      '999px',
    ]
    for (const literal of darkLiterals) {
      expect(html.includes(literal), literal).toBe(false)
    }
  })

  it('素材件圆角自带:radius 三枚置 0;面板内浅底不投影(--ui-text-shadow: none)', () => {
    expect(tokenValue('--ui-radius-panel')).toBe('0px')
    expect(tokenValue('--ui-radius-row')).toBe('0px')
    expect(tokenValue('--ui-radius-pill')).toBe('0px')
    expect(tokenValue('--ui-text-shadow')).toBe('none')
  })

  it('九宫格基件已接线(panel_brown 面框 / panelInset_brown 标题牌 / panel_beigeLight toast 牌)', () => {
    for (const asset of ['panel_brown.png', 'panelInset_brown.png', 'panelInset_beige.png', 'panel_beigeLight.png']) {
      expect(html.includes(`/ui/kenney-rpg/${asset}`), asset).toBe(true)
    }
  })

  it('#47 几何清单:商店面板 276→336px(九宫格边厚吃内容宽)', () => {
    expect(ruleMatches(/#shop-panel\s*\{[^}]*width:\s*336px/)).toBe(true)
  })

  it('按钮族 white-space: nowrap 防标签折行(#47 样张实测「卖 1」折行教训)', () => {
    expect(ruleMatches(/\.pill\s*\{[^}]*white-space:\s*nowrap/)).toBe(true)
    expect(ruleMatches(/\.shop-item\s+\.shop-buy\s*\{[^}]*white-space:\s*nowrap/)).toBe(true)
  })
})

/** 全文件规则块匹配(几何规则散在 :root 之外的各选择器) */
function ruleMatches(pattern: RegExp): boolean {
  return pattern.test(html)
}
