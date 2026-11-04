import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function roomNameFor(streamToken: string) {
  return `facetime-${createHash("sha256").update(streamToken).digest("hex")}`;
}

export async function GET(request: NextRequest) {
  const streamToken = request.nextUrl.searchParams.get("token") || "";
  if (!/^[a-f0-9]{64}$/i.test(streamToken)) {
    return NextResponse.json({ error: "This OBS link is invalid." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const serverUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!serverUrl || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "The live output is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const expectedToken = createHmac("sha256", apiSecret).update("facetime-permanent-obs-output-v1").digest();
    const suppliedToken = Buffer.from(streamToken, "hex");
    if (suppliedToken.length !== expectedToken.length || !timingSafeEqual(expectedToken, suppliedToken)) {
      return NextResponse.json({ error: "This OBS link is invalid." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const roomName = roomNameFor(streamToken);

    const viewer = new AccessToken(apiKey, apiSecret, {
      identity: `obs-${randomBytes(8).toString("hex")}`,
      ttl: "90s",
    });
    viewer.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: false,
      canSubscribe: true,
    });

    return NextResponse.json({
      serverUrl,
      participantToken: await viewer.toJwt(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not connect to the live output." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
