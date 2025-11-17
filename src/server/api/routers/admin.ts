import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const adminRouter = createTRPCRouter({
  // Admin routes will be implemented here
  getPlaceholder: publicProcedure.query(() => {
    return { message: "Admin router placeholder" };
  }),
});