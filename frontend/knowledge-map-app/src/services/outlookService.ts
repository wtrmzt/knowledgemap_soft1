/**
 * outlookService.ts — 関連性接続把握機能「見通す」API
 * 配置先: frontend/knowledge-map-app/src/services/outlookService.ts
 */
import { apiGet, apiPost, apiPut, apiGetBlob } from './apiClient';
import type {
  OutlookConfig,
  OutlookMemoSummary,
  OutlookSubject,
  OutlookConnectionsResult,
  OutlookAnswerRecord,
  OutlookAdminSettings,
  OutlookEngineStatus,
} from '@/types/outlook';

export async function getConfig(): Promise<OutlookConfig> {
  return apiGet<OutlookConfig>('/outlook/config');
}

export async function getMemos(): Promise<OutlookMemoSummary[]> {
  const data = await apiGet<{ memos: OutlookMemoSummary[] }>('/outlook/memos');
  return data.memos || [];
}

export async function getSubjects(
  memoId: number
): Promise<{ subjects: OutlookSubject[]; node_count: number }> {
  return apiPost<{ subjects: OutlookSubject[]; node_count: number; memo_id: number }>(
    '/outlook/subjects',
    { memo_id: memoId }
  );
}

export async function getConnections(
  memoId: number,
  subjectName: string
): Promise<OutlookConnectionsResult> {
  return apiPost<OutlookConnectionsResult>('/outlook/connections', {
    memo_id: memoId,
    subject_name: subjectName,
  });
}

export async function explainConcept(
  memoId: number,
  subjectName: string,
  sourceLabel: string,
  targetLabel: string
): Promise<string> {
  const data = await apiPost<{ detail: string }>('/outlook/explain_concept', {
    memo_id: memoId,
    subject_name: subjectName,
    source_label: sourceLabel,
    target_label: targetLabel,
  });
  return data.detail || '';
}

export async function saveAnswer(
  memoId: number,
  subjectName: string,
  answerText: string
): Promise<OutlookAnswerRecord> {
  const data = await apiPost<{ answer: OutlookAnswerRecord }>('/outlook/answers', {
    memo_id: memoId,
    subject_name: subjectName,
    answer_text: answerText,
  });
  return data.answer;
}

export async function getLatestAnswer(
  memoId: number,
  subjectName: string
): Promise<OutlookAnswerRecord | null> {
  const data = await apiGet<{ answer: OutlookAnswerRecord | null }>(
    `/outlook/answers?memo_id=${memoId}&subject_name=${encodeURIComponent(subjectName)}`
  );
  return data.answer;
}

// ---- 管理者 ----

export async function getAdminSettings(): Promise<{
  settings: OutlookAdminSettings;
  engine: OutlookEngineStatus;
}> {
  return apiGet('/admin/outlook/settings');
}

export async function updateAdminSettings(
  settings: OutlookAdminSettings
): Promise<OutlookAdminSettings> {
  const data = await apiPut<{ settings: OutlookAdminSettings }>(
    '/admin/outlook/settings',
    { settings }
  );
  return data.settings;
}

export async function exportOutlookCsv(): Promise<void> {
  const blob = await apiGetBlob('/admin/outlook/export_csv');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `outlook_export_${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
