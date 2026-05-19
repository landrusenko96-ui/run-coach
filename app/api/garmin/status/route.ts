import { NextResponse } from "next/server";
import { getGarminBridgeStatus } from "@/lib/garminBridge/client";

export async function GET() {
  const result = await getGarminBridgeStatus();

  return NextResponse.json(result, { status: 200 });
}
