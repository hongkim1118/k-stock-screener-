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

export interface ScreeningStatus {
  running: boolean;
  progress: string;
  has_result: boolean;
  error: string | null;
}

export const getScreeningStatus = (): Promise<ScreeningStatus> =>
  api.get('/screening/status').then(r => r.data);

// 스크리닝 실행 (서버 깨우기 → 백그라운드 시작 → 폴링)
export async function runScreening(onProgress?: (msg: string) => void): Promise<ScreeningResult> {
  // 1. 서버 깨우기 (콜드스타트 대응)
  onProgress?.('서버 연결 중... (콜드스타트 최대 60초)');
  try { await api.get('/screening/status'); } catch { /* noop */ }

  // 2. 스크리닝 시작 요청
  onProgress?.('스크리닝 시작 요청 중...');
  await api.post('/screening/run');

  // 3. 완료까지 폴링 (3초 간격, 최대 12분)
  let lastStatus: ScreeningStatus | null = null;
  for (let i = 0; i < 240; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const { data } = await api.get<ScreeningStatus>('/screening/status');
      lastStatus = data;
      if (data.progress) onProgress?.(data.progress);
      if (!data.running) break;
    } catch {
      onProgress?.('네트워크 재시도 중...');
    }
  }

  // 4. 에러 상태면 throw
  if (lastStatus?.error) {
    throw new Error(lastStatus.error);
  }

  // 5. 완료된 결과 가져오기 (백엔드 저장 지연 대응: 최대 3회 재시도)
  for (let i = 0; i < 3; i++) {
    try {
      return await getLatestScreening();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return getLatestScreening();
}
