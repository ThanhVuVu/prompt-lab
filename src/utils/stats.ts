/**
 * Is "A won 7, B won 3" a real difference or luck?
 *
 * The SIGN TEST answers that for paired comparisons: if A and B were equally
 * good, each non-tied comparison would be a coin flip. The p-value is the
 * probability of a split at least this lopsided from fair coins. Small p
 * (conventionally < 0.05) means "unlikely to be luck". Ties are dropped.
 */
export function signTestPValue(winsA: number, winsB: number): number {
  const n = winsA + winsB;
  if (n === 0) return 1;
  const k = Math.min(winsA, winsB);

  // Two-sided: P(X <= k) + P(X >= n - k) for X ~ Binomial(n, 0.5)
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += binomial(n, i);
  return Math.min(1, (2 * tail) / 2 ** n);
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Median (50th percentile). Less sensitive to one slow outlier than the mean. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
