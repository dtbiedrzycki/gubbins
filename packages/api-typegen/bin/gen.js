#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { generateApiTypes } from '../index.js';

const [spec, out] = process.argv.slice(2);
if (!spec || !out) {
  console.error('usage: api-typegen <openapi.json> <out.ts>');
  process.exit(2);
}
writeFileSync(out, await generateApiTypes(readFileSync(spec, 'utf8')));
console.log(`wrote ${out}`);
