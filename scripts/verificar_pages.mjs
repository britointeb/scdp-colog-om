import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSnapshot} from './fotografia.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const expected=['.nojekyll','dados.js','index.html','offline/painel.css','offline/painel.js'];
export async function verifyPagesArtifact(root,{sourceRoot=projectRoot}={}){
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
  if(files.length!==expected.length||expected.some(file=>!files.includes(file)))throw Error('O pacote do Pages deve conter somente index, fotografia das bases e os recursos compilados.');
  const snapshot=await createSnapshot({root:sourceRoot,hosted:true});
  if(await fs.readFile(path.join(root,'dados.js'),'utf8')!==snapshot.body)throw Error('A fotografia do Pages nao corresponde as tres bases consolidadas.');
  const html=await fs.readFile(path.join(root,'index.html'),'utf8');
  for(const resource of ['dados.js','offline/painel.js','offline/painel.css']){
    if(!html.includes(`"./${resource}"`))throw Error(`Recurso ausente do index: ${resource}`);
    if(!(await fs.stat(path.join(root,resource))).size)throw Error(`Recurso vazio: ${resource}`);
  }
  return {files:files.sort(),autoload:true,rows:snapshot.rows};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(process.argv[2]||'dist/pages');
  console.log(await verifyPagesArtifact(root));
}
