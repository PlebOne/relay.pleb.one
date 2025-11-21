import { NextResponse } from "next/server";
import { z } from "zod";
import { nip19 } from "nostr-tools";
import { db } from "@/server/db";

const reportSchema = z.object({
  submitterNpub: z.string().optional(),
  targetNpub: z.string().min(10),
  reason: z.string().min(5).max(200),
  evidence: z.string().min(10).max(2000),
});

function decodeNpub(npub: string): string {
  try {
    const decoded = nip19.decode(npub.trim());
    if (decoded.type !== "npub") {
      throw new Error("Invalid npub");
    }
    const data = decoded.data;
    return typeof data === "string" ? data : Buffer.from(data).toString("hex");
  } catch {
    throw new Error("Invalid npub format");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = reportSchema.parse(body);

    // Decode target npub
    let targetPubkey: string;
    try {
      targetPubkey = decodeNpub(data.targetNpub);
    } catch (_error) {
      return NextResponse.json(
        { error: "Invalid target npub format" },
        { status: 400 }
      );
    }

    // Decode submitter npub if provided
    let submitterPubkey: string | undefined;
    if (data.submitterNpub) {
      try {
        submitterPubkey = decodeNpub(data.submitterNpub);
      } catch (_error) {
        return NextResponse.json(
          { error: "Invalid submitter npub format" },
          { status: 400 }
        );
      }
    }

    // Get client IP and user agent for metadata
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    // Create admin message
    const message = await db.adminMessage.create({
      data: {
        type: "BLACKLIST_REQUEST",
        status: "PENDING",
        subject: `Blacklist request: ${data.reason}`,
        content: data.evidence,
        submitterNpub: data.submitterNpub,
        submitterPubkey,
        targetNpub: data.targetNpub,
        targetPubkey,
        metadata: {
          ip,
          userAgent,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      messageId: message.id,
      message: "Report submitted successfully. Admins will review it shortly.",
    });
  } catch (error) {
    console.error("Blacklist report error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to submit report" },
      { status: 500 }
    );
  }
}
