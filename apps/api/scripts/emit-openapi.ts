import { writeFileSync } from 'node:fs';
import { generateOpenApiDocument } from '../src/presentation/openApiDocument.js';

const target = new URL('../openapi.json', import.meta.url);
writeFileSync(target, await generateOpenApiDocument());
console.log(`wrote ${target.pathname}`);
