import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { buildWhitelistDmMessage } from "@/lib/whitelist-message";
import { env } from "@/env";

const messageTypeEnum = z.enum(["BLACKLIST_REQUEST", "WHITELIST_REQUEST", "SUPPORT_REQUEST", "APPEAL", "REPORT"]);
const messageStatusEnum = z.enum(["PENDING", "IN_REVIEW", "APPROVED", "DENIED", "RESOLVED"]);

export const messageRouter = createTRPCRouter({
  /**
   * List all admin messages with filters
   */
  list: adminProcedure
    .input(
      z.object({
        type: z.array(messageTypeEnum).optional(),
        status: z.array(messageStatusEnum).optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const messages = await ctx.db.adminMessage.findMany({
        where: {
          ...(input.type && input.type.length > 0 ? { type: { in: input.type } } : {}),
          ...(input.status && input.status.length > 0 ? { status: { in: input.status } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          resolvedBy: {
            select: {
              npub: true,
              displayName: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (messages.length > input.limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem?.id;
      }

      return {
        messages,
        nextCursor,
      };
    }),

  /**
   * Get stats for admin message board
   */
  getStats: adminProcedure.query(async ({ ctx }) => {
    const [pending, inReview, total] = await Promise.all([
      ctx.db.adminMessage.count({ where: { status: "PENDING" } }),
      ctx.db.adminMessage.count({ where: { status: "IN_REVIEW" } }),
      ctx.db.adminMessage.count(),
    ]);

    const byType = await ctx.db.adminMessage.groupBy({
      by: ["type"],
      _count: true,
      where: { status: { in: ["PENDING", "IN_REVIEW"] } },
    });

    return {
      pending,
      inReview,
      total,
      byType: Object.fromEntries(byType.map((item) => [item.type, item._count])),
    };
  }),

  /**
   * Update message status
   */
  updateStatus: adminProcedure
    .input(
      z.object({
        messageId: z.string(),
        status: messageStatusEnum,
        resolution: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.adminMessage.update({
        where: { id: input.messageId },
        data: {
          status: input.status,
          ...(input.resolution ? { resolution: input.resolution } : {}),
          ...(input.status !== "PENDING" && input.status !== "IN_REVIEW"
            ? {
                resolvedById: ctx.session.user.id,
                resolvedAt: new Date(),
              }
            : {}),
        },
      });
    }),

  /**
   * Quick action: Approve blacklist request and blacklist user
   */
  approveBlacklistRequest: adminProcedure
    .input(
      z.object({
        messageId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.adminMessage.findUnique({
        where: { id: input.messageId },
      });

      if (!message) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      }

      if (message.type !== "BLACKLIST_REQUEST") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a blacklist request" });
      }

      if (!message.targetPubkey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No target user specified" });
      }

      // Find or create user and blacklist them
      const user = await ctx.db.user.findFirst({
        where: { pubkey: message.targetPubkey },
        include: {
          invitedBy: {
            select: {
              id: true,
              isAdmin: true,
              blacklistViolations: true,
              permanentlyBanned: true,
            },
          },
        },
      });

      if (user) {
        // Blacklist existing user
        await ctx.db.user.update({
          where: { id: user.id },
          data: { whitelistStatus: "REVOKED" },
        });

        // Track violation for inviter
        if (user.invitedById && user.invitedBy && !user.invitedBy.isAdmin) {
          const newViolationCount = user.invitedBy.blacklistViolations + 1;
          const now = new Date();
          const isPermanentlyBanned = newViolationCount >= 3;
          const suspensionEndDate = new Date(now);
          suspensionEndDate.setMonth(suspensionEndDate.getMonth() + 1);

          await ctx.db.user.update({
            where: { id: user.invitedById },
            data: {
              blacklistViolations: newViolationCount,
              lastBlacklistViolation: now,
              invitePrivilegesSuspended: true,
              permanentlyBanned: isPermanentlyBanned,
              inviteSuspensionReason: isPermanentlyBanned
                ? `Permanently banned: ${newViolationCount} blacklist violations`
                : `Suspended until ${suspensionEndDate.toLocaleDateString()}: violation ${newViolationCount}/3`,
              requiresAdminApproval: !isPermanentlyBanned,
            },
          });
        }
      }

      // Update message status
      await ctx.db.adminMessage.update({
        where: { id: input.messageId },
        data: {
          status: "APPROVED",
          resolvedById: ctx.session.user.id,
          resolvedAt: new Date(),
          resolution: input.reason || "User blacklisted",
        },
      });

      return {
        success: true,
        userFound: !!user,
        message: user ? "User blacklisted successfully" : "User not found in system (may not have joined yet)",
      };
    }),

  /**
   * Quick action: Approve whitelist request
   */
  approveWhitelistRequest: adminProcedure
    .input(
      z.object({
        messageId: z.string(),
        inviteQuota: z.number().min(0).max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.adminMessage.findUnique({
        where: { id: input.messageId },
      });

      if (!message) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      }

      if (message.type !== "WHITELIST_REQUEST") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a whitelist request" });
      }

      if (!message.targetPubkey || !message.targetNpub) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No target user specified" });
      }

      // Create or update user
      const user = await ctx.db.user.upsert({
        where: { pubkey: message.targetPubkey },
        create: {
          npub: message.targetNpub,
          pubkey: message.targetPubkey,
          whitelistStatus: "ACTIVE",
          inviteQuota: input.inviteQuota ?? 5,
        },
        update: {
          whitelistStatus: "ACTIVE",
          inviteQuota: input.inviteQuota ?? 5,
        },
      });

      const dmMessage = buildWhitelistDmMessage({
        relayUrl: env.NEXT_PUBLIC_RELAY_URL,
        loginUrl: process.env.NEXTAUTH_URL ?? `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/login`,
        relayName: env.RELAY_NAME,
      });

      // Update message status - DM will be sent client-side
      await ctx.db.adminMessage.update({
        where: { id: input.messageId },
        data: {
          status: "APPROVED",
          resolvedById: ctx.session.user.id,
          resolvedAt: new Date(),
          resolution: "User whitelisted - DM pending",
        },
      });

      return {
        success: true,
        userId: user.id,
        dmPayload: {
          targetPubkey: message.targetPubkey,
          targetNpub: message.targetNpub,
          content: dmMessage,
        },
      };
    }),

  /**
   * Deny request
   */
  denyRequest: adminProcedure
    .input(
      z.object({
        messageId: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.adminMessage.update({
        where: { id: input.messageId },
        data: {
          status: "DENIED",
          resolvedById: ctx.session.user.id,
          resolvedAt: new Date(),
          resolution: input.reason,
        },
      });
    }),
});
