/**
 * Edge Function submit-daily: приём результата ежедневного забега.
 *
 * 1. Проверяет JWT пользователя (auth.getUser на сервере Auth, не просто декодирование).
 * 2. Принимает только сегодняшний daily (UTC) или вчерашний в первые 2 часа.
 * 3. Пересчитывает забег через replay() движка; score/floor/victory — только из пересчёта.
 * 4. Пишет в daily_results через service role. Одна попытка на seed (unique в БД).
 *
 * Движок подключается бандлом: перед деплоем `node supabase/scripts/bundle-engine.mjs`
 * (см. supabase/README.md).
 */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { InvalidActionError, replay } from '../_shared/engine/index.js';
import {
  MAX_BODY_BYTES,
  extractResult,
  isSeedAllowed,
  parsePayload,
  type ReplayedState,
} from '../_shared/daily.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Необязательно: список origin через запятую. Пусто — любой (авторизация всё равно по Bearer-токену). */
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.length === 0 ? '*' : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Бизнес-отказ: 200 + accepted=false, чтобы клиент отличал его от сбоя */
const reject = (req: Request, reason: string) => json(req, 200, { accepted: false, reason });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'method not allowed' });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('submit-daily: не заданы SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return json(req, 500, { error: 'server misconfigured' });
  }

  // ---------- 1. Аутентификация ----------
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json(req, 401, { error: 'missing token' });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(req, 401, { error: 'invalid token' });
  if (user.is_anonymous) return json(req, 403, { error: 'anonymous users cannot submit' });

  // ---------- 2. Тело запроса ----------
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY_BYTES) return json(req, 413, { error: 'payload too large' });
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(req, 413, { error: 'payload too large' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(req, 400, { error: 'invalid json' });
  }
  const parsed = parsePayload(body);
  if (!parsed.ok) return json(req, 400, { error: parsed.error });
  const { seed, options, actions } = parsed.value;

  if (!isSeedAllowed(seed, new Date())) return reject(req, 'seed_not_active');

  // ---------- 3. Уже отправлял? (дёшево, до тяжёлого replay) ----------
  const existing = await admin
    .from('daily_results')
    .select('id')
    .eq('user_id', user.id)
    .eq('seed', seed)
    .maybeSingle();
  if (existing.error) {
    console.error('submit-daily: select failed', existing.error.code);
    return json(req, 500, { error: 'database error' });
  }
  if (existing.data) return reject(req, 'already_submitted');

  // ---------- 4. Пересчёт забега ----------
  let state: ReplayedState;
  try {
    state = replay(options, actions) as unknown as ReplayedState;
  } catch (e) {
    if (e instanceof InvalidActionError) return reject(req, 'invalid_run');
    console.error('submit-daily: replay crashed', e instanceof Error ? e.message : String(e));
    return reject(req, 'invalid_run');
  }
  const result = extractResult(state, options);
  if (!result.ok) return reject(req, result.reason);
  const { classId, score, floor, victory } = result.value;

  // ---------- 5. Запись ----------
  const inserted = await admin
    .from('daily_results')
    .insert({ user_id: user.id, seed, class_id: classId, score, floor, victory, actions })
    .select('created_at')
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505') return reject(req, 'already_submitted');
    console.error('submit-daily: insert failed', inserted.error.code);
    return json(req, 500, { error: 'database error' });
  }
  const createdAt = (inserted.data as { created_at: string }).created_at;

  // ---------- 6. Место в таблице ----------
  const [better, tiedEarlier] = await Promise.all([
    admin.from('daily_results').select('id', { count: 'exact', head: true }).eq('seed', seed).gt('score', score),
    admin
      .from('daily_results')
      .select('id', { count: 'exact', head: true })
      .eq('seed', seed)
      .eq('score', score)
      .lt('created_at', createdAt),
  ]);
  const rank =
    better.error || tiedEarlier.error ? undefined : (better.count ?? 0) + (tiedEarlier.count ?? 0) + 1;

  return json(req, 200, { accepted: true, rank, score, floor, victory });
});
