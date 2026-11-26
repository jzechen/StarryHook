/**
 * 装备中鱼饵的顶栏徽章文案(纯函数,review 修复:垂钓进行中商店不可开,
 * 装备饵的余量须常驻可见——环境徽章旁小字,「香饵 ×9」)。
 * 装备且有余量 → 「饵名 ×剩余数」;未装备(null)或已耗尽(count ≤ 0)→ null,
 * 徽章隐藏——「耗尽自动消失」由此派生:余量归零的同一帧文案即变 null。
 */
export function baitBadgeText(bait: { name: string; count: number } | null): string | null {
  if (!bait || bait.count <= 0) return null
  return `${bait.name} ×${bait.count}`
}
