/**
 * Test-data factories: build valid objects with sensible defaults, and let
 * each test override only what it cares about. Tests then read as
 * "a prompt with an empty title" instead of a wall of JSON.
 */
import { Express } from 'express';
import request from 'supertest';
import { TestUser } from './auth';

let counter = 0;

export function buildPrompt(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    title: `Test prompt ${counter}`,
    content: `Summarise the following text in ${counter} bullet points: {{text}}`,
    tags: ['test'],
    isPublic: false,
    ...overrides,
  };
}

/** Creates a prompt through the API (so it goes through every layer) and returns it. */
export async function createPromptAs(app: Express, user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/prompts').set(user.auth).send(buildPrompt(overrides));
  if (res.status !== 201) throw new Error(`createPromptAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
