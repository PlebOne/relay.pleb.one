import { NextResponse } from "next/server";
import { z } from "zod";
import { nip19 } from "nostr-tools";

import { db } from "@/server/db";

const inviteSchema = z.object({
  npub: z.string().min(10, "npub is required"),
  displayName: z.string().min(2).max(80).optional(),
  message: z.string().min(25).max(1200),
  contact: z.string().max(200).optional(),
  referral: z.string().max(200).optional(),
  client: z.string().max(120).optional(),
});

function decodeNpub(npub: string): string {
  const value = npub.trim();
  if (!value) {
    throw new Error("npub required");
  }

  const decoded = nip19.decode(value);
  if (decoded.type !== "npub") {
    throw new Error("Invalid npub");
  }

  const data = decoded.data;
  return typeof data === "string" ? data : Buffer.from(data).toString("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Received request body:", JSON.stringify(body, null, 2));
    
    const data = inviteSchema.parse(body);

    let targetPubkey: string;
    try {
      targetPubkey = decodeNpub(data.npub);
    } catch (error) {
      console.error("Npub decode error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid npub" },
        { status: 400 },
      );
    }

    // Check if user is already whitelisted
    const existingUser = await db.user.findUnique({
      where: { pubkey: targetPubkey },
    });

    if (existingUser?.whitelistStatus === "ACTIVE") {
      return NextResponse.json({
        success: true,
        alreadyWhitelisted: true,
        message: "You are already whitelisted.",
      });
    }

    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    const contentSections = [
      data.displayName ? `Display name: ${data.displayName}` : null,
      data.contact ? `Contact: ${data.contact}` : null,
      data.client ? `Preferred client: ${data.client}` : null,
      data.referral ? `Referral/Introduced by: ${data.referral}` : null,
      `Application:
${data.message.trim()}`,
    ].filter(Boolean);

    const messageRecord = await db.adminMessage.create({
      data: {
        type: "WHITELIST_REQUEST",
        status: "PENDING",
        subject: `${data.displayName ?? data.npub} requested access`,
        content: contentSections.join("\n\n"),
        submitterNpub: data.npub,
        submitterPubkey: targetPubkey,
        targetNpub: data.npub,
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
      messageId: messageRecord.id,
      message: "Request received. Admins will reach out once reviewed.",
    });
  } catch (error) {
    console.error("Whitelist request error:", error);

    if (error instanceof z.ZodError) {
      console.error("Validation errors:", JSON.stringify(error.errors, null, 2));
      return NextResponse.json(
        { 
          error: "Invalid request data", 
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }
}
