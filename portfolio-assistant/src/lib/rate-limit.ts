const NUM_BUCKETS = 10;

interface WindowState {
  buckets: number[];   // ring buffer, length NUM_BUCKETS
  windowStart: number; // ms timestamp of oldest bucket's start
  total: number;       // sum of all buckets
}

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAfterMs: number;
}

const store = new Map<string, WindowState>();

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const { limit, windowMs } = config;
  const bucketDuration = windowMs / NUM_BUCKETS;
  const now = Date.now();

  let state = store.get(key);
  if (!state) {
    state = { buckets: new Array(NUM_BUCKETS).fill(0), windowStart: now, total: 0 };
    store.set(key, state);
  }

  const bucketsElapsed = Math.floor((now - state.windowStart) / bucketDuration);

  if (bucketsElapsed >= NUM_BUCKETS) {
    state.buckets.fill(0);
    state.windowStart = now;
    state.total = 0;
  } else if (bucketsElapsed > 0) {
    for (let i = 0; i < bucketsElapsed; i++) {
      const idx = Math.floor((state.windowStart / bucketDuration + i) % NUM_BUCKETS);
      state.total -= state.buckets[idx];
      state.buckets[idx] = 0;
    }
    state.windowStart += bucketsElapsed * bucketDuration;
  }

  const currentIdx = Math.floor(((now - state.windowStart) / bucketDuration) % NUM_BUCKETS);
  state.buckets[currentIdx]++;
  state.total++;

  return {
    allowed: state.total <= limit,
    limit,
    remaining: Math.max(0, limit - state.total),
    resetAfterMs: Math.max(0, windowMs - (now - state.windowStart)),
  };
}
