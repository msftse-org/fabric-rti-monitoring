import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../../../../package-lock.json', import.meta.url), 'utf8'));

test('advisor declares its supported Node build versions in the manifest and lockfile', () => {
  assert.equal(manifest.engines?.node, '^22.12.0 || ^24.0.0');
  assert.equal(lock.packages['migration-advisor/packages/frontend'].engines?.node, manifest.engines.node);
});
