export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '-';
  return n.toLocaleString('ko-KR');
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null) return '-';
  return n.toLocaleString('ko-KR') + '원';
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function formatMarketCap(n: number | null | undefined): string {
  if (n == null) return '-';
  const trillion = n / 1_000_000_000_000;
  if (trillion >= 1) return `${trillion.toFixed(1)}조`;
  const billion = n / 100_000_000;
  return `${formatNumber(Math.round(billion))}억`;
}

export function formatVolume(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
