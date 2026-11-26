import type { GameMode } from '../core/coreLoop'

/**
 * 顶栏倒计时文案(纯函数,票 #24):限时模式给「1:23」,无限模式给 null。
 * null = 顶栏完全不显示(Hud 徽章同款契约,见 setBaitBadge)——切回无限
 * 计时状态被核心完全清除(timeRemaining 恒 0),顶栏随之无残留。
 * 逐秒口径:剩余秒数向上取整(未走满一秒仍显示整秒,开局整 2:00,
 * 归零定格 0:00),秒数两位补零;文案每秒才变一次,重写守卫在 Hud 侧。
 */
export function countdownBadgeText(mode: GameMode, remainingSeconds: number): string | null {
  if (mode !== 'timed') return null
  const total = Math.max(0, Math.ceil(remainingSeconds))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
