import type { ScreeningHistoryItem } from '../types/stock';

interface Props {
  history: ScreeningHistoryItem[];
  onSelectDate: (date: string) => void;
}

export default function SearchHistory({ history, onSelectDate }: Props) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-3">검색 이력</h3>
      {history.length === 0 ? (
        <p className="text-sm text-gray-400">이력이 없습니다.</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {history.map(h => (
            <button
              key={h.date}
              onClick={() => onSelectDate(h.date)}
              className="w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors border border-gray-100"
            >
              <div className="text-sm font-medium text-gray-800">{h.date}</div>
              <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-3">
                <span>1&2: <span className="text-emerald-600">{h.cond_1_2}</span></span>
                <span>1&2&3: <span className="text-amber-600">{h.cond_1_2_3}</span></span>
                <span>1&2&4: <span className="text-violet-600">{h.cond_1_2_4}</span></span>
                <span>ALL: <span className="text-rose-600">{h.cond_1_2_3_4}</span></span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
