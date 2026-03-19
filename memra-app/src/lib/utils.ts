import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 500, label = "op" }: { attempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        console.warn(`[retry] ${label} failed (${i + 1}/${attempts}), retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}
