import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const POST: APIRoute = async ({ params, request }) => {
  const { id: serverId } = params;
  
  // Validate server ID
  if (!serverId) {
    return new Response(
      JSON.stringify({ error: 'Server ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHV0c2RiaWFtcG54ZmdrandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM1MTAwNCwiZXhwIjoyMDkwOTI3MDA0fQ.35hrTSgxQnICpLOY3g6W3eNxxe7DKCc3q165tyb0Ieo';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHV0c2RiaWFtcG54ZmdrandxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTEwMDQsImV4cCI6MjA5MDkyNzAwNH0.35hrTSgxQnICpLOY3g6W3eNxxe7DKCc3q165tyb0Ieo';

  try {
    // Create Supabase client with service role for full access
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    // Get form data
    const formData = await request.formData();
    
    // Initialize response data
    const response: {
      banner?: string;
      icon?: string;
      screenshots: string[];
      video?: string;
    } = {
      screenshots: []
    };
    
    // Process banner if provided
    const bannerFile = formData.get('banner');
    if (bannerFile && bannerFile instanceof File) {
      // Validate file size (max 2MB)
      if (bannerFile.size > 2 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ error: 'Banner file too large. Max size is 2MB' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Validate file type
      const validBannerTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validBannerTypes.includes(bannerFile.type)) {
        return new Response(
          JSON.stringify({ error: 'Invalid banner file type. Must be jpeg, png, or webp' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Upload banner to storage
      const bannerPath = `servers/${serverId}/banner.${bannerFile.type.split('/')[1]}`;
      const { data: bannerData, error: bannerError } = await supabase
        .storage
        .from('server-media')
        .upload(bannerPath, bannerFile, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (bannerError) {
        return new Response(
          JSON.stringify({ error: `Banner upload failed: ${bannerError.message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Get public URL for the uploaded banner
      const { data: { publicUrl: bannerUrl } } = supabase
        .storage
        .from('server-media')
        .getPublicUrl(bannerPath);
      
      response.banner = bannerUrl;
    }
    
    // Process icon if provided
    const iconFile = formData.get('icon');
    if (iconFile && iconFile instanceof File) {
      // Validate file size (max 500KB)
      if (iconFile.size > 500 * 1024) {
        return new Response(
          JSON.stringify({ error: 'Icon file too large. Max size is 500KB' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Validate file type
      const validIconTypes = ['image/jpeg', 'image/png'];
      if (!validIconTypes.includes(iconFile.type)) {
        return new Response(
          JSON.stringify({ error: 'Invalid icon file type. Must be jpeg or png' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Upload icon to storage
      const iconPath = `servers/${serverId}/icon.${iconFile.type.split('/')[1]}`;
      const { data: iconData, error: iconError } = await supabase
        .storage
        .from('server-media')
        .upload(iconPath, iconFile, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (iconError) {
        return new Response(
          JSON.stringify({ error: `Icon upload failed: ${iconError.message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Get public URL for the uploaded icon
      const { data: { publicUrl: iconUrl } } = supabase
        .storage
        .from('server-media')
        .getPublicUrl(iconPath);
      
      response.icon = iconUrl;
    }
    
    // Process screenshots (screenshot_0 through screenshot_5)
    for (let i = 0; i < 6; i++) {
      const screenshotKey = `screenshot_${i}`;
      const screenshotFile = formData.get(screenshotKey);
      
      if (screenshotFile && screenshotFile instanceof File) {
        // Validate file size (max 3MB)
        if (screenshotFile.size > 3 * 1024 * 1024) {
          return new Response(
            JSON.stringify({ error: `Screenshot ${i} too large. Max size is 3MB` }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        // Validate file type
        const validScreenshotTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validScreenshotTypes.includes(screenshotFile.type)) {
          return new Response(
            JSON.stringify({ error: `Invalid screenshot ${i} file type. Must be jpeg, png, or webp` }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        // Upload screenshot to storage
        const screenshotPath = `servers/${serverId}/screenshots/${i}.${screenshotFile.type.split('/')[1]}`;
        const { data: screenshotData, error: screenshotError } = await supabase
          .storage
          .from('server-media')
          .upload(screenshotPath, screenshotFile, {
            cacheControl: '3600',
            upsert: true
          });
        
        if (screenshotError) {
          return new Response(
            JSON.stringify({ error: `Screenshot ${i} upload failed: ${screenshotError.message}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        // Get public URL for the uploaded screenshot
        const { data: { publicUrl: screenshotUrl } } = supabase
          .storage
          .from('server-media')
          .getPublicUrl(screenshotPath);
        
        response.screenshots.push(screenshotUrl);
      }
    }
    
    // Process video URL if provided
    const videoUrl = formData.get('video');
    if (videoUrl && typeof videoUrl === 'string') {
      // Basic YouTube URL validation
      if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        response.video = videoUrl;
      }
    }
    
    // Update servers table with media URLs
    if (Object.keys(response).length > 0 || response.screenshots.length > 0) {
      const { data, error } = await supabase
        .from('servers')
        .update({
          banner_url: response.banner || null,
          icon_url: response.icon || null,
          screenshots: response.screenshots.length > 0 ? response.screenshots : null,
          video_url: response.video || null
        })
        .eq('id', serverId);
      
      if (error) {
        console.error('Database update error:', error);
      }
    }
    
    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        urls: response
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
  } catch (err) {
    console.error('Server media upload error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to upload server media' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// Handle preflight requests
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Progress',
    },
    status: 200
  });
};