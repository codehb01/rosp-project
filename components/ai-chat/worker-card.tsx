"use client";

import { MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ChatWorker = {
  id: string;
  name: string;
  skills: string[];
  city: string | null;
  yearsExperience: number | null;
  hourlyRate: number | null;
  minimumFee: number | null;
  profilePic: string | null;
  rating: number | null;
  reviewCount: number;
};

type Props = {
  worker: ChatWorker;
  disabled?: boolean;
  onSelect: (worker: ChatWorker) => void;
};

function priceLabel(w: ChatWorker): string | null {
  if (w.hourlyRate) return `₹${w.hourlyRate}/hr`;
  if (w.minimumFee) return `from ₹${w.minimumFee}`;
  return null;
}

export function WorkerCard({ worker, disabled, onSelect }: Props) {
  const price = priceLabel(worker);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground">
      {worker.profilePic ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={worker.profilePic}
          alt={worker.name}
          className="size-11 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
          {worker.name.slice(0, 1).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{worker.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {worker.skills.slice(0, 2).join(", ") || "Worker"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {worker.rating !== null && (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {worker.rating} ({worker.reviewCount})
            </span>
          )}
          {worker.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {worker.city}
            </span>
          )}
          {price && <span>{price}</span>}
        </div>
      </div>

      <Button size="sm" disabled={disabled} onClick={() => onSelect(worker)}>
        Book
      </Button>
    </div>
  );
}
