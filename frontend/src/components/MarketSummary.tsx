interface Props {
  date: string;
  totalScreened: number;
  counts: { cond_1_2: number; cond_1_2_3: number; cond_1_2_4: number; cond_1_2_3_4: number };
  isLoading: boolean;
}

export default function MarketSummary({ date, totalScreened, counts, isLoading }: Props) {
  const cards = [
    { label: '스크리닝 대상', value: totalScreened, sub: '시총 상위', color: 'text-blue-600' },
    { label: '조건 1&2', value: counts.cond_1_2, sub: '정배열 전환', color: 'text-emerald-600' },
    { label: '조건 1&2&4', value: counts.cond_1_2_4, sub: 'CCI 전환', color: 'text-violet-600' },
    { label: '전체 충족', value: counts.cond_1_2_3_4, sub: '1&2&3&4', color: 'text-rose-600' },
  ];

  return (
    <div className="w-full space-y-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-gray-900">K-Stock Screener</h1>
        <span className="text-base text-gray-400">{date || '-'} 기준</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-sm text-gray-500 mt-1">{c.label}</div>
            <div className="text-xs text-gray-400">{c.sub}</div>
          </div>
        ))}
      </div>
      {isLoading && (
        <div className="text-base text-amber-600 animate-pulse">
          스크리닝 실행 중... (약 2~3분 소요)
        </div>
      )}
    </div>
  );
}
