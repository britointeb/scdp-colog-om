import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createSnapshot} from '../scripts/fotografia.mjs';
import {verifyPagesArtifact} from '../scripts/verificar_pages.mjs';

async function artifact(run){
  const sourceRoot=await fs.mkdtemp(path.join(os.tmpdir(),'scdp-pages-'));
  const root=path.join(sourceRoot,'dist/pages');
  try{
    await fs.mkdir(path.join(sourceRoot,'public/dados'),{recursive:true});
    await fs.mkdir(path.join(root,'offline'),{recursive:true});
    const manifest={updatedAt:'2026-10-28T12:00:00Z',sources:{}};
    for(const [key,file]of Object.entries({tesgen:'tesgen.csv',bilhetes:'bilhetes.csv',teto:'teto_orcamentario.csv'})){
      const csv='PCDP;nome\r\n000001/26;Pessoa de teste\r\n';
      await fs.writeFile(path.join(sourceRoot,'public/dados',file),csv);
      manifest.sources[key]={file,rows:1,sha256:crypto.createHash('sha256').update(csv).digest('hex')};
    }
    await fs.writeFile(path.join(sourceRoot,'public/dados/manifesto.json'),JSON.stringify(manifest));
    await fs.writeFile(path.join(sourceRoot,'dados.js'),'fotografia local preservada');
    const snapshot=await createSnapshot({root:sourceRoot,hosted:true});
    const files={'.nojekyll':'','dados.js':snapshot.body,'index.html':'<link href="./offline/painel.css"><script src="./dados.js"></script><script src="./offline/painel.js"></script>','offline/painel.css':'body{color:#123}','offline/painel.js':'window.ready=true;'};
    for(const [file,text]of Object.entries(files))await fs.writeFile(path.join(root,file),text);
    return await run({root,sourceRoot,snapshot});
  }finally{
    if(!path.resolve(sourceRoot).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Pasta de teste fora do diretorio temporario.');
    await fs.rm(sourceRoot,{recursive:true,force:true});
  }
}
test('Pages abre com as tres bases e exige todos os recursos compilados',()=>artifact(async({root,sourceRoot,snapshot})=>{
  const result=await verifyPagesArtifact(root,{sourceRoot});assert.equal(result.autoload,true);assert.equal(result.files.length,5);assert.deepEqual(result.rows,{tesgen:1,bilhetes:1,teto:1});
  const ctx={window:{}};vm.runInNewContext(snapshot.body,ctx);assert.equal(ctx.window.SCDP_PUBLIC,true);assert.equal(ctx.window.SCDP_DATA.tesgen.length,1);
  assert.equal(await fs.readFile(path.join(sourceRoot,'dados.js'),'utf8'),'fotografia local preservada');
  await fs.unlink(path.join(root,'offline/painel.js'));
  await assert.rejects(verifyPagesArtifact(root,{sourceRoot}),/recursos compilados/);
}));
test('Pages recusa fotografia vazia ou divergente e detecta CSV alterado',()=>artifact(async({root,sourceRoot})=>{
  await fs.writeFile(path.join(root,'dados.js'),'window.SCDP_DATA=null;');
  await assert.rejects(verifyPagesArtifact(root,{sourceRoot}),/nao corresponde/);
  await fs.appendFile(path.join(sourceRoot,'public/dados/tesgen.csv'),'outra;linha\r\n');
  await assert.rejects(createSnapshot({root:sourceRoot,hosted:true}),/Hash divergente/);
}));
test('Pages recusa arquivos adicionais e caminhos quebrados no index',()=>artifact(async({root,sourceRoot})=>{
  await fs.writeFile(path.join(root,'arquivo-incompleto.txt'),'teste');
  await assert.rejects(verifyPagesArtifact(root,{sourceRoot}),/somente index/);
  await fs.unlink(path.join(root,'arquivo-incompleto.txt'));
  await fs.writeFile(path.join(root,'index.html'),'<div id="root"></div>');
  await assert.rejects(verifyPagesArtifact(root,{sourceRoot}),/Recurso ausente/);
}));
