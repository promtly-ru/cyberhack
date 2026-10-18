/**
 * Проект собирается TypeScript 7 (нативный компилятор без классического JS API),
 * а typescript-eslint пока умеет только TypeScript < 6.1. Поэтому для линтера
 * подставляем TypeScript 6 (devDependency-алиас `typescript6`) — только для
 * модулей typescript-eslint, сборка и typecheck по-прежнему идут на TS 7.
 */
const Module = require('node:module');

const ts6 = require.resolve('typescript6');
const origResolve = Module._resolveFilename;
const isLintModule = (parent) => !!parent?.filename && /[\\/]node_modules[\\/](@typescript-eslint|ts-api-utils|typescript-eslint)[\\/]/.test(parent.filename);

Module._resolveFilename = function resolveTypeScriptForLint(request, parent, ...rest) {
  if (request === 'typescript' && isLintModule(parent)) return ts6;
  return origResolve.call(this, request, parent, ...rest);
};
