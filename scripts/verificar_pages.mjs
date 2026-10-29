import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PAGES_DATA='/* GitHub Pages: bases importadas somente na sessao do navegador. */\nwindow.SCDP_PUBLIC=true;\nwindow.SCDP_MANIFEST=null;\nwindow.SCDP_DATA=null;\n';
const expected=['.nojekyll','dados.js','index.html','offline/painel.css','offline/painel.js'];
export async function verifyPagesArtifact(root){
  const files=[];
  async function walk(folder){
    for(const entry of await fs.readdir(folder,{withFileTypes:true})){
      const absolute=path.join(folder,entry.name);
      if(entry.isSymbolicLink())throw Error('O pacote do Pages nao pode conter links simbolicos.');
      if(entry.isDirectory())await walk(absolute);
      else files.push(path.relative(root,absolute).split(path.sep).join('/'));
    }
  }
  await walk(root);
  if(files.length!==expected.length||expected.some(file=>!files.includes(file)))throw Error('O pacote do Pages deve conter somente index, inicializacao vazia e os recursos compilados.');
  if(await fs.readFile(path.join(root,'dados.js'),'utf8')!==PAGES_DATA)throw Error('A publicacao do Pages deve iniciar sem bases reais.');
  const html=await fs.readFile(path.join(root,'index.html'),'utf8');
  for(const resource of ['dados.js','offline/painel.js','offline/painel.css']){
    if(!html.includes(`"./${resource}"`))throw Error(`Recurso ausente do index: ${resource}`);
    if(!(await fs.stat(path.join(root,resource))).size)throw Error(`Recurso vazio: ${resource}`);
  }
  return {files:files.sort(),emptyData:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(process.argv[2]||'dist/pages');
  console.log(await verifyPagesArtifact(root));
}
