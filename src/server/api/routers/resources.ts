import { adminProcedure, createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { readHistory } from "@/server/resources/history";
import { readCertStatus } from "@/server/resources/services";
import { collectSnapshot, collectSummary } from "@/server/resources/snapshot";

export const resourcesRouter = createTRPCRouter({
  // Any logged-in user: overall status, uptime, disk % and event count only.
  summary: protectedProcedure.query(() => collectSummary()),

  // Full host/service detail. adminProcedure enforces admin server-side.
  detail: adminProcedure.query(async () => {
    const [snapshot, tls] = await Promise.all([collectSnapshot(), readCertStatus()]);
    return { ...snapshot, tls };
  }),

  history: adminProcedure.query(() => readHistory()),
});
