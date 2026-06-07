/**
 * 公開設定サービス（管理者機能D）
 *
 * ログインユーザーなら誰でも取得できる「モードON/OFF」「介入度(Lv1-3)」を返す。
 * プロンプト等の管理者専用情報は含まれない。
 * 取得失敗時は安全側の既定値（すべて有効・Lv3）を返す。
 */
import { apiGet } from './apiClient';
import type { PublicSettings } from '@/types';

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  enabled_modes: { reflection: true, research: true, idea: true },
  intervention: { topic_detection: 3, satellite: 3, relation: 3 },
};

export async function getPublicSettings(): Promise<PublicSettings> {
  try {
    const data = await apiGet<PublicSettings>('/settings');
    return {
      enabled_modes: { ...DEFAULT_PUBLIC_SETTINGS.enabled_modes, ...(data.enabled_modes || {}) },
      intervention: { ...DEFAULT_PUBLIC_SETTINGS.intervention, ...(data.intervention || {}) },
    };
  } catch {
    return DEFAULT_PUBLIC_SETTINGS;
  }
}