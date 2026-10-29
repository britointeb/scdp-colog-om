import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateData, resolveSourcePath } from './atualizar_dados.mjs';
import { startServer } from './servir.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--source');
  if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error('Informe o caminho após --source.');
  const source = index >= 0 ? args[index + 1] : args.find((argument) => argument.startsWith('--source='))?.slice(9);
  const sourcePath = resolveSourcePath({ source });
  let sourceExists = false;
  try { sourceExists = (await fsp.stat(sourcePath)).isDirectory(); } catch { /* O painel aceita importação local. */ }
  if (sourceExists) {
    try { await updateData({ source: sourcePath }); }
    catch (error) {
      console.error(`Atualização não concluída: ${error.message}`);
      console.log('O painel abrirá com a cópia local anterior, se disponível. Também é possível importar os três CSVs pela interface.');
    }
  } else {
    console.log(`Pasta de origem não localizada: ${sourcePath}`);
    console.log('Usando as bases locais. Para atualizar, informe --source ou SCDP_SOURCE, ou importe os CSVs pela interface.');
  }
  try { await fsp.access(path.join(projectRoot, 'public', 'dados', 'manifesto.json')); }
  catch { console.log('Ainda não há bases copiadas. Use a opção de importação de CSVs no painel.'); }
  await startServer({ openBrowser: !args.includes('--no-open') });
}

main().catch((error) => { console.error(`Não foi possível iniciar: ${error.message}`); process.exitCode = 1; });
