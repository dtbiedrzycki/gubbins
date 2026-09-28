import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import process from 'node:process';

describe('feature-folder lint boundary', () => {
  it('flags create-list importing from holds internals', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { useHoldItem } from '../holds/useHoldItem';\nexport const x = useHoldItem;\n",
      { filePath: 'src/features/create-list/Bad.ts' },
    );
    expect(results[0].messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows create-list importing from the shared api boundary', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { api } from '../../api/client';\nexport const x = api;\n",
      { filePath: 'src/features/create-list/Ok.ts' },
    );
    expect(results[0].messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });
});
