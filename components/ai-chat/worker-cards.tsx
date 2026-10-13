"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, IndianRupee, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WorkerJob = {
  id: string;
  description: string;
  status: string;
  paymentStatus: string;
  time: string;
  location: string;
  charge: number;
  workerEarnings: number | null;
  customerName: string | null;
};

export type Earnings = {
  total: number;
  thisMonth: number;
  lastMonth: number;
  monthlyChangePercent: number;
  completedJobs: number;
};

export type JobActionDraft = {
  jobId: string;
  action: "ACCEPT" | "CANCEL";
  reason: string | null;
  description: string;
  customerName: string | null;
  time: string;
  location: string;
  charge: number;
  workerEarnings: number | null;
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** The worker's jobs. Pending jobs get quick Accept / Decline buttons that start the confirmation flow. */
export function JobList({
  jobs,
  disabled,
  onAction,
}: {
  jobs: WorkerJob[];
  disabled?: boolean;
  onAction: (job: WorkerJob, action: "ACCEPT" | "DECLINE") => void;
}) {
  if (jobs.length === 0) return <p className="text-xs text-muted-foreground">No jobs found.</p>;

  return (
    <ul className="space-y-2">
      {jobs.map((j) => (
        <li key={j.id} className="rounded-lg border bg-card p-3 text-xs text-card-foreground">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium">{j.description}</span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5">{j.status}</span>
          </div>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            {j.customerName && (
              <li className="flex items-start gap-2">
                <User className="mt-0.5 size-3.5 shrink-0" /> {j.customerName}
              </li>
            )}
            <li className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0" /> {when(j.time)}
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0" /> {j.location}
            </li>
            <li className="flex items-start gap-2 font-medium text-foreground">
              <IndianRupee className="mt-0.5 size-3.5 shrink-0" />
              {inr(j.charge)}
              {j.workerEarnings != null && (
                <span className="font-normal text-muted-foreground">(you earn {inr(j.workerEarnings)})</span>
              )}
            </li>
          </ul>
          {j.status === "PENDING" && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={disabled} onClick={() => onAction(j, "ACCEPT")}>
                Accept
              </Button>
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAction(j, "DECLINE")}>
                Decline
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function EarningsCard({ earnings }: { earnings: Earnings }) {
  const change = earnings.monthlyChangePercent;
  return (
    <div className="rounded-lg border bg-card p-3 text-xs text-card-foreground">
      <p className="text-muted-foreground">Total earned</p>
      <p className="text-lg font-semibold">{inr(earnings.total)}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <p className="text-muted-foreground">This month</p>
          <p className="font-medium">{inr(earnings.thisMonth)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Last month</p>
          <p className="font-medium">{inr(earnings.lastMonth)}</p>
        </div>
      </div>
      <p className="mt-2 text-muted-foreground">
        {change === 0 ? "No change from last month" : `${change > 0 ? "Up" : "Down"} ${Math.abs(Math.round(change))}% from last month`}
        {" · "}
        {earnings.completedJobs} completed {earnings.completedJobs === 1 ? "job" : "jobs"}
      </p>
    </div>
  );
}

type State = "idle" | "submitting" | "done";

/** Confirmation card for accepting or declining a job. Calls the normal job API, like the Jobs page does. */
export function JobActionCard({ draft, disabled }: { draft: JobActionDraft; disabled?: boolean }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const accepting = draft.action === "ACCEPT";

  async function confirm() {
    setState("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${draft.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: draft.action, ...(draft.reason ? { reason: draft.reason } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === "string" ? data.error : "Could not update the job");
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
          <CheckCircle2 className="size-4" /> {accepting ? "Job accepted" : "Job declined"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 text-sm text-card-foreground">
      <p className="font-medium">{accepting ? "Accept this job?" : "Decline this job?"}</p>
      <p className="mt-1 text-xs">{draft.description}</p>
      <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        {draft.customerName && (
          <li className="flex items-start gap-2">
            <User className="mt-0.5 size-3.5 shrink-0" /> {draft.customerName}
          </li>
        )}
        <li className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" /> {when(draft.time)}
        </li>
        <li className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0" /> {draft.location}
        </li>
        <li className="flex items-start gap-2 font-medium text-foreground">
          <IndianRupee className="mt-0.5 size-3.5 shrink-0" /> {inr(draft.charge)}
        </li>
      </ul>
      {!accepting && <p className="mt-2 text-xs text-muted-foreground">Declining cancels this job for the customer.</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          variant={accepting ? "default" : "destructive"}
          disabled={disabled || state === "submitting"}
          onClick={confirm}
        >
          {state === "submitting" ? "Saving…" : accepting ? "Accept job" : "Decline job"}
        </Button>
      </div>
    </div>
  );
}
