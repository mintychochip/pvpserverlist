/**
 * GuildPost Authentication & 2FA System
 * Uses Supabase Auth + TOTP for two-factor authentication
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  totp_enabled: boolean;
  totp_verified_at?: string;
  preferred_locale: string;
  last_login_at?: string;
  created_at: string;
}

export interface LoginAttempt {
  success: boolean;
  requires2FA?: boolean;
  tempToken?: string;
  error?: string;
  user?: UserProfile;
}

export interface TOTPSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

/**
 * Register a new user
 */
export async function register(email: string, password: string, username?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username || email.split('@')[0],
        }
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Login with email/password (Step 1)
 * Returns temp token if 2FA is required
 */
export async function login(email: string, password: string): Promise<LoginAttempt> {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: 'No user returned' };
    }

    // Check if 2FA is enabled
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('totp_enabled, email, username, display_name, avatar_url, preferred_locale, last_login_at')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      // Profile might not exist yet, create basic response
      return {
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email!,
          totp_enabled: false,
          preferred_locale: 'en',
          created_at: authData.user.created_at,
        }
      };
    }

    // If 2FA is enabled, require TOTP verification
    if (profile?.totp_enabled) {
      // Create a temporary session that requires 2FA completion
      const { data: tempSession, error: tempError } = await supabase
        .rpc('create_2fa_temp_session', {
          user_id: authData.user.id,
          session_token: authData.session?.access_token
        });

      if (tempError) {
        // Fallback: sign out and require 2FA
        await supabase.auth.signOut();
        return {
          success: false,
          requires2FA: true,
          tempToken: authData.session?.access_token,
          user: {
            id: authData.user.id,
            email: profile.email,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            totp_enabled: true,
            preferred_locale: profile.preferred_locale,
            last_login_at: profile.last_login_at,
            created_at: authData.user.created_at,
          }
        };
      }

      return {
        success: false,
        requires2FA: true,
        tempToken: tempSession?.temp_token,
        user: {
          id: authData.user.id,
          email: profile.email,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          totp_enabled: true,
          preferred_locale: profile.preferred_locale,
          last_login_at: profile.last_login_at,
          created_at: authData.user.created_at,
        }
      };
    }

    // No 2FA required, login complete
    return {
      success: true,
      user: {
        id: authData.user.id,
        email: profile?.email || authData.user.email!,
        username: profile?.username,
        display_name: profile?.display_name,
        avatar_url: profile?.avatar_url,
        totp_enabled: false,
        preferred_locale: profile?.preferred_locale || 'en',
        last_login_at: new Date().toISOString(),
        created_at: authData.user.created_at,
      }
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Verify TOTP code (Step 2 of 2FA login)
 */
export async function verifyTOTP(tempToken: string, totpCode: string): Promise<LoginAttempt> {
  try {
    const { data, error } = await supabase
      .rpc('verify_totp_and_complete_login', {
        temp_token: tempToken,
        totp_code: totpCode
      });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Invalid TOTP code' };
    }

    return {
      success: true,
      user: data.user
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Verify backup code (alternative to TOTP)
 */
export async function verifyBackupCode(tempToken: string, backupCode: string): Promise<LoginAttempt> {
  try {
    const { data, error } = await supabase
      .rpc('verify_backup_code_and_complete_login', {
        temp_token: tempToken,
        backup_code: backupCode
      });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Invalid backup code' };
    }

    return {
      success: true,
      user: data.user
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Setup TOTP 2FA for user
 */
export async function setupTOTP(): Promise<{ success: boolean; setup?: TOTPSetup; error?: string }> {
  try {
    const { data, error } = await supabase
      .rpc('setup_totp');

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      setup: {
        secret: data.secret,
        qrCodeUrl: data.qr_code_url,
        backupCodes: data.backup_codes
      }
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Verify and enable TOTP after setup
 */
export async function enableTOTP(verificationCode: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .rpc('verify_and_enable_totp', {
        verification_code: verificationCode
      });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Invalid verification code' };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Disable TOTP 2FA
 */
export async function disableTOTP(password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .rpc('disable_totp', {
        password: password
      });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to disable 2FA' };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get current user session
 */
export async function getCurrentUser(): Promise<{ user: UserProfile | null; error?: string }> {
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return { user: null };
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profileError) {
      // Return basic user info from auth
      return {
        user: {
          id: authUser.id,
          email: authUser.email!,
          totp_enabled: false,
          preferred_locale: 'en',
          created_at: authUser.created_at,
        }
      };
    }

    return { user: profile as UserProfile };
  } catch (err) {
    return { user: null, error: (err as Error).message };
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Update user profile
 */
export async function updateProfile(updates: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', (await supabase.auth.getUser()).data.user?.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get login history for current user
 */
export async function getLoginHistory(limit: number = 10): Promise<{ history: any[]; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { history: [], error: 'Not authenticated' };
    }

    const { data, error } = await supabase
      .from('login_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { history: [], error: error.message };
    }

    return { history: data || [] };
  } catch (err) {
    return { history: [], error: (err as Error).message };
  }
}

// ===============================
// PASSWORD RESET
// ===============================

/**
 * Request password reset email
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    // Use Supabase Auth's built-in password reset
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      return { success: false, message: '', error: error.message };
    }

    return { 
      success: true, 
      message: 'If an account exists with this email, you will receive password reset instructions.'
    };
  } catch (err) {
    return { success: false, message: '', error: (err as Error).message };
  }
}

/**
 * Reset password with token from email
 */
export async function resetPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ===============================
// SESSION MANAGEMENT
// ===============================

export interface UserSession {
  session_id: string;
  device_name: string;
  device_type: string;
  browser: string;
  os: string;
  location: string;
  is_current: boolean;
  last_active_at: string;
  created_at: string;
}

/**
 * Get all active sessions for current user
 */
export async function getUserSessions(): Promise<{ sessions: UserSession[]; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('get_user_sessions');

    if (error) {
      return { sessions: [], error: error.message };
    }

    return { sessions: data || [] };
  } catch (err) {
    return { sessions: [], error: (err as Error).message };
  }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('revoke_session', {
      p_session_id: sessionId
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: data || false };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Revoke all other sessions (keep only current)
 */
export async function revokeAllOtherSessions(): Promise<{ count: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('revoke_all_other_sessions');

    if (error) {
      return { count: 0, error: error.message };
    }

    return { count: data || 0 };
  } catch (err) {
    return { count: 0, error: (err as Error).message };
  }
}

/**
 * Change password (requires current password)
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    // First verify current password by attempting login
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return { success: false, error: 'Not authenticated' };
    }

    // Try to sign in with current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Update to new password
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}