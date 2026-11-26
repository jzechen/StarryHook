import type { Rng } from './rng'
import type { FishDef, MinigameState } from './types'

/**
 * 鱼类行为:鱼图标按其种类行为在轨道上移动。
 * 五种规范行为见 GLOSSARY「鱼类行为」;数学与原型一致。
 */
export function stepFish(mg: MinigameState, dt: number, fish: FishDef, rng: Rng): void {
  mg.timer -= dt
  const diff = fish.difficulty
  switch (fish.behavior) {
    case 'mixed': // 混合:全轨道随机游走
      if (mg.timer <= 0) {
        mg.fishTarget = rng.range(0.05, 0.95)
        mg.timer = rng.range(0.5, 1.4)
      }
      seek(mg, dt, 0.45 + diff * 0.05)
      break
    case 'smooth': // 平滑:缓慢双正弦漂移
      mg.fishY = 0.5 + 0.24 * Math.sin(mg.t * 2.0) + 0.1 * Math.sin(mg.t * 4.7 + 1.3)
      break
    case 'sinker': // 沉底:贴底移动
      if (mg.timer <= 0) {
        mg.fishTarget = rng.range(0.04, 0.2)
        mg.timer = rng.range(2.0, 3.5)
      }
      seek(mg, dt, 0.5 + diff * 0.04)
      break
    case 'floater': // 漂浮:贴顶移动
      if (mg.timer <= 0) {
        mg.fishTarget = rng.range(0.78, 0.95)
        mg.timer = rng.range(2.0, 3.5)
      }
      seek(mg, dt, 0.5 + diff * 0.04)
      break
    case 'dart': // 急冲:驻留后猛冲一大段
      if (mg.timer <= 0) {
        const far = rng.range(0.3, 0.45) * (rng.float() < 0.5 ? -1 : 1)
        mg.fishTarget = Math.max(0.03, Math.min(0.97, mg.fishY + far))
        mg.timer = rng.range(1.6, 3.0)
      }
      seek(mg, dt, 1.8 + diff * 0.15)
      break
  }
}

function seek(mg: MinigameState, dt: number, speed: number): void {
  const d = mg.fishTarget - mg.fishY
  mg.fishY += Math.max(-speed * dt, Math.min(speed * dt, d))
  mg.fishY = Math.max(0.02, Math.min(0.98, mg.fishY))
}
