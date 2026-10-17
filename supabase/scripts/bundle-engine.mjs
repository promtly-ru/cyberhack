#!/usr/bin/env node
/**
 * Собирает движок (packages/engine/src, чистый TS + JSON-контент) в один ESM-файл для Edge Function:
 *   supabase/functions/_shared/engine/index.js  (+ index.d.ts с нужными функции типами)
 *
 * Зачем: исходники движка импортируют './types' без расширений и JSON-файлы — Deno так не умеет,
 * а Supabase CLI при деплое берёт только файлы внутри supabase/functions. Бандл решает обе проблемы
 * и гарантирует, что сервер пересчитывает забег тем же кодом, что и клиент.
 *
 * Запуск (из корня репозитория): node supabase/scripts/bundle-engine.mjs
 * esbuild уже есть в node_modules (зависимость tsx/vite), отдельно ставить не нужно.
 */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = resolve(root, 'packages/engine/src/index.ts');
const outDir = resolve(root, 'supabase/functions/_shared/engine');
const outFile = resolve(outDir, 'index.js');

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  loader: { '.json': 'json' },
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
  banner: {
    js: '// @ts-self-types="./index.d.ts"\n// СГЕНЕРИРОВАНО supabase/scripts/bundle-engine.mjs — не редактировать вручную.',
  },
});

// Минимальные типы для Deno: Edge Function использует только replay и InvalidActionError.
const dts = `// СГЕНЕРИРОВАНО supabase/scripts/bundle-engine.mjs
export interface EngineRunOptions {
  seed: string;
  classId: 'netrunner' | 'phreaker' | 'ghost';
  ascension?: number;
  daily?: boolean;
}
export interface EngineRunState {
  seed: string;
  classId: string;
  status: 'active' | 'won' | 'lost';
  score: number;
  floor: number;
  [key: string]: unknown;
}
export declare function replay(opts: EngineRunOptions, actions: unknown[]): EngineRunState;
export declare function dailySeed(date: Date): string;
export declare class InvalidActionError extends Error {
  constructor(message: string);
}
`;
await writeFile(resolve(outDir, 'index.d.ts'), dts, 'utf8');
console.log(`engine bundle → ${outFile}`);
