/** SCDP data model. All monetary properties ending in Cents are integer cents or null. */
export const TESGEN_MEASURES = {
  provisionCents: 'PROVISAO RECEBIDA',
  committedCents: 'DESPESAS EMPENHADAS (CONTROLE EMPENHO)',
  liquidatedCents: 'DESPESAS LIQUIDADAS (CONTROLE EMPENHO)',
  paidCents: 'DESPESAS PAGAS (CONTROLE EMPENHO)',
  rapInscribedCents: 'RESTOS A PAGAR INSCRITOS (PROC E N PROC)',
  rapPaidCents: 'RESTOS A PAGAR PROCESSADOS PAGOS',
  rapNonProcessedPaidCents: 'RESTOS A PAGAR NAO PROCESSADOS PAGOS',
};

const text = (v) => String(v ?? '').trim();
const informative = (v) => !['', '-9', 'NAO SE APLICA', 'NÃO SE APLICA'].includes(text(v).toUpperCase());
const clean = (v) => informative(v) ? text(v) : '';
export const normalizeText = (v) => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase();
const unique = (v) => [...new Set(v.filter(Boolean))];
const byLabel = (a, b) => a.localeCompare(b, 'pt-BR');

/** Parse locale money without floating-point multiplication; blank stays null. */
export function parseMoneyToCents(value) {
  if (value == null || text(value) === '') return null;
  let raw = text(value).replace(/R\$/g, '').replace(/\s/g, '');
  const negative = raw.startsWith('-') || (raw.startsWith('(') && raw.endsWith(')'));
  raw = raw.replace(/^[(-]/, '').replace(/\)$/, '').replace(/^\+/, '');
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Valor monetário inválido.');
  const [integer, fraction = ''] = raw.split('.');
  const cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'));
  const result = Number(negative ? -cents : cents);
  if (!Number.isSafeInteger(result)) throw new Error('Valor monetário excede a precisão suportada.');
  return result;
}

/** Dates are calendar-only ISO dates. Invalid dates and opening balances have no date. */
export function parseDate(value) {
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:\b|T)/);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\b|\s)/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2], br[1]] : null;
  if (!parts) return '';
  const [year, month, day] = parts.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

/** Keep UG in the commitment key: a suffix alone can match another unit. */
export function normalizeCommitment(value, ug = '') {
  const raw = normalizeText(value).replace(/[^A-Z0-9]/g, '');
  const match = raw.match(/(\d{4}NE\d{6})$/);
  if (!match) return '';
  const prefix = raw.slice(0, -match[1].length);
  const unit = /^\d{6}/.test(prefix) ? prefix.slice(0, 6) : clean(ug).match(/^\d{6}$/)?.[0];
  return unit ? `${unit}${match[1]}` : '';
}

export function normalizePcdp(value) {
  return normalizeText(value).replace(/\s/g, '');
}

const basePcdp = (value) => value.replace(/-\d+[A-Z]*$/, '');
const yearPcdp = (value) => {
  const match = value.match(/\/(\d{2}|\d{4})(?:-|$)/);
  return match ? (match[1].length === 2 ? `20${match[1]}` : match[1]) : '';
};

function coverage(rows, type) {
  const starts = rows.map(r => type === 'teto' ? r.coverageStart : type === 'bilhetes' ? r.reportStart : r.date).filter(Boolean).sort();
  const ends = rows.map(r => type === 'teto' ? r.coverageEnd : type === 'bilhetes' ? r.reportEnd : r.date).filter(Boolean).sort();
  return { start: starts[0] || '', end: ends.at(-1) || '', years: unique(rows.map(r => r.year)).sort(), rows: rows.length };
}

export function normalizeDatasets({ tesgen = [], bilhetes = [], teto = [] }) {
  const issues = [];
  const money = (raw, name, source, index) => {
    try { return parseMoneyToCents(raw[name]); }
    catch { issues.push({ source, row: index + 1, field: name, message: 'Valor monetário inválido; indicador indisponível para este registro.' }); return null; }
  };
  const omByUg = new Map();
  for (const raw of tesgen) {
    const ug = clean(raw['Emitente - UG Código']) || clean(raw.UG);
    const om = clean(raw['Emitente - UG Nome']);
    if (ug && om && !omByUg.has(ug)) omByUg.set(ug, om);
  }
  const normalizedTesgen = tesgen.map((raw, index) => {
    const ug = clean(raw['Emitente - UG Código']) || clean(raw.UG);
    const document = text(raw['Documento Número']);
    const date = parseDate(raw['Emissão - Dia Data Completa']);
    const row = {
      id: `tesgen:${index + 1}`, source: 'tesgen', year: clean(raw['Doc - Exercício Ano']) || date.slice(0, 4),
      date, ug, om: omByUg.get(ug) || ug || 'Não informado', person: '', personKey: '', pcdp: '', pcdpBase: '',
      commitment: normalizeCommitment(raw['NE CCor Número'], ug),
      category: clean(raw['Natureza Despesa Detalhada Nome']) || 'Não informado',
      status: clean(raw['Doc - Tipo Nome']) || clean(raw['Doc - Tipo Código']) || 'Não informado',
      sourceFile: text(raw.arquivo_nome) || text(raw.arquivo).split(/[\\/]/).at(-1),
      document, beneficiary: clean(raw['Favorecido Doc. Nome']), beneficiaryId: clean(raw['Favorecido Doc. Número']),
      observation: clean(raw['Doc - Observação Texto']), isOpening: normalizeText(document).startsWith('SALDO INICIAL'), raw,
    };
    for (const [key, field] of Object.entries(TESGEN_MEASURES)) row[key] = money(raw, field, 'tesgen', index);
    return row;
  });
  const normalizedBilhetes = bilhetes.map((raw, index) => {
    const ug = clean(raw.UG);
    const pcdp = normalizePcdp(raw.PCDP);
    const person = text(raw.nome_proposto);
    const tripStart = parseDate(raw.periodo_viagem_inicio);
    const reportStart = parseDate(raw.periodo_relatorio_inicio);
    const reportEnd = parseDate(raw.periodo_relatorio_fim);
    return {
      id: `bilhetes:${index + 1}`, source: 'bilhetes', year: yearPcdp(pcdp) || tripStart.slice(0, 4) || reportEnd.slice(0, 4),
      date: tripStart, ug, om: omByUg.get(ug) || ug || 'Não informado', person, personKey: normalizeText(person),
      pcdp, pcdpBase: basePcdp(pcdp), commitment: normalizeCommitment(raw.empenho, ug),
      category: text(raw.tipo_viagem) || 'Não informado', tripType: text(raw.tipo_viagem),
      status: text(raw.situacao_bilhete) || text(raw.situacao_pcdp) || 'Não informado', pcdpStatus: text(raw.situacao_pcdp),
      sourceFile: text(raw.arquivo_nome) || text(raw.arquivo).split(/[\\/]/).at(-1),
      toIssueCents: money(raw, 'valor_a_emitir', 'bilhetes', index), issuedCents: money(raw, 'valor_emitido', 'bilhetes', index),
      toRefundCents: money(raw, 'valor_a_devolver', 'bilhetes', index), ticket: text(raw.numero_bilhete),
      tripStart, tripEnd: parseDate(raw.periodo_viagem_fim), eventDate: parseDate(raw.data_evento),
      requestDate: parseDate(raw.data_solicitacao), reportStart, reportEnd,
      leadDays: text(raw.tempo_solicitacao) !== '' && Number.isFinite(Number(raw.tempo_solicitacao)) ? Number(raw.tempo_solicitacao) : null,
      route: text(raw.trechos), carrier: text(raw.companhia), transport: text(raw.meio_transporte), passage: text(raw.passagem), raw,
    };
  });
  const normalizedTeto = teto.map((raw, index) => {
    const ug = clean(raw.UG);
    const pcdp = normalizePcdp(raw.PCDP);
    const person = text(raw.nome_proposto);
    const coverageStart = parseDate(raw.periodo_inicio);
    const coverageEnd = parseDate(raw.periodo_fim);
    return {
      id: `teto:${index + 1}`, source: 'teto', year: coverageEnd.slice(0, 4) || yearPcdp(pcdp), date: '', ug,
      om: omByUg.get(ug) || ug || 'Não informado', person, personKey: normalizeText(person), pcdp, pcdpBase: basePcdp(pcdp),
      commitment: normalizeCommitment(raw.empenho, ug), category: text(raw.tipo_viagem) || 'Não informado', tripType: text(raw.tipo_viagem),
      status: text(raw.situacao_viagem) || 'Não informado', sourceFile: text(raw.arquivo).split(/[\\/]/).at(-1),
      inProgressCents: money(raw, 'valor_em_andamento', 'teto', index), realizedCents: money(raw, 'valor_realizado', 'teto', index),
      coverageStart, coverageEnd, component: text(raw.componente), raw,
    };
  });
  const commitments = new Set(normalizedTesgen.map(r => r.commitment).filter(Boolean));
  const relationship = (rows) => ({ total: rows.length, withCommitment: rows.filter(r => r.commitment).length, matched: rows.filter(r => r.commitment && commitments.has(r.commitment)).length, missing: rows.filter(r => !r.commitment).length });
  return {
    tesgen: normalizedTesgen, bilhetes: normalizedBilhetes, teto: normalizedTeto,
    meta: {
      generatedAt: new Date().toISOString(), issues,
      coverage: { tesgen: coverage(normalizedTesgen, 'tesgen'), bilhetes: coverage(normalizedBilhetes, 'bilhetes'), teto: coverage(normalizedTeto, 'teto') },
      relationships: { bilhetes: relationship(normalizedBilhetes), teto: relationship(normalizedTeto) },
      counts: { tesgen: normalizedTesgen.length, bilhetes: normalizedBilhetes.length, teto: normalizedTeto.length },
      openingBalances: normalizedTesgen.filter(r => r.isOpening).length,
      invalidTesgenDates: normalizedTesgen.filter(r => !r.date && !r.isOpening).length,
      personIdentity: 'Os relatórios identificam viajantes pelo nome; homônimos exigem conferência. O favorecido financeiro da TESGEN não é usado como viajante.',
    },
  };
}

export function getFilterOptions(data) {
  const all = [...data.tesgen, ...data.bilhetes, ...data.teto];
  const people = new Map();
  const ugs = new Map();
  for (const row of all) {
    if (row.personKey && !people.has(row.personKey)) people.set(row.personKey, row.person);
    if (row.ug && !ugs.has(row.ug)) ugs.set(row.ug, row.om);
  }
  return {
    years: unique(all.map(r => r.year)).sort().reverse(),
    ugs: [...ugs].sort(([a], [b]) => byLabel(a, b)).map(([value, label]) => ({ value, label: label === value ? value : `${value} · ${label}` })),
    people: [...people].map(([value, label]) => ({ value, label })).sort((a, b) => byLabel(a.label, b.label)),
    categories: unique(all.map(r => r.category)).sort(byLabel), statuses: unique(all.map(r => r.status)).sort(byLabel),
  };
}

export const DEFAULT_FILTERS = { year: 'all', ug: 'all', person: 'all', pcdp: '', commitment: '', start: '', end: '', category: 'all', status: 'all', query: '' };

export function filterDatasets(data, filters = {}) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const personScope = !!f.person && f.person !== 'all';
  const pcdpScope = !!text(f.pcdp);
  const context = personScope || pcdpScope;
  const query = normalizeText(f.query);
  const desiredPcdp = normalizePcdp(f.pcdp);
  const desiredCommitment = normalizeText(f.commitment).replace(/[^A-Z0-9]/g, '');
  const periodScope = !!(f.start || f.end);
  const accepts = (row, travel = false) => {
    if (f.year && f.year !== 'all' && row.year !== String(f.year)) return false;
    if (f.ug && f.ug !== 'all' && row.ug !== f.ug) return false;
    if (travel && personScope && row.personKey !== f.person) return false;
    if (travel && pcdpScope && !row.pcdp.includes(desiredPcdp)) return false;
    if (desiredCommitment && !row.commitment.includes(desiredCommitment)) return false;
    if (f.category && f.category !== 'all' && row.category !== f.category) return false;
    if (f.status && f.status !== 'all' && row.status !== f.status) return false;
    // TETO has only coverage dates. It remains a coverage context, never a monthly movement series.
    if (periodScope && row.source !== 'teto') {
      if (!row.date || (f.start && row.date < f.start) || (f.end && row.date > f.end)) return false;
    }
    if (query) {
      const searchable = normalizeText([row.ug, row.om, row.person, row.pcdp, row.commitment, row.category, row.status, row.document, row.beneficiary, row.observation, row.ticket, row.route, row.sourceFile].join(' '));
      if (!searchable.includes(query)) return false;
    }
    return true;
  };
  const bilhetes = data.bilhetes.filter(row => accepts(row, true));
  const teto = data.teto.filter(row => accepts(row, true));
  const related = new Set([...bilhetes, ...teto].map(r => r.commitment).filter(Boolean));
  const tesgen = data.tesgen.filter(row => accepts(row) && (!context || related.has(row.commitment)));
  const notes = [];
  if (context) notes.push('TESGEN: execução dos empenhos relacionados como contexto institucional. Os montantes não são atribuídos à pessoa ou à PCDP.');
  if (periodScope) notes.push('O intervalo de datas usa a emissão contábil na TESGEN e o início da viagem nos bilhetes. Teto apresenta a cobertura integral do relatório no exercício selecionado.');
  if (f.category !== 'all' || f.status !== 'all') notes.push('Categoria e situação são campos específicos de cada fonte; fontes sem correspondência ficam sem registros.');
  return { tesgen, bilhetes, teto, scopeContext: context, tetoScopeContext: periodScope, filters: f, meta: { ...data.meta, filterNotes: notes, scopeContext: context, tetoScopeContext: periodScope } };
}

/** No values -> null. Explicit zeros remain zero. Financial measures are never added across sources. */
export function sumCents(rows, field) {
  const values = rows.map(r => r[field]).filter(v => v != null);
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (!Number.isSafeInteger(sum)) throw new Error('Total monetário excede a precisão suportada.');
  return sum;
}

export function summarize(filtered) {
  const { tesgen, bilhetes, teto } = filtered;
  const people = unique([...bilhetes, ...teto].map(r => r.personKey)).length;
  const pcdps = unique([...bilhetes, ...teto].map(r => r.pcdp)).length;
  const leadByPcdp = new Map();
  for (const row of bilhetes) if (row.leadDays != null && !leadByPcdp.has(row.pcdp)) leadByPcdp.set(row.pcdp, row.leadDays);
  const lead = [...leadByPcdp.values()].sort((a, b) => a - b);
  const median = !lead.length ? null : lead.length % 2 ? lead[Math.floor(lead.length / 2)] : (lead[lead.length / 2 - 1] + lead[lead.length / 2]) / 2;
  const financial = Object.fromEntries(Object.keys(TESGEN_MEASURES).map(field => [field, sumCents(tesgen, field)]));
  return {
    tesgen: { rows: tesgen.length, ...financial, scopeContext: !!filtered.scopeContext, openingBalances: tesgen.filter(r => r.isOpening).length },
    bilhetes: { rows: bilhetes.length, pcdps: unique(bilhetes.map(r => r.pcdp)).length, people: unique(bilhetes.map(r => r.personKey)).length, tickets: unique(bilhetes.map(r => r.ticket)).length, toIssueCents: sumCents(bilhetes, 'toIssueCents'), issuedCents: sumCents(bilhetes, 'issuedCents'), toRefundCents: sumCents(bilhetes, 'toRefundCents'), leadDaysMedian: median },
    teto: { rows: teto.length, pcdps: unique(teto.map(r => r.pcdp)).length, people: unique(teto.map(r => r.personKey)).length, inProgressCents: sumCents(teto, 'inProgressCents'), realizedCents: sumCents(teto, 'realizedCents'), scopeContext: !!filtered.tetoScopeContext },
    people, pcdps, meta: filtered.meta,
  };
}

/** Group money in cents for chart series. Null input groups remain unavailable. */
export function aggregateBy(rows, key, measure) {
  const groups = new Map();
  for (const row of rows) {
    const name = typeof key === 'function' ? key(row) : row[key];
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups].map(([name, values]) => ({ name, value: sumCents(values, measure), count: values.length }));
}
