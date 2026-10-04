/**
 * /api/macos-helper - the native macOS Wi-Fi helper (native/macos-wifi-helper)
 *
 * GET   is it built and working, and may it see network names (Location)?
 * POST  { "action": "authorize" } - show the macOS Location prompt for
 *       "WiFi Heatmapper Helper" and wait (up to a minute) for the answer.
 *       If access was refused before, opens System Settings instead.
 *
 * On other platforms and in mock mode the helper is never available.
 */
import { NextResponse } from "next/server";
import { isMockMode } from "@/lib/app-info";
import { getMacosHelperState, requestLocationAccess } from "@/lib/macos-helper";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isMockMode()) {
    return NextResponse.json({ available: false, path: null });
  }
  return NextResponse.json(await getMacosHelperState());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body?.action !== "authorize") {
    return NextResponse.json(
      { error: 'Expected { "action": "authorize" }' },
      { status: 400 },
    );
  }
  if (isMockMode()) {
    return NextResponse.json(
      { error: "Mock mode does not use the Wi-Fi helper." },
      { status: 409 },
    );
  }
  try {
    return NextResponse.json(await requestLocationAccess());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
