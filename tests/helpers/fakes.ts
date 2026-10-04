import { JobQueue } from '../../src/queues/analysisQueue';
import { AnalysisResult, PromptAnalyzer } from '../../src/services/claudeService';

/** Records enqueued job ids instead of talking to Redis. */
export class InMemoryJobQueue implements JobQueue {
  enqueued: string[] = [];
  failNext = false;

  async enqueue(jobId: string): Promise<void> {
    if (this.failNext) throw new Error('Redis is down');
    this.enqueued.push(jobId);
  }

  async close(): Promise<void> {}
}

export const fakeResult: AnalysisResult = {
  analysis: {
    clarity: 7,
    specificity: 5,
    summary: 'Clear goal, but the output format is unspecified.',
    suggestions: ['Specify the output format', 'Give one example'],
  },
  model: 'claude-opus-5-5',
  inputTokens: 1200,
  outputTokens: 300,
  costUsd: 0.0108,
  latencyMs: 1234,
};

/** A PromptAnalyzer that never calls the real API (no network, no cost). */
export class FakeAnalyzer implements PromptAnalyzer {
  calls: string[] = [];
  constructor(private readonly behaviour: () => Promise<AnalysisResult> = async () => fakeResult) {}

  async analyze(promptContent: string): Promise<AnalysisResult> {
    this.calls.push(promptContent);
    return this.behaviour();
  }
}
