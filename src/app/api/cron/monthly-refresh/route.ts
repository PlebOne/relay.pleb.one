import { type NextRequest } from "next/server";
import { runMonthlyInviteRefresh } from "@/lib/cron/monthly-refresh";

/**
 * API route for monthly invite refresh cron job
 * 
 * Vercel Cron will call this automatically on the 1st of each month
 * Can also be triggered manually via admin panel
 */
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (or admin)
  const authHeader = request.headers.get("authorization");
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonthlyInviteRefresh();
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("Monthly refresh error:", error);
    return Response.json(
      {
        error: "Failed to refresh invites",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
