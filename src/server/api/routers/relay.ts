import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const relayRouter = createTRPCRouter({
  // Relay routes will be implemented here
  getPlaceholder: publicProcedure.query(() => {
    return { message: "Relay router placeholder" };
  }),
});