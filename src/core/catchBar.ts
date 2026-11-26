import { TUNE } from '../config'
import type { BarParams } from '../config'
import type { MinigameState } from './types'

/**
 * 绿条物理:按住上升 / 松开下沉,快速逼近目标速度(保留少量惯性);
 * 点按额外获得一次上冲脉冲;撞轨道上下边缘反弹。
 * 数学与原型一致;参数经形参注入,默认 = 现行 TUNE.bar(竿档由成长系统解锁后经核心循环注入)。
 */
export function stepCatchBar(
  mg: MinigameState,
  dt: number,
  holding: boolean,
  pressed: boolean,
  bar: BarParams = TUNE.bar,
): void {
  if (pressed) mg.barV += bar.tapBoost
  const targetV = holding ? bar.vUp : -bar.vDown
  mg.barV += (targetV - mg.barV) * Math.min(1, dt * bar.response)
  mg.barY += mg.barV * dt
  const maxY = 1 - bar.height
  if (mg.barY < 0) {
    mg.barY = 0
    mg.barV = -mg.barV * bar.bounce
  } else if (mg.barY > maxY) {
    mg.barY = maxY
    mg.barV = -mg.barV * bar.bounce
  }
}
