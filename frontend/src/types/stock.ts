export interface StockItem {
  ticker: string;
  name: string;
  close: number;
  change_pct: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma112: number | null;
  ma224: number | null;
  bb_pctb: number | null;
  cci: number | null;
  volume: number;
  market_cap: number;
  signal: "매수" | "관망" | "주의";
  cond2: boolean;
  cond3: boolean;
  cond4: boolean;
}

export interface ScreeningResult {
  date: string;
  total_screened: number;
  results: {
    cond_1_2: StockItem[];
    cond_1_2_3: StockItem[];
    cond_1_2_4: StockItem[];
    cond_1_2_3_4: StockItem[];
  };
  counts: {
    cond_1_2: number;
    cond_1_2_3: number;
    cond_1_2_4: number;
    cond_1_2_3_4: number;
  };
}

export interface ScreeningHistoryItem {
  date: string;
  total_screened: number;
  cond_1_2: number;
  cond_1_2_3: number;
  cond_1_2_4: number;
  cond_1_2_3_4: number;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  name: string;
  added_date: string;
  group_name: string;
  memo: string;
  sort_order: number;
}

export type TabKey = "cond_1_2" | "cond_1_2_3" | "cond_1_2_4" | "cond_1_2_3_4";

export const TABS: { key: TabKey; label: string; desc: string }[] = [
  { key: "cond_1_2", label: "조건 1&2", desc: "정배열 전환" },
  { key: "cond_1_2_3", label: "조건 1&2&3", desc: "정배열 + BB하단" },
  { key: "cond_1_2_4", label: "조건 1&2&4", desc: "정배열 + CCI (BB제외)" },
  { key: "cond_1_2_3_4", label: "조건 1&2&3&4", desc: "전체 조건 충족" },
];
