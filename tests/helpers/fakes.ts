import { JobQueue } from '../../src/queues/analysisQueue';
import {
  AnalysisResult,
  CallUsage,
  ExperimentLLM,
  GenerationResult,
  JudgeInput,
  Judgment,
  PromptAnalyzer,
} from '../../src/services/claudeService';

/** Records enqueued job ids instead of talking to Redis. */
export class InMemoryJobQueue implements JobQueue {
  enqueued: string[] = [];
  failNext = false;

  async enqueue(jobId: string): Promise<void> {
    if (this.failNext) throw new Error('Redis is down');
    this.enqueued.push(jobId);
  }

  healthy = true;
  async ping(): Promise<void> {
    if (!this.healthy) throw new Error('Redis is down');
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

const fakeUsage: CallUsage = { model: 'claude-opus-5-5', inputTokens: 100, outputTokens: 50, costUsd: 0.0014, latencyMs: 200 };

/**
 * Deterministic stand-in for Claude in experiments:
 *  - generate() echoes the prompt it was given
 *  - judge() prefers whichever side was produced by a prompt containing `preferMarker`
 */
export class FakeLLM implements ExperimentLLM {
  generateCalls: string[] = [];
  judgeCalls: JudgeInput[] = [];
  failGenerateOnCall?: number; // 1-based; throws a transient error once

  constructor(private readonly preferMarker = 'CONCISE') {}

  async generate(renderedPrompt: string): Promise<GenerationResult> {
    this.generateCalls.push(renderedPrompt);
    if (this.failGenerateOnCall === this.generateCalls.length) {
      this.failGenerateOnCall = undefined;
      throw new Error('529 overloaded');
    }
    return { output: `answer to: ${renderedPrompt}`, ...fakeUsage };
  }

  async judge(input: JudgeInput): Promise<Judgment & CallUsage> {
    this.judgeCalls.push(input);
    const firstPreferred = input.first.prompt.includes(this.preferMarker);
    const secondPreferred = input.second.prompt.includes(this.preferMarker);
    const winner = firstPreferred === secondPreferred ? 'tie' : firstPreferred ? 'first' : 'second';
    return { winner, reasoning: 'fake verdict', ...fakeUsage };
  }
}
