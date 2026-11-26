/**
 * 音效事件 → 音效文件标识的映射(纯函数,表驱动)。
 *
 * 事件集合 = 组合根里能拿到的六个听觉反馈点:
 * - bite        咬钩(进入 bite 相位边沿)
 * - cast-splash 抛竿入水(进入 waiting 相位边沿)
 * - catch       捕获(进入 caught 相位边沿)
 * - escape      脱钩(进入 escaped 相位边沿)
 * - level-up    升级(组合根算出升级增量处,与升级提示同点)
 * - new-entry   新收录(组合根算出图鉴新收录处,与新收录提示同点)
 *
 * 文件标识同时是 public/sfx/ 下的文件名(<标识>.ogg),播放器按标识寻址。
 * 返回 null = 该事件暂无音效(表驱动的扩展位:批三的大满贯/倒计时沿用此签名)。
 */
export type SfxEvent =
  | 'bite'
  | 'cast-splash'
  | 'catch'
  | 'escape'
  | 'level-up'
  | 'new-entry'

/** 音效文件标识,即 public/sfx/ 下的文件名(不含扩展名) */
export type SfxId = string

/** 映射表:一行一个事件;未配音效的事件省略行(查询落空 → null) */
const SFX_TABLE: Partial<Record<SfxEvent, SfxId>> = {
  bite: 'bite',
  'cast-splash': 'cast-splash',
  catch: 'catch',
  escape: 'escape',
  'level-up': 'level-up',
  'new-entry': 'new-entry',
}

/** 查事件对应的音效文件标识;null = 未配音效,播放器对 null 空操作 */
export function sfxForEvent(event: SfxEvent): SfxId | null {
  return SFX_TABLE[event] ?? null
}
