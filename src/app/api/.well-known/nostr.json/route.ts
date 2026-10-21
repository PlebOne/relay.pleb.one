import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { nip05DomainFromHeaders } from "@/lib/nip05-domains";

const RESERVED_NAMES = ["admin", "root", "info", "support", "help", "abuse", "postmaster", "webmaster", "_"];

const RELAY_URL = "wss://relay.pleb.one";

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function notFound() {
  return NextResponse.json({ names: {} }, { status: 404, headers: BASE_HEADERS });
}

export async function GET(request: NextRequest) {
  // Only answer on our NIP-05 domains; the address is name@<host>
  const domain = nip05DomainFromHeaders(request.headers);
  if (!domain) {
    return notFound();
  }

  const searchParams = request.nextUrl.searchParams;
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json(
      { names: {}, error: "Name parameter required" },
      { status: 400, headers: BASE_HEADERS }
    );
  }

  const normalizedName = name.toLowerCase().trim();

  if (RESERVED_NAMES.includes(normalizedName)) {
    return notFound();
  }

  try {
    const user = await db.user.findFirst({
      where: {
        nip05Name: normalizedName,
        nip05Domain: domain,
        nip05Enabled: true,
      },
      select: {
        pubkey: true,
      },
    });

    if (!user) {
      return notFound();
    }

    const pubkey = user.pubkey.toLowerCase();

    return NextResponse.json(
      {
        names: {
          [normalizedName]: pubkey,
        },
        relays: {
          [pubkey]: [RELAY_URL],
        },
      },
      {
        headers: {
          ...BASE_HEADERS,
          // Short cache so users who switch domains verify quickly
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  } catch (error) {
    console.error("NIP-05 lookup error:", error);
    return NextResponse.json(
      { names: {}, error: "Internal server error" },
      { status: 500, headers: BASE_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }
  );
}
