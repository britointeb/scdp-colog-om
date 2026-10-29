import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateSnapshot } from './fotografia.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = path.join(projectRoot, 'public', 'dados');
const definitions = [
  { key: 'tesgen', folder: 'TESGEN', file: 'tesgen.csv', required: ['Emissão - Dia Data Completa', 'UG', 'Doc - Exercício Ano', 'NE CCor Número', 'Favorecido Doc. Nome'] },
  { key: 'bilhetes', folder: 'BILHETES', file: 'bilhetes.csv', required: ['PCDP', 'nome_proposto', 'UG', 'empenho', 'valor_emitido', 'valor_a_devolver'] },
  { key: 'teto', folder: 'TETO_ORCAMENTARIO', file: 'teto_orcamentario.csv', required: ['PCDP', 'nome_proposto', 'UG', 'empenho', 'valor_realizado', 'valor_em_andamento'] },
];

export function resolveSourcePath({ source, root = projectRoot } = {}) {
  if (source || process.env.SCDP_SOURCE) return path.resolve(source || process.env.SCDP_SOURCE);
  const configPath = path.join(root, 'scdp.local.json');
  let settings;
  try { settings = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Não foi possível ler ${configPath}: ${error.message}`);
  }
  if (settings !== undefined) {
    if (!settings || typeof settings.source !== 'string' || !settings.source.trim()) throw new Error('scdp.local.json deve informar "source" como caminho não vazio de DADOS/SAIDA.');
    return path.resolve(root, settings.source);
  }
  return path.resolve(root, '..', 'DADOS', 'SAIDA');
}

async function inspectCsv(filename, required) {
  let Papa;
  try { ({ default: Papa } = await import('papaparse')); }
  catch { throw new Error('PapaParse não está instalado. Execute npm install nesta pasta para atualizar as bases.'); }
  return new Promise((resolve, reject) => {
    let rows = 0;
    let columns;
    let failed = false;
    const fail = (error, parser) => {
      if (failed) return;
      failed = true;
      if (parser) parser.abort();
      reject(error);
    };
    Papa.parse(fs.createReadStream(filename, { encoding: 'utf8' }), {
      header: true,
      skipEmptyLines: 'greedy',
      beforeFirstChunk: (chunk) => chunk.replace(/^\uFEFF/, ''),
      transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
      step(result, parser) {
        if (!columns) {
          columns = result.meta.fields || [];
          const missing = required.filter((column) => !columns.includes(column));
          if (missing.length) return fail(new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`), parser);
          if (new Set(columns).size !== columns.length || Object.keys(result.meta.renamedHeaders || {}).length) {
            return fail(new Error('O CSV contém cabeçalhos repetidos.'), parser);
          }
        }
        if (result.errors.length) {
          const detail = result.errors[0];
          return fail(new Error(`CSV inválido no registro ${rows + 1}: ${detail.code}.`), parser);
        }
        rows += 1;
      },
      complete() {
        if (failed) return;
        if (!rows || !columns?.length) return reject(new Error('CSV vazio ou sem registros.'));
        resolve({ rows, columns });
      },
      error(error) { fail(error); },
    });
  });
}

async function sha256(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function updateData({ source } = {}) {
  const sourceRoot = resolveSourcePath({ source });
  const temporaryDirectory = path.join(dataDirectory, `.atualizacao-${process.pid}-${Date.now()}`);
  await fsp.mkdir(temporaryDirectory, { recursive: true });
  const manifest = { updatedAt: new Date().toISOString(), sources: {} };
  try {
    for (const definition of definitions) {
      const folder = path.join(sourceRoot, definition.folder);
      const candidates = (await fsp.readdir(folder, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv') && !entry.name.startsWith('~$'));
      if (candidates.length !== 1) {
        throw new Error(`${definition.folder}: esperado um CSV; encontrados ${candidates.length}.`);
      }
      const origin = path.join(folder, candidates[0].name);
      const copied = path.join(temporaryDirectory, definition.file);
      const before = await fsp.stat(origin);
      await fsp.copyFile(origin, copied);
      const after = await fsp.stat(origin);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        throw new Error(`${definition.folder}: o arquivo de origem mudou durante a cópia. Tente novamente.`);
      }
      const inspected = await inspectCsv(copied, definition.required);
      manifest.sources[definition.key] = {
        file: definition.file,
        rows: inspected.rows,
        columns: inspected.columns,
        sha256: await sha256(copied),
        modifiedAt: before.mtime.toISOString(),
      };
      console.log(`${definition.folder}: ${inspected.rows.toLocaleString('pt-BR')} registros, ${inspected.columns.length} colunas.`);
    }
    // Publica o manifesto por último, após validar as três cópias.
    await fsp.writeFile(path.join(temporaryDirectory, 'manifesto.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    for (const definition of definitions) {
      await fsp.rename(path.join(temporaryDirectory, definition.file), path.join(dataDirectory, definition.file));
    }
    await fsp.rename(path.join(temporaryDirectory, 'manifesto.json'), path.join(dataDirectory, 'manifesto.json'));
    console.log('Bases locais atualizadas e verificadas com SHA-256.');
    await generateSnapshot();
    console.log('Fotografia dados.js atualizada para abertura direta do index.html.');
    return manifest;
  } finally {
    if (!path.resolve(temporaryDirectory).startsWith(`${path.resolve(dataDirectory)}${path.sep}`)) {
      throw new Error('Caminho temporário fora da pasta de dados.');
    }
    await fsp.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function commandLineSource(args) {
  const index = args.indexOf('--source');
  if (index >= 0) {
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Informe o caminho após --source.');
    return args[index + 1];
  }
  return args.find((argument) => argument.startsWith('--source='))?.slice('--source='.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await updateData({ source: commandLineSource(process.argv.slice(2)) });
  } catch (error) {
    console.error(`Não foi possível atualizar as bases: ${error.message}`);
    process.exitCode = 1;
  }
}
