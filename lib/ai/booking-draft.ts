import { z } from "zod";

export const bookingDraftSchema = z.object({
  workerId: z.string().min(1),
  description: z.string().trim().min(3, "Describe the job in a few words"),
  details: z.string().trim().optional(),
  datetime: z.string().min(1),
  location: z.string().trim().min(3, "Address is required"),
  charge: z.number().positive("Charge must be greater than 0").max(1_000_000),
});

export type BookingDraftInput = z.infer<typeof bookingDraftSchema>;

export type DraftCheck =
  | { ok: true; datetime: string }
  | { ok: false; error: string };

/**
 * Checks the parts of a draft that do not need the database:
 * the date must parse and be in the future.
 */
export function checkDraftDate(datetime: string, now = new Date()): DraftCheck {
  const dt = new Date(datetime);
  if (isNaN(dt.getTime())) {
    return { ok: false, error: "The date and time could not be understood" };
  }
  if (dt.getTime() <= now.getTime()) {
    return { ok: false, error: "Please choose a future date and time" };
  }
  return { ok: true, datetime: dt.toISOString() };
}
