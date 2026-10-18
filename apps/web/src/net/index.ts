/**
 * Точка входа сетевого слоя. UI вызывает createBackend() один раз при старте.
 * Есть VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY → Supabase, иначе — гостевой режим (local).
 */
import { createClient } from '@supabase/supabase-js';
import type { Backend } from './types';
import { createLocalBackend } from './local';
import { createSupabaseBackend } from './supabase';
import { browserStorage } from './storage';

export type * from './types';
export { BackendNotConfiguredError, AuthRequiredError, NetworkError, BackendError, LocalProfileError } from './errors';
export { StorageWriteError, type KeyValueStorage } from './storage';
export { defaultProfile, mergeProfiles } from './profile';

export interface BackendEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

function readEnv(): BackendEnv {
  const env = (import.meta as { env?: Record<string, unknown> }).env ?? {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return { VITE_SUPABASE_URL: str(env.VITE_SUPABASE_URL), VITE_SUPABASE_ANON_KEY: str(env.VITE_SUPABASE_ANON_KEY) };
}

export function createBackend(env: BackendEnv = readEnv()): Backend {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const storage = browserStorage();
  if (!url || !anonKey) return createLocalBackend({ storage });
  try {
    new URL(url);
  } catch {
    console.warn('[net] VITE_SUPABASE_URL некорректен, включён гостевой режим');
    return createLocalBackend({ storage });
  }
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // magic link и OAuth возвращают токены в URL; PKCE — код в ?code=
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return createSupabaseBackend({ client, storage });
}
