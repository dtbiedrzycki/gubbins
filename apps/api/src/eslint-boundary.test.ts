import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

describe('Clean Architecture layer boundary', () => {
  it('flags an infrastructure import from domain', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { db } from '../infrastructure/db/createDb';\nexport const x = db;\n",
      { filePath: 'src/domain/entities/Bad.ts' },
    );
    const messages = results[0].messages;
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows the same import from presentation', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { db } from '../infrastructure/db/createDb';\nexport const x = db;\n",
      { filePath: 'src/presentation/compositionRoot.ts' },
    );
    const messages = results[0].messages;
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });

  it('flags an application import from domain', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { Clock } from '../application/ports/Clock';\nexport const x = Clock;\n",
      { filePath: 'src/domain/entities/Bad.ts' },
    );
    const messages = results[0].messages;
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows the same import from application itself', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { Clock } from './ports/Clock';\nexport const x = Clock;\n",
      { filePath: 'src/application/use-cases/Ok.ts' },
    );
    const messages = results[0].messages;
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });
});
