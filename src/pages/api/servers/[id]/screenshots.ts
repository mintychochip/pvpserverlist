/**
 * Server Screenshots API
 * GET /api/servers/[id]/screenshots - List all screenshots for a server
 * POST /api/servers/[id]/screenshots - Upload new screenshots
 * DELETE /api/servers/[id]/screenshots - Delete a screenshot
 */

import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const supabaseUrl = 'https://wpxutsdbiampnxfgkjwq.supabase.co';

// R2 Upload configuration
interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

// Get R2 config from environment
function getR2Config(env: any): R2Config | null {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    return null;
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
  };
}

// Crypto helpers for R2 signature
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(
    await crypto.subtle.importKey('raw', new TextEncoder().encode('AWS4' + secretKey), 'HMAC', false, ['sign']),
    dateStamp
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

// Upload file to R2
async function uploadToR2(
  file: File,
  key: string,
  config: R2Config
): Promise<{ url: string; size: number; contentType: string }> {
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  
  // Generate S3-compatible signature
  const date = new Date().toISOString().replace(/[:\-]|\.[0-9]{3}/g, '');
  const dateStamp = date.substr(0, 8);
  const region = 'auto';
  const service = 's3';
  
  // Build canonical request
  const canonicalUri = `/${config.bucketName}/${key}`;
  const canonicalQuerystring = '';
  const canonicalHeaders = `host:${config.accountId}.r2.cloudflarestorage.com\n` +
                         `x-amz-content-sha256:UNSIGNED-PAYLOAD\n` +
                         `x-amz-date:${date}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  
  const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  // Create string to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n` +
                      await sha256(canonicalRequest);
  
  // Calculate signature
  const signingKey = await getSigningKey(config.secretAccessKey, dateStamp, region, service);
  const signature = await hmacSha256(signingKey, stringToSign);
  
  // Build authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  // Upload
  const response = await fetch(`${endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'Authorization': authorization,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': date,
      'Content-Type': file.type,
      'Content-Length': file.size.toString(),
    },
    body: file,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`R2 upload failed: ${response.status} - ${error}`);
  }

  // Return public URL
  const publicUrl = config.bucketName 
    ? `https://guildpost.s3.${config.accountId}.r2.cloudflarestorage.com/${key}`
    : `${endpoint}/${config.bucketName}/${key}`;
    
  return { url: publicUrl, size: file.size, contentType: file.type };
}

// Delete file from R2
async function deleteFromR2(
  key: string,
  config: R2Config
): Promise<void> {
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  
  // Generate S3-compatible signature
  const date = new Date().toISOString().replace(/[:\-]|\.[0-9]{3}/g, '');
  const dateStamp = date.substr(0, 8);
  const region = 'auto';
  const service = 's3';
  
  // Build canonical request
  const canonicalUri = `/${config.bucketName}/${key}`;
  const canonicalQuerystring = '';
  const canonicalHeaders = `host:${config.accountId}.r2.cloudflarestorage.com\n` +
                         `x-amz-content-sha256:UNSIGNED-PAYLOAD\n` +
                         `x-amz-date:${date}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  
  const canonicalRequest = `DELETE\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  // Create string to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n` +
                      await sha256(canonicalRequest);
  
  // Calculate signature
  const signingKey = await getSigningKey(config.secretAccessKey, dateStamp, region, service);
  const signature = await hmacSha256(signingKey, stringToSign);
  
  // Build authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  // Delete
  const response = await fetch(`${endpoint}${canonicalUri}`, {
    method: 'DELETE',
    headers: {
      'Authorization': authorization,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': date,
    },
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`R2 delete failed: ${response.status} - ${error}`);
  }
}

// Validate image file
function validateImage(file: File): { valid: boolean; error?: string } {
  const maxSize = 5 * 1024 * 1024; // 5MB max for screenshots
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `Invalid file type. Allowed: JPG, PNG, WebP, GIF` };
  }
  
  if (file.size > maxSize) {
    return { valid: false, error: `File too large. Max: 5MB` };
  }
  
  return { valid: true };
}

// GET - List screenshots for a server
export const GET: APIRoute = async ({ params, locals }) => {
  const { id: serverId } = params;
  const env = (locals as any)?.runtime?.env || {};
  
  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
    if (!supabaseKey) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/server_screenshots?server_id=eq.${serverId}&order=sort_order.asc,uploaded_at.desc`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Database error: ${error}`);
    }

    const screenshots = await response.json();

    return new Response(JSON.stringify({ 
      success: true, 
      screenshots,
      count: screenshots.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Screenshots GET error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch screenshots' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST - Upload screenshots
export const POST: APIRoute = async ({ request, params, locals }) => {
  const { id: serverId } = params;
  const env = (locals as any)?.runtime?.env || {};
  
  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const r2Config = getR2Config(env);
  if (!r2Config) {
    return new Response(JSON.stringify({ error: 'R2 storage not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const formData = await request.formData();
    const uploadedScreenshots: any[] = [];
    const errors: string[] = [];
    
    // Get captions if provided
    const captions: string[] = [];
    for (let i = 0; i < 10; i++) {
      const caption = formData.get(`caption_${i}`) as string | null;
      captions.push(caption || '');
    }

    // Process uploaded files
    const files: File[] = [];
    formData.forEach((value, key) => {
      if (key.startsWith('screenshot_') && value instanceof File && value.size > 0) {
        files.push(value);
      }
    });

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: 'No files uploaded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate and upload each file
    for (let i = 0; i < Math.min(files.length, 10); i++) {
      const file = files[i];
      const validation = validateImage(file);
      
      if (!validation.valid) {
        errors.push(`File ${i + 1}: ${validation.error}`);
        continue;
      }

      // Generate unique key
      const ext = file.name.split('.').pop() || 'jpg';
      const key = `servers/${serverId}/screenshots/${Date.now()}_${i}.${ext}`;
      
      try {
        const result = await uploadToR2(file, key, r2Config);
        
        uploadedScreenshots.push({
          url: result.url,
          file_size: result.size,
          file_type: result.contentType,
          caption: captions[i] || null,
          sort_order: i
        });
      } catch (uploadErr: any) {
        errors.push(`File ${i + 1}: Upload failed - ${uploadErr.message}`);
      }
    }

    if (uploadedScreenshots.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'All uploads failed', 
        errors 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Store in database
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
    if (supabaseKey) {
      try {
        const dbRecords = uploadedScreenshots.map((screenshot, index) => ({
          server_id: serverId,
          url: screenshot.url,
          caption: screenshot.caption,
          file_size: screenshot.file_size,
          file_type: screenshot.file_type,
          sort_order: screenshot.sort_order,
          uploaded_at: new Date().toISOString()
        }));

        const dbResponse = await fetch(`${supabaseUrl}/rest/v1/server_screenshots`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(dbRecords)
        });

        if (!dbResponse.ok) {
          console.error('Failed to store screenshots in database:', await dbResponse.text());
          // Don't fail the upload if DB storage fails - files are still in R2
        } else {
          const savedRecords = await dbResponse.json();
          // Update IDs from database
          savedRecords.forEach((record: any, index: number) => {
            uploadedScreenshots[index].id = record.id;
          });
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      screenshots: uploadedScreenshots,
      count: uploadedScreenshots.length,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Screenshots POST error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Upload failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// DELETE - Delete a screenshot
export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const { id: serverId } = params;
  const env = (locals as any)?.runtime?.env || {};
  
  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { screenshot_id, url } = body;

    if (!screenshot_id && !url) {
      return new Response(JSON.stringify({ error: 'screenshot_id or url required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
    if (!supabaseKey) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Delete from database
    let deleteUrl: string | null = url || null;
    
    if (screenshot_id) {
      // First get the screenshot to find the URL
      const getResponse = await fetch(
        `${supabaseUrl}/rest/v1/server_screenshots?id=eq.${screenshot_id}&server_id=eq.${serverId}&select=*`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );

      if (getResponse.ok) {
        const records = await getResponse.json();
        if (records.length > 0) {
          deleteUrl = records[0].url;
        }
      }

      // Delete from database
      const dbResponse = await fetch(
        `${supabaseUrl}/rest/v1/server_screenshots?id=eq.${screenshot_id}&server_id=eq.${serverId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );

      if (!dbResponse.ok) {
        const error = await dbResponse.text();
        throw new Error(`Database delete failed: ${error}`);
      }
    }

    // Delete from R2 if URL is available
    if (deleteUrl) {
      const r2Config = getR2Config(env);
      if (r2Config) {
        try {
          // Extract key from URL
          const urlObj = new URL(deleteUrl);
          const key = urlObj.pathname.replace(/^\//, '');
          
          if (key) {
            await deleteFromR2(key, r2Config);
          }
        } catch (r2Err) {
          console.error('R2 delete error:', r2Err);
          // Continue even if R2 delete fails - DB record is already deleted
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Screenshot deleted successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Screenshots DELETE error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Delete failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};