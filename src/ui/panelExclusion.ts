/**
 * 面板互斥协调器(轻量,票 #d-world-review-fixes):任一面板打开即收起其余,
 * 避免右侧同位面板重叠遮挡。注册制——面板构造时自注册并持有协调器引用,
 * 组合根只建一个协调器逐面板注入,不再串「A 开 → 关 B」双闭包;
 * 下一个消费方是商店面板,多面板注册即插即用,不为此扩展接口。
 *
 * 契约与现行为逐项一致:
 * - 只认「打开通知」:面板自行打开后调 notifyOpened,收起动作不回调协调器;
 * - 不查打开状态:每次通知都收其余(对已收起面板 close 无害,面板侧幂等);
 * - 面板内语义(离开待机/禁用阶段自动收起、入口开合)留在各面板,协调器不管。
 */

/** 互斥面板的最小接口:协调器只需要「能收起」 */
export interface ExcludablePanel {
  close(): void
}

export class PanelExclusion {
  /** 注册序即收起序;每面板注册一次(面板构造时自注册) */
  private panels: ExcludablePanel[] = []

  /** 面板注册(由面板构造函数调用,组合根无需感知各面板) */
  register(panel: ExcludablePanel): void {
    this.panels.push(panel)
  }

  /** 某面板已打开(由面板自行通知):收起其余已注册面板,自身不动 */
  notifyOpened(self: ExcludablePanel): void {
    for (const panel of this.panels) {
      if (panel !== self) panel.close()
    }
  }
}
