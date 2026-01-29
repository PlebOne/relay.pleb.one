import { z } from "zod";
import { nip19 } from "nostr-tools";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { fetchProfileMetadata } from "@/lib/nostr";

/**
 * User management router
 * Handles user profiles and basic operations
 */
export const userRouter = createTRPCRouter({
  /**
   * Get current user profile
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
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
   * Export user data (GDPR compliance)
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 1000, // Limit for performance
        },
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
      recentEvents: user?.events || [],
    };
  }),

  getProfilePreview: protectedProcedure
    .input(z.object({ npub: z.string() }))
    .query(async ({ input }) => {
      try {
        const decoded = nip19.decode(input.npub.trim());
        if (decoded.type !== "npub") return null;
        const pubkey = typeof decoded.data === "string" ? decoded.data : Buffer.from(decoded.data).toString("hex");
        const metadata = await fetchProfileMetadata(pubkey);
        return metadata;
      } catch (error) {
        return null;
      }
    }),

  getWhitelistStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        whitelistStatus: true,
        whitelistNotes: true,
        inviteQuota: true,
        invitesUsed: true,
        invitePrivilegesSuspended: true,
        inviteSuspensionReason: true,
        blacklistViolations: true,
        lastBlacklistViolation: true,
        permanentlyBanned: true,
        accountAgeMonths: true,
        lastQuotaIncrease: true,
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return {
      status: user.whitelistStatus,
      notes: user.whitelistNotes,
      inviteQuota: user.inviteQuota,
      invitesUsed: user.invitesUsed,
      invitesAvailable: Math.max(0, user.inviteQuota - user.invitesUsed),
      invitePrivilegesSuspended: user.invitePrivilegesSuspended,
      inviteSuspensionReason: user.inviteSuspensionReason,
      blacklistViolations: user.blacklistViolations,
      lastBlacklistViolation: user.lastBlacklistViolation,
      permanentlyBanned: user.permanentlyBanned,
      accountAgeMonths: user.accountAgeMonths,
      lastQuotaIncrease: user.lastQuotaIncrease,
      isTrustedMember: user.inviteQuota >= 15 && user.blacklistViolations === 0,
    };
  }),

  inviteToWhitelist: protectedProcedure
    .input(
      z.object({
        npub: z.string().min(10),
        displayName: z.string().max(80).optional(),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const inviter = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          pubkey: true,
          inviteQuota: true,
          invitesUsed: true,
          whitelistStatus: true,
          isAdmin: true,
          invitePrivilegesSuspended: true,
          inviteSuspensionReason: true,
        },
      });

      if (!inviter) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (inviter.whitelistStatus !== "ACTIVE" && !inviter.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Whitelist access required" });
      }

      if (inviter.invitePrivilegesSuspended && !inviter.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: inviter.inviteSuspensionReason || "Invite privileges suspended",
        });
      }

      const invitesAvailable = inviter.isAdmin
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, inviter.inviteQuota - inviter.invitesUsed);

      if (invitesAvailable <= 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No invites remaining" });
      }

      let pubkey: string;
      try {
        const decoded = nip19.decode(input.npub.trim());
        if (decoded.type !== "npub") {
          throw new Error("Invalid npub");
        }
        const data = decoded.data;
        pubkey = typeof data === "string" ? data : Buffer.from(data).toString("hex");
      } catch (error) {
        console.error("Whitelist invite decode error", error);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid npub" });
      }

      if (inviter.pubkey === pubkey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot invite yourself" });
      }

      let displayName = input.displayName;
      if (!displayName) {
        const metadata = await fetchProfileMetadata(pubkey);
        if (metadata) {
          displayName = metadata.displayName || metadata.name;
        }
      }

      const targetNpub = input.npub.trim();

      const existingUser = await ctx.db.user.findFirst({
        where: {
          OR: [{ pubkey }, { npub: targetNpub }],
        },
      });

      let inviteeId: string;
      if (existingUser) {
        if (existingUser.whitelistStatus === "ACTIVE") {
          throw new TRPCError({ code: "CONFLICT", message: "User already whitelisted" });
        }

        const updated = await ctx.db.user.update({
          where: { id: existingUser.id },
          data: {
            pubkey,
            npub: existingUser.npub ?? targetNpub,
            displayName: displayName ?? existingUser.displayName,
            whitelistStatus: "ACTIVE",
            invitedById: inviter.id,
          },
        });
        inviteeId = updated.id;
      } else {
        const created = await ctx.db.user.create({
          data: {
            pubkey,
            npub: targetNpub,
            displayName: displayName,
            whitelistStatus: "ACTIVE",
            inviteQuota: 5,
            invitedById: inviter.id,
          },
        });
        inviteeId = created.id;
      }

      await ctx.db.whitelistInvite.create({
        data: {
          inviterId: inviter.id,
          inviteeId,
          inviteeNpub: targetNpub,
          inviteePubkey: pubkey,
          inviteeName: displayName,
          notes: input.note,
          status: "APPROVED",
          approvedById: inviter.id,
          approvedAt: new Date(),
        },
      });

      if (!inviter.isAdmin) {
        await ctx.db.user.update({
          where: { id: inviter.id },
          data: {
            invitesUsed: { increment: 1 },
          },
        });
      }

      return {
        inviteeId,
        invitesRemaining: inviter.isAdmin
          ? Number.MAX_SAFE_INTEGER
          : Math.max(0, invitesAvailable - 1),
      };
    }),

  getNip05Settings: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        nip05Name: true,
        nip05Enabled: true,
      },
    });

    return {
      name: user?.nip05Name ?? null,
      enabled: user?.nip05Enabled ?? false,
    };
  }),

  updateNip05: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(30).regex(/^[a-z0-9_]+$/).optional(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const RESERVED_NAMES = ["admin", "root", "info", "support", "help", "abuse", "postmaster", "webmaster", "_"];
      
      if (input.name) {
        const normalizedName = input.name.toLowerCase().trim();
        
        if (RESERVED_NAMES.includes(normalizedName)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This name is reserved and cannot be used",
          });
        }

        const existingUser = await ctx.db.user.findFirst({
          where: {
            nip05Name: normalizedName,
            NOT: { id: ctx.session.user.id },
          },
        });

        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This name is already taken",
          });
        }
      }

      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          nip05Name: input.name?.toLowerCase().trim() ?? null,
          nip05Enabled: input.enabled,
        },
      });
    }),
});