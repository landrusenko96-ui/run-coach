import { NextResponse } from "next/server";
import { testSupabaseConnection } from "@/lib/db/testSupabaseConnection";

export async function GET() {
  const result = await testSupabaseConnection();
  const status = result.ok ? 200 : 500;

  return NextResponse.json(result, { status });
}
