import { TUNE } from '../config'
import type { MinigameState } from './types'

/**
 * 绿条物理:按住上升 / 松开下沉,快速逼近目标速度(保留少量惯性);
 * 点按额外获得一次上冲脉冲;撞轨道上下边缘反弹。
 * 数学与原型一致,参数见 TUNE.bar。
 */
export function stepCatchBar(
  mg: MinigameState,
  dt: number,
  holding: boolean,
  pressed: boolean,
): void {
  const B = TUNE.bar
  if (pressed) mg.barV += B.tapBoost
  const targetV = holding ? B.vUp : -B.vDown
  mg.barV += (targetV - mg.barV) * Math.min(1, dt * B.response)
  mg.barY += mg.barV * dt
  const maxY = 1 - B.height
  if (mg.barY < 0) {
    mg.barY = 0
    mg.barV = -mg.barV * B.bounce
  } else if (mg.barY > maxY) {
    mg.barY = maxY
    mg.barV = -mg.barV * B.bounce
  }
}
