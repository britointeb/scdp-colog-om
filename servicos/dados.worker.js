import Papa from 'papaparse';
import { normalizeDatasets } from './dados.js';

const required = {
  tesgen: ['Doc - Exercício Ano', 'NE CCor Número', 'PROVISAO RECEBIDA', 'DESPESAS EMPENHADAS (CONTROLE EMPENHO)', 'DESPESAS LIQUIDADAS (CONTROLE EMPENHO)', 'DESPESAS PAGAS (CONTROLE EMPENHO)'],
  bilhetes: ['PCDP', 'nome_proposto', 'empenho', 'valor_emitido', 'valor_a_emitir', 'valor_a_devolver'],
  teto: ['PCDP', 'nome_proposto', 'empenho', 'valor_em_andamento', 'valor_realizado'],
};

function parseCsv(text, source) {
  const result = Papa.parse(text.replace(/^\uFEFF/, ''), { header: true, delimiter: ';', skipEmptyLines: 'greedy', transformHeader: header => header.trim() });
  const missing = required[source].filter(field => !result.meta.fields.includes(field));
  if (missing.length) throw new Error(`Estrutura de ${source} incompatível: faltam ${missing.join(', ')}.`);
  if (result.errors.length) throw new Error(`O CSV de ${source} tem ${result.errors.length} erro(s) de leitura. Verifique a exportação.`);
  return result.data;
}

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type !== 'load' && message.type !== 'import') return;
  try {
    const baseUrl = new URL(message.baseUrl || '../dados/', self.location.href);
    const datasets = {};
    const filenames = { tesgen: 'tesgen.csv', bilhetes: 'bilhetes.csv', teto: 'teto_orcamentario.csv' };
    const files = Array.from(message.files || []);
    for (const [index, source] of ['tesgen', 'bilhetes', 'teto'].entries()) {
      self.postMessage({ type: 'progress', source, progress: Math.round(index / 3 * 85), message: `Lendo ${source === 'teto' ? 'teto orçamentário' : source}…` });
      let text;
      if (message.type === 'import') {
        const file = files.find(file => {
          const name = file.name.toLowerCase();
          return source === 'tesgen' ? name.includes('tesgen') || name.includes('execucao_orc') : source === 'bilhetes' ? name.includes('bilhete') : name.includes('teto');
        });
        if (!file) throw new Error(`Selecione os três CSVs. Não foi identificado o arquivo de ${source}.`);
        text = await file.text();
      } else {
        const url = new URL(filenames[source], baseUrl);
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Não foi possível carregar ${filenames[source]}. Use Carregar bases ou execute o atualizador.`);
        text = await response.text();
      }
      datasets[source] = parseCsv(text, source);
    }
    self.postMessage({ type: 'progress', progress: 90, message: 'Conferindo valores e relacionamentos…' });
    const data = normalizeDatasets(datasets);
    if (data.meta.issues.length) throw new Error(`Foram encontrados ${data.meta.issues.length} valores monetários inválidos. Corrija as bases antes de usar os indicadores.`);
    self.postMessage({ type: 'ready', data });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'Falha ao carregar as bases.' });
  }
};
