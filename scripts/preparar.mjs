import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveSourcePath,updateData} from './atualizar_dados.mjs';

export async function prepare({source}={}){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const origin=resolveSourcePath({source});
  let available=false;
  try{available=(await fs.stat(origin)).isDirectory();}catch(error){if(error.code!=='ENOENT')throw error;}
  if(available){
    console.log(`Preparando bases de ${origin}`);
    await updateData({source:origin});
  }else{
    console.log(`Pasta de origem não encontrada: ${origin}`);
    console.log('Usando as bases locais existentes, quando houver. Sem bases, a interface permitirá importar os três CSVs.');
  }
  await import('./compilar.mjs');
  console.log(`Abra por duplo clique: ${path.join(root,'index.html')}`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),index=args.indexOf('--source');
  const source=index>=0?args[index+1]:args.find(a=>a.startsWith('--source='))?.slice(9);
  if(index>=0&&(!source||source.startsWith('--'))) {console.error('Informe o caminho após --source.');process.exitCode=1;}
  else prepare({source}).catch(error=>{console.error(`Não foi possível preparar o painel: ${error.message}`);process.exitCode=1;});
}
