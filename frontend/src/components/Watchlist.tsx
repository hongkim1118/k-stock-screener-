import type { WatchlistItem } from '../types/stock';

interface Props {
  items: WatchlistItem[];
  onRemove: (ticker: string) => void;
}

export default function Watchlist({ items, onRemove }: Props) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-3">
        관심종목 ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">
          스크리닝 결과에서 별 아이콘을 클릭하여 관심종목을 추가하세요.
        </p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.ticker}
              className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100"
            >
              <div>
                <div className="text-sm font-medium text-gray-800">{item.name}</div>
                <div className="text-sm text-gray-400">{item.ticker}</div>
              </div>
              <button
                onClick={() => onRemove(item.ticker)}
                className="text-gray-400 hover:text-red-500 text-sm transition-colors"
                title="관심종목 해제"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
