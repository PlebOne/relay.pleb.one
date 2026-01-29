import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";

const RESERVED_NAMES = ["admin", "root", "info", "support", "help", "abuse", "postmaster", "webmaster", "_"];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json(
      { names: {}, error: "Name parameter required" },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }

  const normalizedName = name.toLowerCase().trim();

  if (RESERVED_NAMES.includes(normalizedName)) {
    return NextResponse.json(
      { names: {} },
      {
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const user = await db.user.findFirst({
      where: {
        nip05Name: normalizedName,
        nip05Enabled: true,
      },
      select: {
        pubkey: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { names: {} },
        {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
          },
        }
      );
    }

    return NextResponse.json(
      {
        names: {
          [normalizedName]: user.pubkey,
        },
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error) {
    console.error("NIP-05 lookup error:", error);
    return NextResponse.json(
      { names: {}, error: "Internal server error" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
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
