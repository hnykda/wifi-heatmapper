import { NextRequest, NextResponse } from "next/server";
import { checkApiRequest } from "@/lib/request-guard";

// Refuse API requests from other web sites (see request-guard.ts)
export function proxy(request: NextRequest) {
  const reason = checkApiRequest(
    {
      method: request.method,
      host: request.headers.get("host"),
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    (process.env.WIFI_HEATMAPPER_ALLOWED_HOSTS ?? "")
      .split(",")
      .filter(Boolean),
  );
  if (reason) return NextResponse.json({ error: reason }, { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
