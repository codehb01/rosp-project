"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, MapPin, IndianRupee, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BADGE_LABEL, type PriceBadge, type PriceRange } from "@/lib/ai/pricing";

export type BookingDraft = {
  workerId: string;
  workerName: string;
  description: string;
  details: string | null;
  datetime: string;
  location: string;
  charge: number;
  priceCheck?: { badge: PriceBadge | null; range: PriceRange } | null;
};

type Props = {
  draft: BookingDraft;
  disabled?: boolean;
  onEdit: () => void;
};

type State = "idle" | "submitting" | "done";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ConfirmCard({ draft, disabled, onEdit }: Props) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  // Same endpoint and rules as the manual booking form.
  async function confirm() {
    setState("submitting");
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: draft.workerId,
          description: draft.description,
          details: draft.details,
          datetime: draft.datetime,
          location: draft.location,
          charge: draft.charge,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === "string" ? data.error : "Could not create the booking");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Network error. Please try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-4" /> Booking sent to {draft.workerName}
        </p>
        <p className="mt-1 text-xs">
          You will pay after the work is done.{" "}
          <Link href="/customer/bookings" className="underline">
            View bookings
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 text-sm text-card-foreground">
      <p className="font-medium">{draft.description}</p>
      <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-start gap-2">
          <User className="mt-0.5 size-3.5 shrink-0" /> {draft.workerName}
        </li>
        <li className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" /> {formatWhen(draft.datetime)}
        </li>
        <li className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0" /> {draft.location}
        </li>
        <li className="flex items-start gap-2 font-medium text-foreground">
          <IndianRupee className="mt-0.5 size-3.5 shrink-0" /> {draft.charge}
        </li>
      </ul>

      {draft.priceCheck && (
        <p className="mt-2 text-xs text-muted-foreground">
          {draft.priceCheck.badge && (
            <span className="mr-1 font-medium text-foreground">{BADGE_LABEL[draft.priceCheck.badge]}.</span>
          )}
          Typical price ₹{draft.priceCheck.range.low}–₹{draft.priceCheck.range.high}
          {draft.priceCheck.range.source === "estimate" ? " (rough estimate)" : ""}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={disabled || state === "submitting"}
          onClick={confirm}
        >
          {state === "submitting" ? "Booking…" : "Confirm Booking"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || state === "submitting"}
          onClick={onEdit}
        >
          Edit
        </Button>
      </div>
    </div>
  );
}
