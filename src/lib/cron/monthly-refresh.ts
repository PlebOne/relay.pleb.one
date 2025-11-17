import { db } from "@/server/db";

/**
 * Monthly invite refresh job
 * 
 * Resets invitesUsed to 0 for all eligible users (max 5 invites per month)
 * 
 * Run this as a cron job on the 1st of each month:
 * - Via external cron: 0 0 1 * * /path/to/node monthly-refresh.js
 * - Via Vercel cron: configure vercel.json
 * - Via GitHub Actions: .github/workflows/monthly-refresh.yml
 * - Via admin panel: manual button (already implemented)
 * 
 * Eligible users:
 * - Active whitelist status
 * - Not suspended
 * - Not admin (admins have unlimited)
 * - Haven't refreshed in the last month
 */
export async function runMonthlyInviteRefresh() {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const result = await db.user.updateMany({
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

  console.log(`✅ Monthly invite refresh complete. Refreshed ${result.count} users.`);
  
  return {
    success: true,
    refreshedCount: result.count,
    timestamp: new Date().toISOString(),
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
