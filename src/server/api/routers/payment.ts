import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const paymentRouter = createTRPCRouter({
  // Payment routes will be implemented here
  getPlaceholder: publicProcedure.query(() => {
    return { message: "Payment router placeholder" };
  }),
});