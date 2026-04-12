import axios from 'axios';
import type { ScreeningResult, WatchlistItem, ScreeningHistoryItem } from '../types/stock';

// 개발: /api (vite proxy) → 배포: Render URL
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({ baseURL: API_BASE, timeout: 120000 }); // 2분 타임아웃 (Render 콜드스타트 대응)

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

// 스크리닝 실행 (서버 깨우기 → 백그라운드 시작 → 폴링)
export async function runScreening(): Promise<ScreeningResult> {
  // 1. 서버 깨우기 (콜드스타트 대응, 최대 90초)
  try {
    await api.get('/screening/status');
  } catch {
    // 첫 요청 실패해도 계속 진행
  }

  // 2. 스크리닝 시작 요청
  await api.post('/screening/run');

  // 3. 완료까지 폴링 (5초 간격, 최대 10분)
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      const { data } = await api.get('/screening/status');
      if (!data.running) break;
    } catch {
      // 네트워크 에러 시 재시도
    }
  }

  // 4. 완료된 결과 가져오기
  return getLatestScreening();
}
