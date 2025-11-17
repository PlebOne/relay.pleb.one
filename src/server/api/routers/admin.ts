import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nip19 } from "nostr-tools";

import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";

const whitelistStatusEnum = z.enum(["PENDING", "ACTIVE", "PAUSED", "REVOKED"]);

const decodeNpub = (npub: string) => {
  const decoded = nip19.decode(npub.trim());
  if (decoded.type !== "npub") {
    throw new Error("Invalid npub");
  }
  const data = decoded.data;
  return typeof data === "string" ? data : Buffer.from(data).toString("hex");
};

export const adminRouter = createTRPCRouter({
  listWhitelist: adminProcedure
    .input(
      z
        .object({
          query: z.string().optional(),
          status: z.array(whitelistStatusEnum).optional(),
          limit: z.number().min(1).max(100).default(25),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const users = await ctx.db.user.findMany({
        where: {
          ...(input?.query
            ? {
                OR: [
                  { npub: { contains: input.query.trim(), mode: "insensitive" } },
                  { displayName: { contains: input.query.trim(), mode: "insensitive" } },
                  { whitelistNotes: { contains: input.query.trim(), mode: "insensitive" } },
                ],
              }
            : {}),
          ...(input?.status && input.status.length > 0
            ? { whitelistStatus: { in: input.status } }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: input?.limit ?? 25,
        select: {
          id: true,
          npub: true,
          pubkey: true,
          displayName: true,
          whitelistStatus: true,
          whitelistNotes: true,
          inviteQuota: true,
          invitesUsed: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      type ListedUser = (typeof users)[number];

      return users.map((user: ListedUser) => ({
        ...user,
        invitesAvailable: Math.max(0, user.inviteQuota - user.invitesUsed),
      }));
    }),

  upsertWhitelistEntry: adminProcedure
    .input(
      z.object({
        npub: z.string().min(10),
        displayName: z.string().max(80).optional(),
        note: z.string().max(2000).optional(),
        status: whitelistStatusEnum.optional(),
        inviteQuota: z.number().min(0).max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let pubkey: string;
      try {
        pubkey = decodeNpub(input.npub);
      } catch (error) {
        console.error("Admin whitelist decode error", error);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid npub" });
      }

      const existingUser = await ctx.db.user.findFirst({
        where: { OR: [{ npub: input.npub.trim() }, { pubkey }] },
      });

      if (existingUser) {
        const updated = await ctx.db.user.update({
          where: { id: existingUser.id },
          data: {
            npub: input.npub.trim(),
            pubkey,
            displayName: input.displayName ?? existingUser.displayName,
            whitelistStatus: input.status ?? "ACTIVE",
            whitelistNotes: input.note ?? existingUser.whitelistNotes,
            inviteQuota: input.inviteQuota ?? existingUser.inviteQuota,
          },
        });
        return updated;
      }

      return ctx.db.user.create({
        data: {
          npub: input.npub.trim(),
          pubkey,
          displayName: input.displayName,
          whitelistStatus: input.status ?? "ACTIVE",
          whitelistNotes: input.note,
          inviteQuota: input.inviteQuota ?? 5,
        },
      });
    }),

  updateWhitelistStatus: adminProcedure
    .input(
      z.object({
        userId: z.string().cuid(),
        status: whitelistStatusEnum,
        note: z.string().max(2000).optional(),
        inviteQuota: z.number().min(0).max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: input.userId },
        data: {
          whitelistStatus: input.status,
          ...(typeof input.note !== "undefined" ? { whitelistNotes: input.note } : {}),
          ...(typeof input.inviteQuota !== "undefined" ? { inviteQuota: input.inviteQuota } : {}),
        },
        include: {
          invitedBy: {
            select: {
              id: true,
              isAdmin: true,
              invitePrivilegesSuspended: true,
            },
          },
        },
      });

      // Blacklist propagation: if user is revoked and was invited by someone, suspend inviter's privileges
      if (input.status === "REVOKED" && user.invitedById && user.invitedBy) {
        if (!user.invitedBy.isAdmin && !user.invitedBy.invitePrivilegesSuspended) {
          await ctx.db.user.update({
            where: { id: user.invitedById },
            data: {
              invitePrivilegesSuspended: true,
              inviteSuspensionReason: `Invited user ${user.displayName ?? user.npub} was blacklisted`,
              requiresAdminApproval: true,
            },
          });
        }
      }

      return user;
    }),

  removeWhitelistEntry: adminProcedure
    .input(z.object({ userId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: input.userId },
        data: {
          whitelistStatus: "REVOKED",
        },
        include: {
          invitedBy: {
            select: {
              id: true,
              isAdmin: true,
              invitePrivilegesSuspended: true,
            },
          },
        },
      });

      // Blacklist propagation when revoking
      if (user.invitedById && user.invitedBy) {
        if (!user.invitedBy.isAdmin && !user.invitedBy.invitePrivilegesSuspended) {
          await ctx.db.user.update({
            where: { id: user.invitedById },
            data: {
              invitePrivilegesSuspended: true,
              inviteSuspensionReason: `Invited user ${user.displayName ?? user.npub} was blacklisted`,
              requiresAdminApproval: true,
            },
          });
        }
      }

      return user;
    }),

  listPendingApprovals: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: {
        requiresAdminApproval: true,
        invitePrivilegesSuspended: true,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        npub: true,
        displayName: true,
        inviteSuspensionReason: true,
        updatedAt: true,
        usersInvited: {
          select: {
            id: true,
            npub: true,
            displayName: true,
            whitelistStatus: true,
          },
        },
      },
    });

    return users;
  }),

  approveInvitePrivileges: adminProcedure
    .input(z.object({ userId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: input.userId },
        data: {
          invitePrivilegesSuspended: false,
          inviteSuspensionReason: null,
          requiresAdminApproval: false,
        },
      });
    }),

  refreshMonthlyInvites: adminProcedure.mutation(async ({ ctx }) => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const result = await ctx.db.user.updateMany({
      where: {
        lastInviteRefresh: {
          lt: oneMonthAgo,
        },
        invitePrivilegesSuspended: false,
        whitelistStatus: "ACTIVE",
        isAdmin: false,
      },
      data: {
        invitesUsed: 0,
        lastInviteRefresh: new Date(),
      },
    });

    return { refreshedCount: result.count };
  }),
});