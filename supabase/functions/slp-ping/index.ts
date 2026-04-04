// supabase/functions/slp-ping/index.ts

interface SlpResponse {
  status: boolean;
  latency_ms: number | null;
  player_count: number;
  max_players: number;
  motd: string;
  version: string;
  error?: string;
}

const PROTOCOL_VERSION = 47; // 1.8 protocol, works across all versions
const TIMEOUT_MS = 3000;

function buildHandshakePacket(protocolVersion: number, serverAddress: string, serverPort: number): Uint8Array {
  const addressBytes = new TextEncoder().encode(serverAddress);
  // Packet: packet_id (1 byte) + protocol_version (varint) + address (string) + port (2 bytes) + state (varint)
  // State 1 = status
  const packet = new Uint8Array(1 + varintLength(protocolVersion) + addressBytes.length + 1 + 2 + varintLength(1));
  let offset = 0;
  packet[offset++] = 0x00; // Handshake packet ID
  offset = writeVarint(packet, offset, protocolVersion);
  offset = writeString(packet, offset, serverAddress);
  packet[offset++] = serverPort & 0xFF;
  packet[offset++] = (serverPort >> 8) & 0xFF;
  offset = writeVarint(packet, offset, 1); // Status state
  return packet;
}

function buildRequestPacket(): Uint8Array {
  return new Uint8Array([0xFE]); // Status request
}

function writeVarint(buf: Uint8Array, offset: number, value: number): number {
  while (value > 0x7F) {
    buf[offset++] = (value & 0x7F) | 0x80;
    value >>= 7;
  }
  buf[offset++] = value & 0x7F;
  return offset;
}

function writeString(buf: Uint8Array, offset: number, str: string): number {
  const bytes = new TextEncoder().encode(str);
  offset = writeVarint(buf, offset, bytes.length);
  buf.set(bytes, offset);
  return offset + bytes.length;
}

function readVarint(data: Uint8Array, offset: number): { value: number; newOffset: number } {
  let result = 0;
  let shift = 0;
  while (true) {
    const b = data[offset++];
    result |= (b & 0x7F) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, newOffset: offset };
}

function varintLength(value: number): number {
  let len = 0;
  while (value > 0x7F) { len++; value >>= 7; }
  return len + 1;
}

async function pingServer(host: string, port: number): Promise<SlpResponse> {
  const start = Date.now();

  // Build packets
  const handshake = buildHandshakePacket(PROTOCOL_VERSION, host, port);
  const request = buildRequestPacket();

  // Send via Deno's UDP
  const conn = await Deno.connect({ port, hostname: host, transport: "udp" });

  try {
    // Set read timeout
    const timeoutId = setTimeout(() => {
      conn.close();
    }, TIMEOUT_MS);

    // Send handshake then request
    await conn.send(handshake);
    await conn.send(request);

    // Read response
    const buf = new Uint8Array(1024);
    const { size } = await conn.read(buf);

    clearTimeout(timeoutId);

    const latency_ms = Date.now() - start;

    if (size === 0 || buf[0] !== 0xFF) {
      // Not a valid SLP response
      return { status: false, latency_ms: null, player_count: 0, max_players: 0, motd: "", version: "", error: "Invalid response" };
    }

    // Parse SLP response: 0xFF + string16 (JSON data)
    // Skip the 0xFF prefix, read string length (2 bytes big-endian), then JSON
    const stringLen = (buf[1] << 8) | buf[2];
    const jsonBytes = buf.slice(3, 3 + stringLen);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    const data = JSON.parse(jsonStr);

    return {
      status: true,
      latency_ms,
      player_count: data.players?.online ?? 0,
      max_players: data.players?.max ?? 0,
      motd: data.description?.text ?? data.description ?? "",
      version: data.version?.name ?? "",
    };
  } finally {
    conn.close();
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const { ip, port } = await req.json();

  if (!ip) {
    return new Response(JSON.stringify({ error: "ip required" }), { status: 400 });
  }

  const result = await pingServer(ip, port ?? 25565);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});