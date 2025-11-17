import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

/**
 * User management router
 * Handles user profiles, subscriptions, and basic operations
 */
export const userRouter = createTRPCRouter({
  /**
   * Get current user profile
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      include: {
        subscriptions: {
          where: {
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        },
        uploads: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    return user;
  }),

  /**
   * Update user profile
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: input,
      });
    }),

  /**
   * Get user subscription status
   */
  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const subscriptions = await ctx.db.subscription.findMany({
      where: {
        userId: ctx.session.user.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: "desc" },
    });

    return {
      hasRelay: subscriptions.some(s => 
        s.type === "RELAY_MONTHLY" || 
        s.type === "RELAY_YEARLY" || 
        s.type === "COMBO_MONTHLY" || 
        s.type === "COMBO_YEARLY"
      ),
      hasBlossom: subscriptions.some(s => 
        s.type === "BLOSSOM_MONTHLY" || 
        s.type === "BLOSSOM_YEARLY" || 
        s.type === "COMBO_MONTHLY" || 
        s.type === "COMBO_YEARLY"
      ),
      subscriptions,
    };
  }),

  /**
   * Export user data (GDPR compliance)
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      include: {
        subscriptions: true,
        events: {
          orderBy: { createdAt: "desc" },
          take: 1000, // Limit for performance
        },
        uploads: true,
      },
    });

    return {
      profile: {
        id: user?.id,
        npub: user?.npub,
        pubkey: user?.pubkey,
        email: user?.email,
        createdAt: user?.createdAt,
      },
      subscriptions: user?.subscriptions || [],
      recentEvents: user?.events || [],
      uploads: user?.uploads || [],
    };
  }),
});