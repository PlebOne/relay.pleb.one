import { db } from "@/server/db";

/**
 * Monthly invite refresh job
 * 
 * - Resets invitesUsed to 0 for all eligible users
 * - Increases invite quota to 15 for users with 3+ months, no violations
 * - Lifts 1-month suspensions (but not permanent bans)
 * - Updates account age tracking
 * 
 * Run this as a cron job on the 1st of each month:
 * - Via external cron: 0 0 1 * * /path/to/node monthly-refresh.js
 * - Via Vercel cron: configure vercel.json
 * - Via GitHub Actions: .github/workflows/monthly-refresh.yml
 * - Via admin panel: manual button (already implemented)
 * 
 * Eligible users for refresh:
 * - Active whitelist status
 * - Not permanently banned
 * - Not admin (admins have unlimited)
 * - Haven't refreshed in the last month
 */
export async function runMonthlyInviteRefresh() {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  const now = new Date();

  // 1. Increment account age for all active users
  await db.user.updateMany({
    where: {
      whitelistStatus: "ACTIVE",
      isAdmin: false,
    },
    data: {
      accountAgeMonths: {
        increment: 1,
      },
    },
  });

  // 2. Lift temporary suspensions (1 month has passed)
  const suspensionLiftResult = await db.user.updateMany({
    where: {
      invitePrivilegesSuspended: true,
      permanentlyBanned: false, // Don't lift permanent bans
      lastBlacklistViolation: {
        lt: oneMonthAgo, // More than 1 month ago
      },
    },
    data: {
      invitePrivilegesSuspended: false,
      requiresAdminApproval: false,
      inviteSuspensionReason: null,
    },
  });

  // 3. Upgrade trusted users (3+ months, no violations) to 15 invites
  const upgradeResult = await db.user.updateMany({
    where: {
      accountAgeMonths: {
        gte: 3,
      },
      blacklistViolations: 0,
      inviteQuota: {
        lt: 15, // Haven't been upgraded yet
      },
      whitelistStatus: "ACTIVE",
      isAdmin: false,
    },
    data: {
      inviteQuota: 15,
      lastQuotaIncrease: now,
    },
  });

  // 4. Reset invites for eligible users
  const refreshResult = await db.user.updateMany({
    where: {
      lastInviteRefresh: {
        lt: oneMonthAgo,
      },
      invitePrivilegesSuspended: false,
      permanentlyBanned: false,
      whitelistStatus: "ACTIVE",
      isAdmin: false,
    },
    data: {
      invitesUsed: 0,
      lastInviteRefresh: now,
    },
  });

  console.log(`✅ Monthly invite refresh complete.`);
  console.log(`   - Refreshed invites: ${refreshResult.count} users`);
  console.log(`   - Lifted suspensions: ${suspensionLiftResult.count} users`);
  console.log(`   - Upgraded to 15 invites: ${upgradeResult.count} users`);
  
  return {
    success: true,
    refreshedCount: refreshResult.count,
    suspensionsLifted: suspensionLiftResult.count,
    usersUpgraded: upgradeResult.count,
    timestamp: now.toISOString(),
  };
}

// Allow running directly: node --experimental-specifier-resolution=node src/lib/cron/monthly-refresh.ts
if (require.main === module) {
  runMonthlyInviteRefresh()
    .then((result) => {
      console.log("Result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error running monthly refresh:", error);
      process.exit(1);
    });
}
