/**
 * [PROTOTYPE · 抛弃式] 联机手感冒烟(#66)——stub 传输与快照插值。永不并 main。
 *
 * BroadcastChannel 即「本地回路/stub 信令」(票面口径):同源双标签页/双窗口
 * 直连,出方向按可调人为延迟排队发送,模拟局域网 WebRTC 单向延迟。
 * 消息封套 = #64 钉定的 {v, type, seq, payload} JSON 判别联合,外加 ts
 * (发送端 Date.now())供跨标签页延迟计量——同机双窗墙钟可比。
 */

export interface WireEnvelope<T = unknown> {
  v: 1
  type: string
  seq: number
  ts: number
  payload: T
}

/** 下行 frame 快照(票 #64 目录:房主位姿/竿相 + 客人竿相 + 客人会话得分;客人自己的位置不下行) */
export interface FrameState {
  /** 发送端 Date.now()(跨窗墙钟可比,供帧龄计量) */
  ts: number
  hostX: number
  hostY: number
  hostFacing: string
  /** 房主浮标(waiting/bite/结算停留可见,小游戏收进面板) */
  hostBobber: { x: number; y: number } | null
  guestRod: {
    phase: string
    /** charging 蓄力 0..1(客人蓄力条是网络镜像,天然带延迟) */
    power: number
    bobber: { x: number; y: number } | null
    /** 咬钩 "!" */
    bang: boolean
    /** 咬钩窗口剩余秒 */
    biteLeft: number
    /** 小游戏镜像态(20Hz 直接消费,不插值——插值观感只裁角色,这本身是待裁决点) */
    mg: { barY: number; fishY: number; progress: number; fishId: string } | null
  }
  guestScore: number
}

/** 下行 world 快照(原型只留最小经济计数器,经济正确性归 #62 已决,不在本原型) */
export interface WorldState {
  coins: number
  guestFish: number
}

/**
 * stub 传输:单「可靠有序」通道(BroadcastChannel 天然可靠有序,对齐
 * #64「单条 reliable+ordered DataChannel」),出方向 4ms 泵按到期时间
 * 出队,保持同延迟下 FIFO。
 */
export class StubTransport {
  private ch: BroadcastChannel
  private outSeq = 0
  private queue: { at: number; msg: WireEnvelope }[] = []
  private timer: number
  /** 本方向(出站)人为单向延迟 ms;运行时可调 */
  outboundDelayMs = 30
  onMessage: ((m: WireEnvelope) => void) | null = null

  constructor(channelName: string) {
    this.ch = new BroadcastChannel(channelName)
    this.ch.onmessage = ev => this.onMessage?.(ev.data as WireEnvelope)
    this.timer = window.setInterval(() => this.flush(), 4)
  }

  send(type: string, payload: unknown): void {
    const msg: WireEnvelope = { v: 1, type, seq: ++this.outSeq, ts: Date.now(), payload }
    this.queue.push({ at: msg.ts + this.outboundDelayMs, msg })
  }

  private flush(): void {
    if (this.queue.length === 0) return
    const now = Date.now()
    const rest: { at: number; msg: WireEnvelope }[] = []
    for (const item of this.queue) {
      if (item.at <= now) this.ch.postMessage(item.msg)
      else rest.push(item)
    }
    this.queue = rest
  }

  close(): void {
    window.clearInterval(this.timer)
    this.ch.close()
  }
}

export interface AvatarSnap {
  t: number
  x: number
  y: number
  facing: string
}

/**
 * 远端角色双快照线性插值(#64:缓冲 ~100ms = 两帧 @20Hz)。
 * renderT = now − buffer;夹在相邻双快照间 lerp;越界端点保持并计饥饿;
 * 快照间隔突增(>250ms,补帧断流)直接吸附并计 snap。速度由夹持对推算,
 * 供行走相位与「在移动」判定(与本地 MOVE_EPS 语义同源,阈值放宽到 5px/s)。
 */
export class RemoteAvatar {
  bufferMs = 100
  private snaps: AvatarSnap[] = []
  /** 渲染时钟越出快照覆盖的帧数(每 250ms 归零,读作饥饿强度) */
  starved = 0
  /** 吸附次数(断流恢复) */
  snapped = 0

  push(s: AvatarSnap): void {
    this.snaps.push(s)
    if (this.snaps.length > 4) this.snaps.shift()
  }

  get depth(): number {
    return this.snaps.length
  }

  /** 最新快照距今 ms(无快照 = Infinity)——停滞检测用 */
  lastAge(now: number): number {
    return this.snaps.length ? now - this.snaps[this.snaps.length - 1]!.t : Infinity
  }

  sample(now: number): { x: number; y: number; facing: string; moving: boolean; ok: boolean } {
    if (this.snaps.length === 0) return { x: 0, y: 0, facing: 'down', moving: false, ok: false }
    const renderT = now - this.bufferMs
    let a = this.snaps[0]!
    let b = this.snaps[this.snaps.length - 1]!
    for (let i = 0; i < this.snaps.length - 1; i++) {
      const s = this.snaps[i]!
      const n = this.snaps[i + 1]!
      if (s.t <= renderT && n.t >= renderT) {
        a = s
        b = n
        break
      }
    }
    let x: number
    let y: number
    const span = b.t - a.t
    if (renderT <= a.t || renderT >= b.t) {
      this.starved++
      const end = renderT <= a.t ? a : b
      x = end.x
      y = end.y
    } else if (span > 250) {
      this.snapped++
      x = b.x
      y = b.y
    } else {
      const k = (renderT - a.t) / span
      x = a.x + (b.x - a.x) * k
      y = a.y + (b.y - a.y) * k
    }
    const speed = span > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / (span / 1000) : 0
    return { x, y, facing: b.facing, moving: speed > 5, ok: true }
  }

  resetCounters(): void {
    this.starved = 0
    this.snapped = 0
  }
}
