import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getLatestScreening, runScreening, getScreeningByDate,
  getScreeningHistory, getWatchlist, addWatchlist, removeWatchlist,
} from '../services/api';
import MarketSummary from './MarketSummary';
import ScreeningTabs from './ScreeningTabs';
import ResultTable from './ResultTable';
import SearchHistory from './SearchHistory';
import Watchlist from './Watchlist';
import type { ScreeningResult, TabKey } from '../types/stock';

export default function Dashboard() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('cond_1_2');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: report, isLoading, error } = useQuery<ScreeningResult>({
    queryKey: ['screening', selectedDate],
    queryFn: () => selectedDate ? getScreeningByDate(selectedDate) : getLatestScreening(),
    retry: false,
  });

  const { data: history = [] } = useQuery({ queryKey: ['history'], queryFn: getScreeningHistory, retry: false });
  const { data: watchlist = [] } = useQuery({ queryKey: ['watchlist'], queryFn: getWatchlist });

  const runMut = useMutation({
    mutationFn: runScreening,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['screening'] }); qc.invalidateQueries({ queryKey: ['history'] }); setSelectedDate(null); },
  });

  const watchlistTickers = new Set(watchlist.map(w => w.ticker));

  const toggleWatch = useCallback(async (ticker: string, name: string) => {
    if (watchlistTickers.has(ticker)) await removeWatchlist(ticker);
    else await addWatchlist(ticker, name);
    qc.invalidateQueries({ queryKey: ['watchlist'] });
  }, [watchlistTickers, qc]);

  const removeWatch = useCallback(async (ticker: string) => {
    await removeWatchlist(ticker);
    qc.invalidateQueries({ queryKey: ['watchlist'] });
  }, [qc]);

  const counts = {
    cond_1_2: report?.counts?.cond_1_2 || 0,
    cond_1_2_3: report?.counts?.cond_1_2_3 || 0,
    cond_1_2_4: report?.counts?.cond_1_2_4 || 0,
    cond_1_2_3_4: report?.counts?.cond_1_2_3_4 || 0,
  };

  const stocks = report?.results?.[activeTab] || [];
  const noData = !report && !isLoading;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <MarketSummary date={report?.date || ''} totalScreened={report?.total_screened || 0} counts={counts} isLoading={runMut.isPending} />

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium text-base shadow-sm transition-colors"
          >
            {runMut.isPending ? '스크리닝 실행 중... (3~5분 소요)' : '스크리닝 실행'}
          </button>
          {runMut.isPending && (
            <span className="text-amber-600 text-sm animate-pulse">서버에서 200종목 데이터를 수집 중입니다. 잠시 기다려주세요.</span>
          )}
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="px-5 py-2.5 bg-white hover:bg-gray-100 text-gray-600 rounded-lg text-base border border-gray-300">
              최신 결과로
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 space-y-0">
            {noData || error ? (
              <div className="bg-white rounded-xl p-12 border border-gray-200 text-center shadow-sm">
                <div className="text-5xl mb-4">&#128200;</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  {error ? '스크리닝 결과가 없습니다' : '아직 스크리닝 결과가 없습니다'}
                </h3>
                <p className="text-gray-500 text-base">"스크리닝 실행" 버튼을 눌러 시작하세요.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <ScreeningTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
                {isLoading ? (
                  <div className="p-12 text-center text-gray-400 animate-pulse text-base">로딩 중...</div>
                ) : (
                  <ResultTable stocks={stocks} onToggleWatchlist={toggleWatch} watchlistTickers={watchlistTickers} />
                )}
              </div>
            )}
          </div>

          <div className="w-full lg:w-72 space-y-4">
            <Watchlist items={watchlist} onRemove={removeWatch} />
            <SearchHistory history={history} onSelectDate={setSelectedDate} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <h4 className="text-sm font-semibold text-gray-500 mb-2">조건 설명</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-gray-500">
            <div><span className="text-blue-600 font-medium">조건 1:</span> KOSPI 시총 상위 200종목</div>
            <div><span className="text-emerald-600 font-medium">조건 2:</span> 이동평균선 역배열→정배열 전환</div>
            <div><span className="text-amber-600 font-medium">조건 3:</span> 볼린저밴드 하단 (BB%B &le; 0.10)</div>
            <div><span className="text-violet-600 font-medium">조건 4:</span> CCI -100 상향 돌파 (매수 전환)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
