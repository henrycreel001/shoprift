/**
 * web/src/lib/shopify-session.ts — Supabase-backed session storage for Shopify OAuth.
 * Implements the SessionStorage interface from @shopify/shopify-api.
 * Table: shopify_sessions (see SQL in T3 setup notes / DEVLOG.md)
 */

import { Session } from '@shopify/shopify-api';
import { createServerSupabaseClient } from './supabase';

type SessionRow = {
  id: string;
  shop: string;
  state: string | null;
  is_online: boolean;
  scope: string | null;
  expires_at: string | null;
  access_token: string | null;
};

function rowToSession(row: SessionRow): Session {
  const session = new Session({
    id: row.id,
    shop: row.shop,
    state: row.state ?? '',
    isOnline: row.is_online,
  });
  if (row.scope) session.scope = row.scope;
  if (row.expires_at) session.expires = new Date(row.expires_at);
  if (row.access_token) session.accessToken = row.access_token;
  return session;
}

export class SupabaseSessionStorage {
  /**
   * Upserts a session. Called by shopify.auth.callback() after token exchange.
   */
  async storeSession(session: Session): Promise<boolean> {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('shopify_sessions').upsert({
      id: session.id,
      shop: session.shop,
      state: session.state ?? null,
      is_online: session.isOnline,
      scope: session.scope ?? null,
      expires_at: session.expires?.toISOString() ?? null,
      access_token: session.accessToken ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('[session] storeSession error:', error.message);
    return !error;
  }

  /**
   * Loads a session by ID. Used by shopify to verify an existing install.
   */
  async loadSession(id: string): Promise<Session | undefined> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('shopify_sessions')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return undefined;
    return rowToSession(data as SessionRow);
  }

  /**
   * Deletes a single session. Used during re-auth.
   */
  async deleteSession(id: string): Promise<boolean> {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('shopify_sessions')
      .delete()
      .eq('id', id);
    return !error;
  }

  /**
   * Deletes multiple sessions. Called on app uninstall.
   */
  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('shopify_sessions')
      .delete()
      .in('id', ids);
    return !error;
  }

  /**
   * Returns all sessions for a shop. Used for cleanup on uninstall.
   */
  async findSessionsByShop(shop: string): Promise<Session[]> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('shopify_sessions')
      .select('*')
      .eq('shop', shop);
    if (error || !data) return [];
    return (data as SessionRow[]).map(rowToSession);
  }
}
