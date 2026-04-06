// Minecraft Server Status Pinger
// Periodically checks server status and updates database
// Can be triggered by cron job or called manually

import { createClient } from 'npm:@supabase/supabase-js';
import * as net from 'node:net';
import { Buffer } from 'node:buffer';

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

// Create Minecraft packets
function createHandshakePacket(host: string, port: number, protocol: number = 760): Buffer {
  const hostBytes = Buffer.from(host, 'utf8');
  
  let size = 1;
  size += varintSize(protocol);
  size += varintSize(hostBytes.length) + hostBytes.length;
  size += 2;
  size += 1;
  
  const packet = Buffer.alloc(size);
  let offset = 0;
  
  offset = writeVarint(packet, 0x00, offset);
  offset = writeVarint(packet, protocol, offset);
  offset = writeVarint(packet, hostBytes.length, offset);
  hostBytes.copy(packet, offset);
  offset += hostBytes.length;
  packet.writeUInt16BE(port, offset);
  offset += 2;
  offset = writeVarint(packet, 1, offset);
  
  const lengthBuf = Buffer.alloc(varintSize(packet.length));
  writeVarint(lengthBuf, packet.length, 0);
  
  return Buffer.concat([lengthBuf, packet]);
}

function createStatusRequestPacket(): Buffer {
  const packet = Buffer.from([0x00]);
  const lengthBuf = Buffer.alloc(varintSize(1));
  writeVarint(lengthBuf, 1, 0);
  return Buffer.concat([lengthBuf, packet]);
}

// Ping a single server
async function pingServer(ip: string, port: number, timeout: number = 5000): Promise<any> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;
    
    const socket = new net.Socket();
    let receivedData = Buffer.alloc(0);
    
    socket.setTimeout(timeout);
    
    const resolveOnce = (result: any) => {
      if (!resolved) {
        resolved = true;
        try { socket.destroy(); } catch (e) {}
        resolve(result);
      }
    };
    
    socket.on('connect', () => {
      socket.write(createHandshakePacket(ip, port));
      socket.write(createStatusRequestPacket());
    });
    
    socket.on('data', (data) => {
      receivedData = Buffer.concat([receivedData, data]);
      
      try {
        if (receivedData.length > 5) {
          const { value: packetLength, newOffset: afterLength } = readVarint(receivedData, 0);
          
          if (receivedData.length >= afterLength + packetLength) {
            const packetData = receivedData.slice(afterLength, afterLength + packetLength);
            const packetId = packetData[0];
            
            if (packetId === 0x00) {
              const { value: jsonString } = readString(packetData, 1);
              const response = JSON.parse(jsonString);
              
              resolveOnce({
                online: true,
                players_online: response.players?.online || 0,
                max_players: response.players?.max || 0,
                version: response.version?.name,
                motd: typeof response.description === 'string' 
                  ? response.description 
                  : response.description?.text,
                ping_ms: Date.now() - startTime,
                error: null
              });
            }
          }
        }
      } catch (err) {
        resolveOnce({
          online: true,
          error: 'Parse error: ' + (err as Error).message,
          ping_ms: Date.now() - startTime
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
        error: 'Timeout'
      });
    });
    
    socket.on('close', () => {
      if (!resolved) {
        resolveOnce({
          online: false,
          error: 'Connection closed'
        });
      }
    });
    
    socket.connect(port, ip);
  });
}

// Main handler
export async function pingServers(request: Request): Promise<Response> {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get servers to ping (limit to avoid timeouts)
    const { data: servers, error: fetchError } = await supabase
      .from('servers')
      .select('id, ip, port, last_ping_at')
      .order('last_ping_at', { ascending: true, nullsFirst: true })
      .limit(100); // Ping 100 servers per invocation
    
    if (fetchError) throw fetchError;
    if (!servers || servers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No servers to ping' }),
        { headers }
      );
    }
    
    // Ping all servers concurrently
    const results = await Promise.all(
      servers.map(async (server) => {
        const status = await pingServer(server.ip, server.port || 25565, 3000);
        
        return {
          id: server.id,
          ...status,
          checked_at: new Date().toISOString()
        };
      })
    );
    
    // Update database
    const updates = results.map(result => ({
      id: result.id,
      status: result.online ? 'online' : 'offline',
      players_online: result.players_online || 0,
      max_players: result.max_players || 0,
      version: result.version,
      ping_ms: result.ping_ms,
      last_error: result.error,
      last_ping_at: result.checked_at
    }));
    
    // Batch update servers
    const { error: updateError } = await supabase
      .from('servers')
      .upsert(updates, { onConflict: 'id' });
    
    if (updateError) {
      console.error('Failed to update servers:', updateError);
    }
    
    // Store ping history for analytics (only store every 3rd ping to save space)
    // 288 runs/day ÷ 3 = 96 history entries per server per day
    const historyRecords = results
      .filter(r => r.online) // Only store successful pings
      .map(r => ({
        server_id: r.id,
        status: r.online ? 'online' : 'offline',
        players_online: r.players_online || 0,
        max_players: r.max_players || 0,
        ping_ms: r.ping_ms,
        error: r.error,
        created_at: r.checked_at
      }));
    
    if (historyRecords.length > 0) {
      const { error: historyError } = await supabase
        .from('server_ping_history')
        .insert(historyRecords);
      
      if (historyError) {
        console.error('Failed to store history:', historyError);
      } else {
        console.log(`Stored ${historyRecords.length} history records`);
      }
    }
    
    // Log results
    const online = results.filter(r => r.online).length;
    const offline = results.filter(r => !r.online).length;
    
    console.log(`Pinged ${results.length} servers: ${online} online, ${offline} offline`);
    
    return new Response(
      JSON.stringify({
        success: true,
        pinged: results.length,
        online,
        offline,
        results: results.map(r => ({ id: r.id, online: r.online, error: r.error }))
      }),
      { headers }
    );
    
  } catch (err) {
    console.error('Ping error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers, status: 500 }
    );
  }
}

// Deno serve
if (typeof Deno !== 'undefined') {
  Deno.serve(pingServers);
}
