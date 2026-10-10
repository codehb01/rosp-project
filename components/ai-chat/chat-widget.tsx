"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkerCard, type ChatWorker } from "@/components/ai-chat/worker-card";
import { ConfirmCard, type BookingDraft } from "@/components/ai-chat/confirm-card";

const SUGGESTIONS = ["Find a plumber near me", "Book an electrician tomorrow", "Where is my worker?"];

type ToolPart = { type: string; state?: string; toolCallId?: string; output?: unknown };

type BookingJob = {
  id: string;
  description: string;
  status: string;
  workerName: string | null;
  time: string;
};

const isToolPart = (p: { type: string }): p is ToolPart => p.type.startsWith("tool-");

function ToolOutput({
  part,
  isLast,
  busy,
  send,
}: {
  part: ToolPart;
  isLast: boolean;
  busy: boolean;
  send: (text: string) => void;
}) {
  if (part.state !== "output-available") return null;
  const out = part.output as Record<string, unknown> | undefined;
  if (!out) return null;

  switch (part.type) {
    case "tool-searchWorkers": {
      const workers = (out.workers as ChatWorker[]) ?? [];
      if (workers.length === 0) {
        return <p className="text-xs text-muted-foreground">No workers found for that search.</p>;
      }
      return (
        <div className="space-y-2">
          {workers.map((w) => (
            <WorkerCard
              key={w.id}
              worker={w}
              disabled={busy || !isLast}
              onSelect={(worker) => send(`I choose ${worker.name}`)}
            />
          ))}
        </div>
      );
    }

    case "tool-getCustomerAddress": {
      const address = out.address as string | null;
      if (!address || !isLast) return null;
      return (
        <div className="space-y-2 rounded-lg border bg-card p-3 text-xs">
          <p className="text-muted-foreground">Saved address</p>
          <p className="font-medium">{address}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => send("Yes, use this address")}>
              Use this
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => send("I want to use a different address")}
            >
              Change
            </Button>
          </div>
        </div>
      );
    }

    case "tool-prepareBooking": {
      if (out.ok !== true) return null;
      return (
        <ConfirmCard
          draft={out.draft as BookingDraft}
          disabled={busy}
          onEdit={() => send("I want to change the booking details")}
        />
      );
    }

    case "tool-getBookingStatus": {
      const jobs = (out.jobs as BookingJob[]) ?? [];
      if (jobs.length === 0) return <p className="text-xs text-muted-foreground">No bookings yet.</p>;
      return (
        <ul className="space-y-1.5">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border bg-card p-2 text-xs">
              <span className="font-medium">{j.description}</span>
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5">{j.status}</span>
              <p className="text-muted-foreground">{j.workerName ?? "Unassigned"}</p>
            </li>
          ))}
        </ul>
      );
    }

    default:
      return null;
  }
}

export default function ChatWidget() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/ai/chat" }));
  const { messages, sendMessage, status, error } = useChat({ transport });
  const endRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status, open]);

  // Chat booking is for signed-in customers; keep it off worker and onboarding screens.
  if (!isSignedIn) return null;
  if (pathname?.startsWith("/worker") || pathname?.startsWith("/onboarding")) return null;

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
  };

  const lastId = messages[messages.length - 1]?.id;

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open assistant"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          <MessageCircle className="size-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden border bg-background shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:w-[380px] sm:rounded-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">RozgaarSetu Assistant</p>
              <p className="text-xs text-muted-foreground">Find and book workers</p>
            </div>
            <Button size="icon" variant="ghost" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hi! Tell me what you need, for example &quot;plumber in Pune tomorrow 10am&quot;. You can write in
                  English, Hindi or Marathi.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "space-y-2"}>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    if (!part.text.trim()) return null;
                    return (
                      <div
                        key={i}
                        className={
                          m.role === "user"
                            ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                            : "max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
                        }
                      >
                        {part.text}
                      </div>
                    );
                  }
                  if (isToolPart(part)) {
                    return (
                      <ToolOutput
                        key={part.toolCallId ?? i}
                        part={part}
                        isLast={m.id === lastId}
                        busy={busy}
                        send={send}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            ))}

            {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
            {status === "error" && (
              <p className="text-xs text-destructive">
                {error?.message?.includes("403")
                  ? "The assistant is available for customer accounts."
                  : "Something went wrong. Please try again."}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-center gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
              setInput("");
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              maxLength={500}
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              <Send />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
