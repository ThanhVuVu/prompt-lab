/**
 * Prometheus metrics, exposed at GET /metrics.
 *
 * Logs answer "what happened to THIS request?"; metrics answer "how is the
 * system doing overall?": requests per second, error rate, latency percentiles.
 * A Prometheus server scrapes /metrics every few seconds; Grafana graphs it and
 * alerting fires on rules such as "5xx rate > 1% for 5 minutes".
 */
import client from 'prom-client';

export const registry = new client.Registry();

// Process metrics for free: CPU, memory, event-loop lag, GC…
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  // `route` is the PATTERN ("/api/prompts/:id"), never the raw path: one time
  // series per prompt id would explode memory (the "high cardinality" problem).
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const jobsProcessed = new client.Counter({
  name: 'jobs_processed_total',
  help: 'Background jobs processed, by type and outcome',
  labelNames: ['type', 'outcome'] as const,
  registers: [registry],
});

export const cacheRequests = new client.Counter({
  name: 'cache_requests_total',
  help: 'Cache lookups by result: the hit rate is hit / (hit + miss)',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const claudeCostUsd = new client.Counter({
  name: 'claude_cost_usd_total',
  help: 'Total Claude API spend in USD',
  labelNames: ['model'] as const,
  registers: [registry],
});
