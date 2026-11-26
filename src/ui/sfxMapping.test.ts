import { describe, expect, it } from 'vitest'
import { sfxForEvent } from './sfxMapping'

/**
 * public/sfx 目录实际入库的音效文件标识(手写镜像;素材增删时同步维护,
 * 源头以目录与 THIRD-PARTY-NOTICES.md 为准)。测试进程不做磁盘读取,
 * 依赖面与既有用例保持一致。
 */
const SFX_FILES_ON_DISK = ['bite', 'cast-splash', 'catch', 'escape', 'level-up', 'new-entry']

/**
 * 接缝:事件 → 音效映射(纯函数,表驱动,期望值为独立字面量)。
 * 音效文件入库于 public/sfx/<标识>.ogg;标识同时是文件名与播放器寻址键。
 * 期望值逐行手写字面量钉死映射表:任何一行的静默漂移(换文件/漏配)都会在此暴露。
 */
describe('sfxForEvent(接缝:事件 → 音效映射)', () => {
  it('六个事件逐一映射到约定的音效文件标识', () => {
    expect(sfxForEvent('bite')).toBe('bite')
    expect(sfxForEvent('cast-splash')).toBe('cast-splash')
    expect(sfxForEvent('catch')).toBe('catch')
    expect(sfxForEvent('escape')).toBe('escape')
    expect(sfxForEvent('level-up')).toBe('level-up')
    expect(sfxForEvent('new-entry')).toBe('new-entry')
  })

  it('映射结果必须是已入库清单内的音效文件(表与素材库一致)', () => {
    for (const event of ['bite', 'cast-splash', 'catch', 'escape', 'level-up', 'new-entry'] as const) {
      const id = sfxForEvent(event)
      expect(id, `事件 ${event} 的音效文件 ${id}.ogg 未入库`).not.toBeNull()
      expect(SFX_FILES_ON_DISK, `事件 ${event} 的音效文件 ${id}.ogg 未入库`).toContain(id)
    }
  })
})
