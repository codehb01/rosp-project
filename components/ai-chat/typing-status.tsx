"use client";

import { useEffect, useState } from "react";
import { getSlowHint } from "@/components/ai-chat/activity";

/** Animated "assistant is working" row: pulsing dots, the current step, and a hint when slow. */
export function TypingStatus({ label }: { label: string }) {
  const [elapsed, setElapsed] = useState(0);

  // Restart the timer whenever the step changes, so the slow hint is per step.
  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [label]);

  const hint = getSlowHint(elapsed);

  return (
    <div role="status" aria-live="polite" className="flex items-start gap-2">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
      <div className="pt-1 text-xs text-muted-foreground">
        <span className="animate-pulse font-medium">{label}…</span>
        {hint && <span className="ml-1.5 opacity-80">· {hint}</span>}
      </div>
    </div>
  );
}
