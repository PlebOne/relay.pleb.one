import NextAuth from "next-auth";
import { authOptions } from "@/server/auth";

// @ts-expect-error - NextAuth types don't perfectly match Next.js 15 App Router
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
