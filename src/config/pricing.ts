/**
 * Claude API prices in USD per million tokens (first-party API rates).
 * Prices change: check https://platform.claude.com/docs/en/about-claude/pricing
 * and update this table rather than hard-coding numbers elsewhere.
 */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const PRICING: Record<string, ModelPricing> = {
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-8': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
};

// Prompt caching multipliers on the input price.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Cost of one API call in USD. Unknown models throw: silently pricing them at
 * $0 would make cost tracking (Stage 10) quietly wrong.
 */
export function calculateCostUsd(model: string, usage: TokenUsage): number {
  const price = PRICING[model];
  if (!price) throw new Error(`No pricing configured for model "${model}" (add it to src/config/pricing.ts)`);

  const perToken = (perMTok: number) => perMTok / 1_000_000;
  const cost =
    usage.inputTokens * perToken(price.inputPerMTok) +
    (usage.cacheCreationInputTokens ?? 0) * perToken(price.inputPerMTok) * CACHE_WRITE_MULTIPLIER +
    (usage.cacheReadInputTokens ?? 0) * perToken(price.inputPerMTok) * CACHE_READ_MULTIPLIER +
    usage.outputTokens * perToken(price.outputPerMTok);

  // The DB column is DECIMAL(10, 6): round to 6 decimal places.
  return Math.round(cost * 1e6) / 1e6;
}
