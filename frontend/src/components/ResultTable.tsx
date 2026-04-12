import type { StockItem } from '../types/stock';
import { formatNumber, formatPercent } from '../utils/formatters';

interface Props {
  stocks: StockItem[];
  onToggleWatchlist: (ticker: string, name: string) => void;
  watchlistTickers: Set<string>;
}

const SIGNAL_STYLE: Record<string, string> = {
  '매수': 'bg-green-100 text-green-800',
  '관망': 'bg-yellow-100 text-yellow-800',
  '주의': 'bg-blue-100 text-blue-800',
};

export default function ResultTable({ stocks, onToggleWatchlist, watchlistTickers }: Props) {
  if (stocks.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-lg">해당 조건을 충족하는 종목이 없습니다.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-base">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200 bg-gray-50 text-sm">
            <th className="text-left py-3 px-4 font-medium">종목</th>
            <th className="text-right py-3 px-4 font-medium">종가</th>
            <th className="text-right py-3 px-4 font-medium">등락률</th>
            <th className="text-right py-3 px-4 font-medium">MA5</th>
            <th className="text-right py-3 px-4 font-medium">MA20</th>
            <th className="text-right py-3 px-4 font-medium">BB%B</th>
            <th className="text-right py-3 px-4 font-medium">CCI</th>
            <th className="text-center py-3 px-4 font-medium">신호</th>
            <th className="text-center py-3 px-4 font-medium">관심</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map(s => {
            const isUp = s.change_pct > 0;
            const isDown = s.change_pct < 0;
            const isWatched = watchlistTickers.has(s.ticker);
            return (
              <tr key={s.ticker} className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors">
                <td className="py-3 px-4">
                  <div className="font-semibold text-gray-900">{s.name}</div>
                  <div className="text-sm text-gray-400">{s.ticker}</div>
                </td>
                <td className="text-right py-3 px-4 font-mono text-gray-900">{formatNumber(s.close)}</td>
                <td className={`text-right py-3 px-4 font-mono font-medium ${isUp ? 'text-red-500' : isDown ? 'text-blue-500' : 'text-gray-500'}`}>
                  {formatPercent(s.change_pct)}
                </td>
                <td className="text-right py-3 px-4 font-mono text-gray-600 text-sm">{s.ma5 != null ? formatNumber(s.ma5) : '-'}</td>
                <td className="text-right py-3 px-4 font-mono text-gray-600 text-sm">{s.ma20 != null ? formatNumber(s.ma20) : '-'}</td>
                <td className={`text-right py-3 px-4 font-mono text-sm ${s.bb_pctb != null && s.bb_pctb <= 0.10 ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
                  {s.bb_pctb != null ? s.bb_pctb.toFixed(2) : '-'}
                </td>
                <td className={`text-right py-3 px-4 font-mono text-sm ${s.cci != null && s.cci < -100 ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
                  {s.cci != null ? s.cci.toFixed(1) : '-'}
                </td>
                <td className="text-center py-3 px-4">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-sm font-medium ${SIGNAL_STYLE[s.signal] || ''}`}>
                    {s.signal}
                  </span>
                </td>
                <td className="text-center py-3 px-4">
                  <button
                    onClick={() => onToggleWatchlist(s.ticker, s.name)}
                    className={`text-xl hover:scale-125 transition-transform ${isWatched ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}
                  >
                    {isWatched ? '\u2605' : '\u2606'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
