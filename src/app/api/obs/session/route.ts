import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AccessToken, LiveKitAPI } from "livekit-server-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getConfig() {
  const serverUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!serverUrl || !apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to your deployment environment.");
  }

  const apiHost = serverUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
  return { serverUrl, apiKey, apiSecret, api: new LiveKitAPI({ host: apiHost, apiKey, secret: apiSecret }) };
}

function roomNameFor(streamToken: string) {
  return `facetime-${createHash("sha256").update(streamToken).digest("hex")}`;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonError("Cross-origin requests are not allowed.", 403);
  }

  try {
    const { serverUrl, apiKey, apiSecret, api } = getConfig();
    const streamToken = randomBytes(32).toString("hex");
    const stopToken = createHmac("sha256", apiSecret).update(streamToken).digest("hex");
    const roomName = roomNameFor(streamToken);

    await api.room.createRoom({
      name: roomName,
      emptyTimeout: 30,
      maxParticipants: 2,
    });

    const publisher = new AccessToken(apiKey, apiSecret, {
      identity: `facetime-${randomBytes(8).toString("hex")}`,
      ttl: "6h",
    });
    publisher.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: false,
    });

    const participantToken = await publisher.toJwt();
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const appOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin;

    return NextResponse.json({
      streamToken,
      stopToken,
      streamUrl: `${appOrigin}/obs/${streamToken}`,
      serverUrl,
      participantToken,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the OBS stream.";
    return jsonError(message, message.includes("not configured") ? 503 : 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { apiSecret, api } = getConfig();
    const body = await request.json();
    const streamToken = typeof body.streamToken === "string" ? body.streamToken : "";
    const stopToken = typeof body.stopToken === "string" ? body.stopToken : "";

    if (!/^[a-f0-9]{64}$/i.test(streamToken) || !/^[a-f0-9]{64}$/i.test(stopToken)) {
      return jsonError("Invalid OBS session credentials.", 401);
    }

    const expected = createHmac("sha256", apiSecret).update(streamToken).digest();
    const supplied = Buffer.from(stopToken, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
      return jsonError("Invalid OBS session credentials.", 401);
    }

    await api.room.deleteRoom(roomNameFor(streamToken)).catch(() => undefined);
    return NextResponse.json({ stopped: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not stop the OBS stream.";
    return jsonError(message, 500);
  }
}
