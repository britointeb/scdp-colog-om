import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import Papa from 'papaparse';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function createSnapshot({root=projectRoot,manifest,hosted=false}={}){
  manifest??=JSON.parse(await fs.readFile(path.join(root,'public/dados/manifesto.json'),'utf8'));
  const datasets={};
  for(const [key,file]of Object.entries({tesgen:'tesgen.csv',bilhetes:'bilhetes.csv',teto:'teto_orcamentario.csv'})){
    const bytes=await fs.readFile(path.join(root,'public/dados',file));
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');
    if(manifest.sources[key].sha256!==hash)throw Error(`Hash divergente de ${file}. Execute update-data antes de gerar a fotografia.`);
    const parsed=Papa.parse(bytes.toString('utf8').replace(/^\uFEFF/,''),{header:true,delimiter:';',skipEmptyLines:'greedy',transformHeader:s=>s.trim()});
    if(parsed.errors.length)throw Error(`Falha ao ler ${file}: ${parsed.errors[0].message}`);
    if(!parsed.data.length)throw Error(`Base vazia: ${file}.`);
    datasets[key]=parsed.data;
  }
  const encode=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const body=`/* Fotografia SCDP gerada das tres bases consolidadas. */\n${hosted?'window.SCDP_PUBLIC=true;\n':''}window.SCDP_MANIFEST=${encode(manifest)};\nwindow.SCDP_DATA=${encode(datasets)};\n`;
  return {body,rows:Object.fromEntries(Object.entries(datasets).map(([k,v])=>[k,v.length]))};
}
export async function generateSnapshot({allowMissing=false,root=projectRoot}={}){
  let manifest;
  try{manifest=JSON.parse(await fs.readFile(path.join(root,'public/dados/manifesto.json'),'utf8'));}
  catch(error){
    if(!allowMissing||error.code!=='ENOENT')throw error;
    // Keep an existing photograph if a user copied a portable package without its CSV cache.
    try{
      const existing=await fs.readFile(path.join(root,'dados.js'),'utf8');
      if(existing.includes('window.SCDP_DATA=')&&!existing.includes('window.SCDP_DATA=null;'))return {rows:{},preserved:true};
    }catch(readError){if(readError.code!=='ENOENT')throw readError;}
    await fs.writeFile(path.join(root,'dados.js'),'/* Sem bases locais: importe os três CSVs pela interface. */\nwindow.SCDP_MANIFEST=null;\nwindow.SCDP_DATA=null;\n','utf8');
    console.log('Sem bases locais: a interface será compilada para permitir importar os três CSVs.');
    return {rows:{},empty:true};
  }
  const {body,rows}=await createSnapshot({root,manifest});
  const tmp=path.join(root,'dados.js.tmp');await fs.writeFile(tmp,body,'utf8');await fs.rename(tmp,path.join(root,'dados.js'));
  try{await fs.access(path.join(root,'dist/index.html'));await fs.copyFile(path.join(root,'dados.js'),path.join(root,'dist/dados.js'));}catch(e){if(e.code!=='ENOENT')throw e;}
  return {rows,bytes:Buffer.byteLength(body)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await generateSnapshot());
