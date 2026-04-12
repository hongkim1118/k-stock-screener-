import axios from 'axios';
import type { ScreeningResult, WatchlistItem, ScreeningHistoryItem } from '../types/stock';

// 개발: /api (vite proxy) → 배포: Render URL
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({ baseURL: API_BASE, timeout: 10000 });

export const getLatestScreening = (): Promise<ScreeningResult> =>
  api.get('/screening/latest').then(r => r.data);

export const getScreeningByDate = (date: string): Promise<ScreeningResult> =>
  api.get(`/screening/${date}`).then(r => r.data);

export const getScreeningHistory = (): Promise<ScreeningHistoryItem[]> =>
  api.get('/screening/history').then(r => r.data);

export const getWatchlist = (): Promise<WatchlistItem[]> =>
  api.get('/watchlist').then(r => r.data);

export const addWatchlist = (ticker: string, name?: string): Promise<void> =>
  api.post('/watchlist', { ticker, name }).then(() => {});

export const removeWatchlist = (ticker: string): Promise<void> =>
  api.delete(`/watchlist/${ticker}`).then(() => {});

// 스크리닝 실행 (백그라운드 시작 + 완료까지 폴링)
export async function runScreening(): Promise<ScreeningResult> {
  // 1. 스크리닝 시작 요청
  await api.post('/screening/run');

  // 2. 완료까지 폴링 (3초 간격)
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const { data } = await api.get('/screening/status');
    if (!data.running) {
      break;
    }
  }

  // 3. 완료된 결과 가져오기
  return getLatestScreening();
}
