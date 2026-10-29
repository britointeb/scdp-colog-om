import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSourcePath } from '../scripts/atualizar_dados.mjs';

test('a origem padrão é SCDP/DADOS/SAIDA', () => {
  const saved = process.env.SCDP_SOURCE;
  delete process.env.SCDP_SOURCE;
  try {
    const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    assert.equal(resolveSourcePath(), path.resolve(project, '..', 'DADOS', 'SAIDA'));
    process.env.SCDP_SOURCE = 'origem-ambiente';
    assert.equal(resolveSourcePath(), path.resolve('origem-ambiente'));
    assert.equal(resolveSourcePath({ source: 'origem-explicita' }), path.resolve('origem-explicita'));
  } finally {
    if (saved === undefined) delete process.env.SCDP_SOURCE;
    else process.env.SCDP_SOURCE = saved;
  }
});
