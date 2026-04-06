// Minecraft Server Status Pinger
// Uses the Minecraft Server List Ping protocol
// https://wiki.vg/Server_List_Ping

import * as net from 'net';
import { Buffer } from 'buffer';

interface ServerStatus {
  online: boolean;
  players?: {
    online: number;
    max: number;
  };
  version?: string;
  motd?: string;
  favicon?: string;
  ping?: number; // Response time in ms
  error?: string;
}

// Create Minecraft handshake packet
function createHandshakePacket(host: string, port: number, protocol: number = 760): Buffer {
  // Packet ID (0x00)
  // Protocol version (varint)
  // Server address (string)
  // Server port (unsigned short)
  // Next state (1 for status)
  
  const hostBytes = Buffer.from(host, 'utf8');
  
  // Calculate packet size
  let size = 1; // Packet ID
  size += varintSize(protocol); // Protocol
  size += varintSize(hostBytes.length) + hostBytes.length; // Host
  size += 2; // Port (unsigned short)
  size += 1; // Next state
  
  const packet = Buffer.alloc(size);
  let offset = 0;
  
  // Write varints manually
  offset = writeVarint(packet, 0x00, offset); // Packet ID
  offset = writeVarint(packet, protocol, offset); // Protocol
  offset = writeVarint(packet, hostBytes.length, offset); // Host length
  hostBytes.copy(packet, offset);
  offset += hostBytes.length;
  packet.writeUInt16BE(port, offset); // Port
  offset += 2;
  offset = writeVarint(packet, 1, offset); // Next state (status)
  
  // Prepend length
  const lengthBuf = Buffer.alloc(varintSize(packet.length));
  writeVarint(lengthBuf, packet.length, 0);
  
  return Buffer.concat([lengthBuf, packet]);
}

// Create status request packet
function createStatusRequestPacket(): Buffer {
  const packet = Buffer.from([0x00]); // Packet ID 0x00, no payload
  const lengthBuf = Buffer.alloc(varintSize(1));
  writeVarint(lengthBuf, 1, 0);
  return Buffer.concat([lengthBuf, packet]);
}

// Create ping packet
function createPingPacket(timestamp: bigint): Buffer {
  const packet = Buffer.alloc(9);
  packet[0] = 0x01; // Packet ID
  packet.writeBigInt64BE(timestamp, 1);
  const lengthBuf = Buffer.alloc(varintSize(9));
  writeVarint(lengthBuf, 9, 0);
  return Buffer.concat([lengthBuf, packet]);
}

// Varint helper functions
function varintSize(value: number): number {
  let size = 0;
  do {
    size++;
    value >>>= 7;
  } while (value !== 0);
  return size;
}

function writeVarint(buffer: Buffer, value: number, offset: number): number {
  do {
    let byte = value & 0x7F;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    buffer[offset++] = byte;
  } while (value !== 0);
  return offset;
}

function readVarint(buffer: Buffer, offset: number): { value: number; newOffset: number } {
  let value = 0;
  let shift = 0;
  while (true) {
    if (offset >= buffer.length) throw new Error('Varint too long');
    const byte = buffer[offset++];
    value |= (byte & 0x7F) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift >= 32) throw new Error('Varint too large');
  }
  return { value, newOffset: offset };
}

function readString(buffer: Buffer, offset: number): { value: string; newOffset: number } {
  const { value: length, newOffset: afterLength } = readVarint(buffer, offset);
  const value = buffer.toString('utf8', afterLength, afterLength + length);
  return { value, newOffset: afterLength + length };
}

// Ping a Minecraft server
export async function pingServer(ip: string, port: number = 25565, timeout: number = 5000): Promise<ServerStatus> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;
    
    const socket = new net.Socket();
    let receivedData = Buffer.alloc(0);
    let state: 'handshake' | 'status' | 'ping' = 'handshake';
    
    socket.setTimeout(timeout);
    
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        try {
          socket.destroy();
        } catch (e) {}
      }
    };
    
    const resolveOnce = (status: ServerStatus) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(status);
      }
    };
    
    socket.on('connect', () => {
      // Send handshake
      const handshake = createHandshakePacket(ip, port);
      socket.write(handshake);
      
      // Send status request
      const statusReq = createStatusRequestPacket();
      socket.write(statusReq);
      state = 'status';
    });
    
    socket.on('data', (data) => {
      receivedData = Buffer.concat([receivedData, data]);
      
      try {
        // Try to parse the response
        if (state === 'status' && receivedData.length > 5) {
          // Read packet length
          const { value: packetLength, newOffset: afterLength } = readVarint(receivedData, 0);
          
          if (receivedData.length >= afterLength + packetLength) {
            // We have a complete packet
            const packetData = receivedData.slice(afterLength, afterLength + packetLength);
            
            // First byte is packet ID
            const packetId = packetData[0];
            
            if (packetId === 0x00) {
              // Status response
              const { value: jsonString } = readString(packetData, 1);
              const response = JSON.parse(jsonString);
              
              const ping = Date.now() - startTime;
              
              resolveOnce({
                online: true,
                players: response.players ? {
                  online: response.players.online || 0,
                  max: response.players.max || 0
                } : undefined,
                version: response.version?.name,
                motd: typeof response.description === 'string' 
                  ? response.description 
                  : response.description?.text,
                favicon: response.favicon,
                ping
              });
              
              // Send ping for accurate measurement
              const pingPacket = createPingPacket(BigInt(Date.now()));
              socket.write(pingPacket);
              state = 'ping';
            }
          }
        }
      } catch (err) {
        // Failed to parse, but server is responding
        resolveOnce({
          online: true,
          error: 'Failed to parse response: ' + (err as Error).message,
          ping: Date.now() - startTime
        });
      }
    });
    
    socket.on('error', (err) => {
      resolveOnce({
        online: false,
        error: err.message
      });
    });
    
    socket.on('timeout', () => {
      resolveOnce({
        online: false,
        error: 'Connection timeout'
      });
    });
    
    socket.on('close', () => {
      if (!resolved) {
        resolveOnce({
          online: false,
          error: 'Connection closed unexpectedly'
        });
      }
    });
    
    // Connect
    socket.connect(port, ip);
  });
}

// Batch ping multiple servers
export async function pingServersBatch(
  servers: { id: string; ip: string; port: number }[],
  concurrency: number = 10
): Promise<Map<string, ServerStatus>> {
  const results = new Map<string, ServerStatus>();
  
  // Process in batches
  for (let i = 0; i < servers.length; i += concurrency) {
    const batch = servers.slice(i, i + concurrency);
    const batchPromises = batch.map(async (server) => {
      const status = await pingServer(server.ip, server.port, 3000);
      results.set(server.id, status);
    });
    
    await Promise.all(batchPromises);
  }
  
  return results;
}

// For testing
if (import.meta.main) {
  // Test with a known server
  const testServers = [
    { ip: 'mc.hypixel.net', port: 25565 },
    { ip: 'play.mineclub.com', port: 25565 }
  ];
  
  for (const server of testServers) {
    console.log(`Pinging ${server.ip}:${server.port}...`);
    const status = await pingServer(server.ip, server.port);
    console.log('Status:', status);
    console.log('---');
  }
}
