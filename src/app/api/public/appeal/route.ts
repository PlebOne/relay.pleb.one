import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nip19 } from "nostr-tools";

import { db } from "@/server/db";

const appealSchema = z.object({
  npub: z.string().min(10),
  subject: z.string().min(3).max(200),
  content: z.string().min(10).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = appealSchema.parse(body);

    // Decode npub to pubkey
    let pubkey: string;
    try {
      const decoded = nip19.decode(validated.npub.trim());
      if (decoded.type !== "npub") {
        return NextResponse.json({ error: "Invalid npub format" }, { status: 400 });
      }
      const data = decoded.data;
      pubkey = typeof data === "string" ? data : Buffer.from(data).toString("hex");
    } catch (error) {
      return NextResponse.json({ error: "Failed to decode npub" }, { status: 400 });
    }

    // Create the appeal message
    await db.adminMessage.create({
      data: {
        type: "APPEAL",
        status: "PENDING",
        subject: validated.subject,
        content: validated.content,
        submitterNpub: validated.npub,
        submitterPubkey: pubkey,
        metadata: {
          submittedAt: new Date().toISOString(),
          userAgent: request.headers.get("user-agent") ?? undefined,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Appeal submitted successfully",
    });
  } catch (error) {
    console.error("Appeal submission error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid form data", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to submit appeal" },
      { status: 500 }
    );
  }
}
