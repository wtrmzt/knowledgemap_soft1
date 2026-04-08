/**
 * 実験同意ページ
 * 研究参加への同意書表示・取得
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { updateConsent, getMe, isAuthenticated } from '@/services/authService';

const ConsentPage: React.FC = () => {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alreadyConsented, setAlreadyConsented] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    getMe().then((user) => {
      if (user.consented) {
        setAlreadyConsented(true);
      }
    }).catch(() => {});
  }, [navigate]);

  const handleProceed = async () => {
    if (alreadyConsented) {
      navigate('/dashboard');
      return;
    }
    setLoading(true);
    try {
      await updateConsent(true);
      navigate('/dashboard');
    } catch {
      // エラー時もダッシュボードへ（同意はベストエフォート）
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-400/10 p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        <div className="bg-white rounded-2xl shadow-md border border-surface-200 overflow-hidden">
          {/* Header */}
          <div className="bg-primary-700 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <ShieldCheck size={24} />
              <div>
                <h1 className="text-lg font-bold font-display">研究参加への同意</h1>
                <p className="text-primary-200 text-sm mt-0.5">
                  本システムのご利用にあたり、以下の説明をお読みください
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <section>
              <h2 className="text-sm font-semibold text-surface-700 mb-2">1. 研究の目的</h2>
              <p className="text-xs leading-relaxed text-surface-600">
                本研究は、知識マップを用いた振り返り支援システムの有効性を検証することを目的としています。
                学習者がどのように振り返りを行い、知識を構造化していくかを分析し、より効果的な学習支援手法の開発に役立てます。
              </p>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-surface-700 mb-2">2. 収集するデータ</h2>
              <p className="text-xs leading-relaxed text-surface-600">
                本システムでは以下のデータを収集します：
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-surface-600">
                <li className="flex items-start gap-2">
                  <span className="text-primary-500 mt-0.5">•</span>
                  入力された振り返りメモの内容
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-500 mt-0.5">•</span>
                  生成・編集された知識マップの全履歴
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-500 mt-0.5">•</span>
                  システム上の操作ログ（ノード追加、接続操作等）
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-surface-700 mb-2">3. データの取り扱い</h2>
              <p className="text-xs leading-relaxed text-surface-600">
                収集したデータは研究目的のみに使用し、個人を特定できる形での公開は行いません。
                データは研究終了後、適切に管理・保管されます。
              </p>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-surface-700 mb-2">4. 参加の任意性</h2>
              <p className="text-xs leading-relaxed text-surface-600">
                研究への参加は任意であり、いつでも参加を中止することができます。
                参加を中止しても不利益を被ることはありません。
              </p>
            </section>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-surface-200 space-y-3">
            {!alreadyConsented && (
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-xs text-surface-700">
                  上記の説明を読み、研究への参加に同意します
                </span>
              </label>
            )}

            <Button
              onClick={handleProceed}
              disabled={!alreadyConsented && !agreed || loading}
              className="w-full"
            >
              {alreadyConsented ? '同意済み — ダッシュボードへ' : 'システムを利用開始する'}
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsentPage;
