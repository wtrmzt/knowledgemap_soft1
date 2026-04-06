/**
 * 一意ID生成
 */
export function generateId(prefix = 'n'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
