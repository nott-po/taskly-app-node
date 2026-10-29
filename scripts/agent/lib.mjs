import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PACKAGES = ['backend', 'frontend'];

const TEST_FILE = {
  backend: /^backend\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/,
  frontend: /^frontend\/src\/(?:[\w.-]+\/)*[\w.-]+\.test\.tsx?$/,
};
const TEST_SUPPORT = {
  backend: /^backend\/tests\/(?:[\w.-]+\/)*[\w.-]+\.ts$/,
  frontend: /^frontend\/src\/test\/(?:[\w.-]+\/)*[\w.-]+\.tsx?$/,
};
const SOURCE = {
  backend: /^backend\/src\/.+\.ts$/,
  frontend: /^frontend\/src\/.+\.tsx?$/,
};
// Same exclusions as the coverage config
const NOT_TESTABLE = [
  [/(^|\/)types\.ts$|\.types\.ts$|\.d\.ts$/, 'type declarations only'],
  [/(^|\/)index\.ts$/, 're-export barrel'],
  [/^backend\/src\/generated\//, 'generated Prisma client'],
  [/^backend\/src\/main\.ts$|^frontend\/src\/main\.tsx$/, 'process entry point'],
  [/^frontend\/src\/design-system\//, 'design system (covered by Storybook, excluded from coverage)'],
  [/\.(stories|styles|variants)\.tsx?$/, 'stories or styling'],
  [/(^|\/)(constants|queryKeys|queryClient)\.tsx?$|\.constants\.ts$/, 'static configuration'],
];

export function toPosix(file) {
  return file.split(path.sep).join('/').replace(/^\.\//, '');
}

export function packageOf(file) {
  return PACKAGES.find((name) => file.startsWith(`${name}/`)) ?? null;
}

export function isSafePath(file) {
  return typeof file === 'string' && file.length > 0 && file.length < 300 &&
    !file.startsWith('/') && !/^[a-zA-Z]:/.test(file) && !file.includes('\\') &&
    !file.split('/').some((part) => part === '..' || part === '.' || part === '' || part === '.git');
}

// The only files the agent may write
export function isTestPath(file) {
  const name = packageOf(file);
  return Boolean(name && isSafePath(file) && (TEST_FILE[name].test(file) || TEST_SUPPORT[name].test(file)));
}

export function classify(file) {
  const name = packageOf(file);
  if (!name) return { package: null, kind: 'other', reason: 'outside frontend/ and backend/' };
  if (TEST_FILE[name].test(file)) return { package: name, kind: 'test' };
  if (TEST_SUPPORT[name].test(file)) return { package: name, kind: 'test-support' };
  if (!SOURCE[name].test(file)) return { package: name, kind: 'other', reason: 'not TypeScript source' };
  const excluded = NOT_TESTABLE.find(([pattern]) => pattern.test(file));
  if (excluded) return { package: name, kind: 'not-testable', reason: excluded[1] };
  return { package: name, kind: 'source' };
}

export function testPathFor(source) {
  const name = packageOf(source);
  const { dir, name: base, ext } = path.posix.parse(source);
  if (name === 'backend') return `backend/tests/${base}.test.ts`;
  if (name === 'frontend') return `${dir}/${base}.test${ext}`;
  return null;
}

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) args[key.slice(2)] = true;
    else { args[key.slice(2)] = value; index++; }
  }
  return args;
}
