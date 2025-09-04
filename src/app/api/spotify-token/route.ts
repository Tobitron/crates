import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";

type SessionWithToken = Session & { accessToken?: string };

export async function GET() {
  const session = (await getServerSession(authOptions)) as SessionWithToken | null;
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ access_token: session.accessToken });
}

