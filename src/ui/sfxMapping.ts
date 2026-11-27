/**
 * 音效事件 → 音效文件标识的映射(纯函数,表驱动)。
 *
 * 事件集合 = 组合根里能拿到的十个听觉反馈点:
 * - bite          咬钩(进入 bite 相位边沿)
 * - cast-splash   抛竿入水(进入 waiting 相位边沿)
 * - catch         捕获(进入 caught 相位边沿)
 * - escape        脱钩(进入 escaped 相位边沿)
 * - level-up      升级(组合根算出升级增量处,与升级提示同点)
 * - new-entry     新收录(组合根算出图鉴新收录处,与新收录提示同点)
 * - grand-slam    池塘大满贯(票 #43→#44:与 main.ts 捕获沿的 grandSlam.start()
 *                 同点起播,演出层零改动)
 * - countdown     限时局最后 10 秒每秒一响(票 #44:整秒边沿,归零帧不响)
 * - footstep      行走脚步(票 #44:移动中按步频触发,停止即停)
 * - ambient-water 近水水声循环(票 #44:音量随最近水域距离淡入淡出,
 *                 循环播放走播放器的环境声通道 setAmbient,非一次性 play)
 *
 * 文件标识同时是 public/sfx/ 下的文件名(<标识>.ogg),播放器按标识寻址。
 * 返回 null = 该事件暂无音效(表驱动的扩展位:后续事件沿用此签名)。
 */
export type SfxEvent =
  | 'bite'
  | 'cast-splash'
  | 'catch'
  | 'escape'
  | 'level-up'
  | 'new-entry'
  | 'grand-slam'
  | 'countdown'
  | 'footstep'
  | 'ambient-water'

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
  'grand-slam': 'grand-slam',
  countdown: 'countdown',
  footstep: 'footstep',
  'ambient-water': 'ambient-water',
}

/** 查事件对应的音效文件标识;null = 未配音效,播放器对 null 空操作 */
export function sfxForEvent(event: SfxEvent): SfxId | null {
  return SFX_TABLE[event] ?? null
}
