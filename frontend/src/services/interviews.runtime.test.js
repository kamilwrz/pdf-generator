import { beforeEach, expect, it, vi } from 'vitest';
import { interviewRequest } from './interviews';

const httpRequest = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ ApiClient: class { httpRequest = httpRequest; } }));
vi.mock('../utils/authSession', () => ({ getAccessToken: () => 'synthetic-test-token' }));
beforeEach(() => httpRequest.mockClear());

it.each([
  ['/ai/interviews/session/preview', 'POST', 1_680_000],
  ['/ai/interviews/session/answers', 'POST', 180_000],
  ['/ai/interviews/session', 'GET', 180_000],
])('bounds %s %s without automatic paid retries', (path, method, timeoutMs) => {
  interviewRequest(path, method, { revision: 3 }, 'attempt');
  expect(httpRequest).toHaveBeenCalledWith(path, method, JSON.stringify({ revision: 3 }), expect.any(String), {
    timeoutMs, retries: 0, retryOnTimeout: false, headers: { 'Idempotency-Key': 'attempt' },
  });
});
