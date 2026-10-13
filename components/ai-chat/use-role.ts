"use client";

import { useEffect, useState } from "react";

export type AssistantRole = "CUSTOMER" | "WORKER";

/**
 * Reads the role from the /api/user/profile response, which wraps its payload as
 * `{ success, data: { role } }`. A bare `{ role }` is accepted too. Anything else
 * (no role yet, or an account that has not finished onboarding) gives null.
 */
export function parseRole(json: unknown): AssistantRole | null {
  const body = json as { data?: { role?: unknown }; role?: unknown } | null | undefined;
  const role = body?.data?.role ?? body?.role;
  return role === "CUSTOMER" || role === "WORKER" ? role : null;
}

/** The signed-in user's assistant role, or null while unknown, signed out, or not onboarded. */
export function useAssistantRole(userId: string | null | undefined): AssistantRole | null {
  const [state, setState] = useState<{ userId: string; role: AssistantRole | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    fetch("/api/user/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setState({ userId, role: parseRole(json) });
      })
      // The assistant is optional: if the role cannot be read, the widget just stays hidden.
      .catch(() => {
        if (!cancelled) setState({ userId, role: null });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Ignore a role that was loaded for a different (previous) user.
  return userId && state?.userId === userId ? state.role : null;
}
