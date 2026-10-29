import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PAGES_DATA,verifyPagesArtifact} from '../scripts/verificar_pages.mjs';

async function artifact(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'scdp-pages-'));
  try{
    await fs.mkdir(path.join(root,'offline'));
    const files={'.nojekyll':'','dados.js':PAGES_DATA,'index.html':'<link href="./offline/painel.css"><script src="./dados.js"></script><script src="./offline/painel.js"></script>','offline/painel.css':'body{color:#123}','offline/painel.js':'window.ready=true;'};
    for(const [file,text]of Object.entries(files))await fs.writeFile(path.join(root,file),text);
    return await run(root);
  }finally{
    if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Pasta de teste fora do diretorio temporario.');
    await fs.rm(root,{recursive:true,force:true});
  }
}
test('Pages exige index e todos os recursos compilados com inicializacao vazia',()=>artifact(async root=>{
  const result=await verifyPagesArtifact(root);assert.equal(result.emptyData,true);assert.equal(result.files.length,5);
  await fs.unlink(path.join(root,'offline/painel.js'));
  await assert.rejects(verifyPagesArtifact(root),/recursos compilados/);
}));
test('Pages recusa fotografia local mesmo quando o pacote possui os recursos esperados',()=>artifact(async root=>{
  await fs.writeFile(path.join(root,'dados.js'),'window.SCDP_DATA={tesgen:[{nome:"Pessoa"}]};');
  await assert.rejects(verifyPagesArtifact(root),/sem bases reais/);
}));
test('Pages recusa arquivos adicionais e caminhos quebrados no index',()=>artifact(async root=>{
  await fs.writeFile(path.join(root,'tesgen.csv'),'conteudo local');
  await assert.rejects(verifyPagesArtifact(root),/somente index/);
  await fs.unlink(path.join(root,'tesgen.csv'));
  await fs.writeFile(path.join(root,'index.html'),'<div id="root"></div>');
  await assert.rejects(verifyPagesArtifact(root),/Recurso ausente/);
}));
