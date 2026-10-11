import "server-only";
import { tool } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import type { AuthenticatedUser } from "@/lib/api-auth";
import { searchWorkersTool } from "@/lib/ai/tools/search-workers";
import { getQuoteTool } from "@/lib/ai/tools/get-quote";
import { bookingDraftSchema, checkDraftDate } from "@/lib/ai/booking-draft";
import { getPriceCheck } from "@/lib/ai/market-price";

/**
 * Builds the chat tools for one request. Tools that touch user data close over
 * the authenticated user, so the model never supplies (or can change) identity.
 *
 * There is deliberately no tool that creates a booking: prepareBooking only
 * returns a draft, and the customer confirms it in the UI.
 */
export function createChatTools(user: AuthenticatedUser) {
  return {
    searchWorkers: searchWorkersTool,
    getQuote: getQuoteTool,

    getCustomerAddress: tool({
      description: "Get the customer's saved address from their profile.",
      inputSchema: z.object({}),
      execute: async () => {
        const p = user.customerProfile;
        if (!p?.address) return { address: null };
        const full = [p.address, p.city, p.state, p.postalCode].filter(Boolean).join(", ");
        return { address: full };
      },
    }),

    prepareBooking: tool({
      description:
        "Prepare a booking draft for the customer to confirm. Call only when worker, description, future datetime, address and amount are all known. This does NOT create the booking.",
      inputSchema: bookingDraftSchema.extend({
        datetime: z.string().describe("ISO 8601 with +05:30 offset, must be in the future"),
        charge: z.number().describe("Amount in INR"),
      }),
      execute: async (input) => {
        const parsed = bookingDraftSchema.safeParse(input);
        if (!parsed.success) {
          return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid booking details" };
        }
        const draft = parsed.data;

        const date = checkDraftDate(draft.datetime);
        if (!date.ok) return { ok: false as const, error: date.error };

        const worker = await prisma.user.findFirst({
          where: { id: draft.workerId, role: "WORKER" },
          select: { id: true, name: true },
        });
        if (!worker) return { ok: false as const, error: "Worker not found" };

        const priceCheck = await getPriceCheck(worker.id, draft.charge);

        return {
          ok: true as const,
          draft: {
            workerId: worker.id,
            workerName: worker.name,
            description: draft.description,
            details: draft.details ?? null,
            datetime: date.datetime,
            location: draft.location,
            charge: draft.charge,
            priceCheck,
          },
        };
      },
    }),

    getBookingStatus: tool({
      description: "Get the status of the customer's recent bookings, or one booking by id.",
      inputSchema: z.object({ jobId: z.string().optional() }),
      execute: async ({ jobId }) => {
        const jobs = await prisma.job.findMany({
          where: { customerId: user.id, ...(jobId ? { id: jobId } : {}) },
          orderBy: { createdAt: "desc" },
          take: jobId ? 1 : 5,
          select: {
            id: true,
            description: true,
            status: true,
            paymentStatus: true,
            time: true,
            location: true,
            charge: true,
            worker: { select: { name: true } },
          },
        });
        return {
          jobs: jobs.map((j) => ({
            id: j.id,
            description: j.description,
            status: j.status,
            paymentStatus: j.paymentStatus,
            time: j.time.toISOString(),
            location: j.location,
            charge: j.charge,
            workerName: j.worker?.name ?? null,
          })),
        };
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;
