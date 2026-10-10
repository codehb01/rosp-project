import "server-only";
import { after } from "next/server";

/**
 * Runs best-effort work after the response is sent (on Vercel the function
 * stays alive for it). Errors are logged, never thrown, so AI side effects
 * can never break the request that triggered them.
 */
export function runInBackground(label: string, work: () => Promise<void>): void {
  const task = async () => {
    try {
      await work();
    } catch (error) {
      console.error(`[ai] ${label} failed`, error);
    }
  };

  try {
    after(task);
  } catch {
    // Outside a request scope (scripts, tests): run it directly.
    void task();
  }
}
