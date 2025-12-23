import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nip19 } from "nostr-tools";

import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { fetchProfileMetadata } from "@/lib/nostr";

const whitelistStatusEnum = z.enum(["PENDING", "ACTIVE", "PAUSED", "REVOKED", "VANISHED"]);

const decodeNpub = (npub: string) => {
  const decoded = nip19.decode(npub.trim());
  if (decoded.type !== "npub") {
    throw new Error("Invalid npub");
  }
  const data = decoded.data;
  return typeof data === "string" ? data : Buffer.from(data).toString("hex");
};

export const adminRouter = createTRPCRouter({
  getProfilePreview: adminProcedure
    .input(z.object({ npub: z.string() }))
    .query(async ({ input }) => {
      try {
        const pubkey = decodeNpub(input.npub);
        const metadata = await fetchProfileMetadata(pubkey);
        return metadata;
      } catch (error) {
        return null;
      }
    }),

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
          blacklistViolations: true,
          lastBlacklistViolation: true,
          permanentlyBanned: true,
          accountAgeMonths: true,
          invitePrivilegesSuspended: true,
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

      let displayName = input.displayName;
      if (!displayName) {
        const metadata = await fetchProfileMetadata(pubkey);
        if (metadata) {
          displayName = metadata.displayName || metadata.name;
        }
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
            displayName: displayName ?? existingUser.displayName,
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
          displayName: displayName,
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

      // Return DM payload for client-side sending
      return {
        user,
        dmPayload: user.pubkey
          ? {
              targetPubkey: user.pubkey,
              targetNpub: user.npub,
              status: input.status,
              reason: input.note,
            }
          : undefined,
      };
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
              blacklistViolations: true,
              permanentlyBanned: true,
            },
          },
        },
      });

      // Blacklist propagation: track violations for the inviter
      if (user.invitedById && user.invitedBy) {
        if (!user.invitedBy.isAdmin) {
          const newViolationCount = user.invitedBy.blacklistViolations + 1;
          const now = new Date();
          
          // Determine suspension based on violation count
          const isPermanentlyBanned = newViolationCount >= 3;
          const isSuspended = !isPermanentlyBanned; // Suspend for 1 month if not permanently banned
          
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
                ? `Permanently banned: ${newViolationCount} blacklist violations (invited user ${user.displayName ?? user.npub} was blacklisted)`
                : `Suspended until ${suspensionEndDate.toLocaleDateString()}: Invited user ${user.displayName ?? user.npub} was blacklisted (violation ${newViolationCount}/3)`,
              requiresAdminApproval: !isPermanentlyBanned, // Only require approval if not permanently banned
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

  refreshDisplayName: adminProcedure
    .input(z.object({ userId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          pubkey: true,
          displayName: true,
        },
      });

      if (!user || !user.pubkey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const metadata = await fetchProfileMetadata(user.pubkey);
      if (!metadata) {
        return { updated: false, displayName: user.displayName ?? null };
      }

      const nextDisplayName = metadata.displayName || metadata.name || null;
      if (!nextDisplayName || nextDisplayName === user.displayName) {
        return { updated: false, displayName: user.displayName ?? nextDisplayName };
      }

      await ctx.db.user.update({
        where: { id: user.id },
        data: { displayName: nextDisplayName },
      });

      return { updated: true, displayName: nextDisplayName };
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