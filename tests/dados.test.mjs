import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoneyToCents, parseDate, normalizeCommitment, normalizeDatasets, filterDatasets, summarize, getFilterOptions } from '../servicos/dados.js';

const financial = { 'Doc - Exercício Ano': '2026', 'Emitente - UG Código': '160467', 'Emitente - UG Nome': 'Unidade teste', 'NE CCor Número': '160467000012026NE000028', 'Emissão - Dia Data Completa': '15/08/2026', 'PROVISAO RECEBIDA': '', 'DESPESAS EMPENHADAS (CONTROLE EMPENHO)': '1.000,01', 'DESPESAS LIQUIDADAS (CONTROLE EMPENHO)': '700,00', 'DESPESAS PAGAS (CONTROLE EMPENHO)': '500,00' };
const ticket = { PCDP: '000001/26', nome_proposto: 'Pessoa Teste', UG: '160467', empenho: '1604672026NE000028', periodo_viagem_inicio: '2026-08-01', valor_emitido: '100,00', valor_a_emitir: '', valor_a_devolver: '0,00', total_pcdp_emitido: '300,00', numero_bilhete: 'TESTE', tempo_solicitacao: '5' };
const budget = { PCDP: '000001/26', nome_proposto: 'Pessoa Teste', UG: '160467', empenho: '1604672026NE000028', valor_realizado: '300,00', valor_em_andamento: '0,00', periodo_inicio: '01/01/2026', periodo_fim: '26/10/2026' };
const fixture = () => normalizeDatasets({ tesgen: [financial], bilhetes: [ticket, { ...ticket, valor_emitido: '200,00' }], teto: [budget] });

test('money preserves cents, negatives, zero and unavailable values', () => {
  assert.equal(parseMoneyToCents('1.234,56'), 123456);
  assert.equal(parseMoneyToCents('-0,01'), -1);
  assert.equal(parseMoneyToCents('(1.234,56)'), -123456);
  assert.equal(parseMoneyToCents('0,00'), 0);
  assert.equal(parseMoneyToCents(''), null);
  assert.throws(() => parseMoneyToCents('sem valor'));
});
test('calendar dates and saldo inicial are handled without invented month', () => {
  assert.equal(parseDate('28/05/2026 13:13'), '2026-05-28');
  assert.equal(parseDate('2026-05-28'), '2026-05-28');
  assert.equal(parseDate('31/02/2026'), '');
  const data = normalizeDatasets({ tesgen: [{ ...financial, 'Emissão - Dia Data Completa': '000/2026', 'Documento Número': 'SALDO INICIAL 2026', UG: '-9', 'Emitente - UG Código': '-9' }] });
  assert.equal(data.tesgen.length, 1);
  assert.equal(data.tesgen[0].date, '');
  assert.equal(data.tesgen[0].isOpening, true);
});
test('commitment normalization preserves unit and matches 23- and 18-character forms', () => {
  assert.equal(normalizeCommitment('160467000012026NE000028'), '1604672026NE000028');
  assert.equal(normalizeCommitment('1604672026NE000028'), '1604672026NE000028');
  assert.notEqual(normalizeCommitment('1674672026NE000028'), normalizeCommitment('1604672026NE000028'));
});
test('financial measures and event totals are kept separate without join multiplication', () => {
  const data = fixture();
  const summary = summarize(filterDatasets(data));
  assert.equal(summary.tesgen.committedCents, 100001);
  assert.equal(summary.tesgen.liquidatedCents, 70000);
  assert.equal(summary.tesgen.paidCents, 50000);
  assert.equal(summary.tesgen.provisionCents, null);
  assert.equal(summary.bilhetes.issuedCents, 30000);
  assert.equal(summary.bilhetes.tickets, 1);
  assert.equal(summary.bilhetes.rows, 2);
  assert.equal(summary.bilhetes.leadDaysMedian, 5);
  assert.equal(summary.teto.realizedCents, 30000);
});
test('person scope uses TESGEN only as related commitment context', () => {
  const data = fixture();
  const filtered = filterDatasets(data, { person: 'PESSOA TESTE' });
  assert.equal(filtered.tesgen.length, 1);
  assert.equal(filtered.scopeContext, true);
  assert.equal(filtered.tesgen[0].person, '');
  assert.equal(summarize(filtered).tesgen.scopeContext, true);
  assert.equal(filterDatasets(data, { person: 'PESSOA AUSENTE' }).tesgen.length, 0);
});
test('complete PCDP and base PCDP remain distinct', () => {
  const data = normalizeDatasets({ bilhetes: [{ ...ticket, PCDP: '000001/26-1C' }] });
  assert.equal(data.bilhetes[0].pcdp, '000001/26-1C');
  assert.equal(data.bilhetes[0].pcdpBase, '000001/26');
});
test('TETO coverage does not become a movement date or monthly filter', () => {
  const data = fixture();
  const filtered = filterDatasets(data, { start: '2026-09-01', end: '2026-09-30' });
  assert.equal(filtered.bilhetes.length, 0);
  assert.equal(filtered.tesgen.length, 0);
  assert.equal(filtered.teto.length, 1);
  assert.equal(filtered.teto[0].date, '');
  assert.equal(filtered.tetoScopeContext, true);
});
test('filter choices and exact year scope reflect supplied data', () => {
  assert.deepEqual(getFilterOptions(fixture()).years, ['2026']);
  assert.equal(filterDatasets(fixture(), { year: '2025' }).bilhetes.length, 0);
});
test('TETO exercise follows report coverage when an earlier PCDP appears in the next year', () => {
  const data = normalizeDatasets({ teto: [{ ...budget, PCDP: '000001/25' }] });
  assert.equal(data.teto[0].year, '2026');
  assert.equal(filterDatasets(data, { year: '2026' }).teto.length, 1);
});
