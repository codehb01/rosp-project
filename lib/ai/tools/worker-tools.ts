import "server-only";
import { tool } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import type { AuthenticatedUser } from "@/lib/api-auth";
import { canAcceptJob, canCancelJob } from "@/lib/access/job-access";
import { getWorkerEarningsStats } from "@/lib/services/worker-service";
import { getRangeForWorker } from "@/lib/ai/market-price";

const JOB_STATUSES = ["PENDING", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Chat tools for a signed-in worker. Every query is scoped to the worker's own
 * id, and there is no tool that changes a job: prepareJobAction only returns a
 * draft that the worker confirms in the UI, which calls the normal job API.
 */
export function createWorkerChatTools(user: AuthenticatedUser) {
  return {
    getMyJobs: tool({
      description: "List the worker's own jobs, newest first. Optionally filter by status.",
      inputSchema: z.object({
        status: z.enum(JOB_STATUSES).optional().describe("Only jobs in this status"),
        limit: z.number().int().min(1).max(10).optional().describe("Max jobs, default 5"),
      }),
      execute: async ({ status, limit }) => {
        const jobs = await prisma.job.findMany({
          where: { workerId: user.id, ...(status ? { status } : {}) },
          orderBy: { createdAt: "desc" },
          take: limit ?? 5,
          select: {
            id: true,
            description: true,
            status: true,
            paymentStatus: true,
            time: true,
            location: true,
            charge: true,
            workerEarnings: true,
            customer: { select: { name: true } },
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
            workerEarnings: j.workerEarnings,
            customerName: j.customer?.name ?? null,
          })),
        };
      },
    }),

    getEarnings: tool({
      description: "Get the worker's earnings: total, this month, last month and the monthly change.",
      inputSchema: z.object({}),
      execute: async () => {
        const stats = await getWorkerEarningsStats(user.id);
        return {
          total: round(stats.total),
          thisMonth: round(stats.thisMonth),
          lastMonth: round(stats.lastMonth),
          monthlyChangePercent: round(stats.monthlyChange),
          completedJobs: stats.jobs.length,
          currency: "INR",
        };
      },
    }),

    getPriceGuidance: tool({
      description: "Get the worker's own rates and the typical price for their main skill and city.",
      inputSchema: z.object({}),
      execute: async () => {
        const profile = await prisma.workerProfile.findUnique({
          where: { userId: user.id },
          select: { hourlyRate: true, minimumFee: true, skilledIn: true, city: true },
        });
        if (!profile) return { error: "Worker profile not found" };

        let typicalRange = null;
        try {
          typicalRange = await getRangeForWorker(user.id);
        } catch (error) {
          console.error("[ai] price guidance lookup failed", error);
        }
        return {
          hourlyRate: profile.hourlyRate,
          minimumFee: profile.minimumFee,
          city: profile.city,
          typicalRange,
        };
      },
    }),

    prepareJobAction: tool({
      description:
        "Prepare accepting or declining one of the worker's own jobs, for the worker to confirm. This does NOT change the job.",
      inputSchema: z.object({
        jobId: z.string().describe("Job id from getMyJobs"),
        action: z.enum(["ACCEPT", "DECLINE"]),
        reason: z.string().max(200).optional().describe("Short reason, for declining"),
      }),
      execute: async ({ jobId, action, reason }) => {
        // Scoped to this worker: someone else's job id is simply "not found".
        const job = await prisma.job.findFirst({
          where: { id: jobId, workerId: user.id },
          include: { customer: { select: { name: true } } },
        });
        if (!job) return { ok: false as const, error: "Job not found" };

        const access = action === "ACCEPT" ? canAcceptJob(user, job) : canCancelJob(user, job);
        if (!access.allowed) return { ok: false as const, error: access.error };

        return {
          ok: true as const,
          draft: {
            jobId: job.id,
            // Declining uses the existing CANCEL action of the job API.
            action: action === "ACCEPT" ? ("ACCEPT" as const) : ("CANCEL" as const),
            reason: reason ?? null,
            description: job.description,
            customerName: job.customer?.name ?? null,
            time: job.time.toISOString(),
            location: job.location,
            charge: job.charge,
            workerEarnings: job.workerEarnings,
          },
        };
      },
    }),
  };
}
