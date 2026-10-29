import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {resolveSourcePath} from '../scripts/atualizar_dados.mjs';
import {generateSnapshot} from '../scripts/fotografia.mjs';

async function temporary(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'scdp-portavel-'));
  try{return await run(root);}finally{
    if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Diretório de teste fora da pasta temporária.');
    await fs.rm(root,{recursive:true,force:true});
  }
}
test('configuração local resolve caminho relativo à pasta do projeto, independentemente do terminal',()=>temporary(async root=>{
  const previous=process.env.SCDP_SOURCE;delete process.env.SCDP_SOURCE;
  try{
    assert.equal(resolveSourcePath({root}),path.resolve(root,'../DADOS/SAIDA'));
    await fs.writeFile(path.join(root,'scdp.local.json'),JSON.stringify({source:'../Dados de outro computador/SAIDA'}));
    assert.equal(resolveSourcePath({root}),path.resolve(root,'../Dados de outro computador/SAIDA'));
    process.env.SCDP_SOURCE='dados-do-ambiente';assert.equal(resolveSourcePath({root}),path.resolve('dados-do-ambiente'));
    assert.equal(resolveSourcePath({root,source:'dados-do-comando'}),path.resolve('dados-do-comando'));
  }finally{if(previous===undefined)delete process.env.SCDP_SOURCE;else process.env.SCDP_SOURCE=previous;}
}));
test('configuração local inválida é informada; caminho explícito permite substituí-la',()=>temporary(async root=>{
  const previous=process.env.SCDP_SOURCE;delete process.env.SCDP_SOURCE;
  try{
    await fs.writeFile(path.join(root,'scdp.local.json'),JSON.stringify({source:5}));
    assert.throws(()=>resolveSourcePath({root}),/caminho não vazio/);
    assert.equal(resolveSourcePath({root,source:'outra-origem'}),path.resolve('outra-origem'));
  }finally{if(previous===undefined)delete process.env.SCDP_SOURCE;else process.env.SCDP_SOURCE=previous;}
}));
test('cópia sem bases gera interface vazia para importação, sem simular registros',()=>temporary(async root=>{
  await assert.rejects(generateSnapshot({root}),{code:'ENOENT'});
  const result=await generateSnapshot({root,allowMissing:true});assert.equal(result.empty,true);
  const ctx={window:{}};vm.runInNewContext(await fs.readFile(path.join(root,'dados.js'),'utf8'),ctx);
  assert.equal(ctx.window.SCDP_DATA,null);assert.equal(ctx.window.SCDP_MANIFEST,null);
}));
test('pacote portátil com fotografia existente é preservado quando não há cache CSV',()=>temporary(async root=>{
  const snapshot='window.SCDP_MANIFEST={};\nwindow.SCDP_DATA={tesgen:[],bilhetes:[],teto:[]};\n';
  await fs.writeFile(path.join(root,'dados.js'),snapshot);
  const result=await generateSnapshot({root,allowMissing:true});assert.equal(result.preserved,true);assert.equal(await fs.readFile(path.join(root,'dados.js'),'utf8'),snapshot);
}));
test('preparação sem bases não esconde manifesto corrompido',()=>temporary(async root=>{
  await fs.mkdir(path.join(root,'public/dados'),{recursive:true});await fs.writeFile(path.join(root,'public/dados/manifesto.json'),'{inválido');
  await assert.rejects(generateSnapshot({root,allowMissing:true}),SyntaxError);
}));
test('fotografia com bases verifica hashes e copia para a distribuição',()=>temporary(async root=>{
  await fs.mkdir(path.join(root,'public/dados'),{recursive:true});await fs.mkdir(path.join(root,'dist'),{recursive:true});await fs.writeFile(path.join(root,'dist/index.html'),'<html></html>');
  const sources={};for(const [key,file]of Object.entries({tesgen:'tesgen.csv',bilhetes:'bilhetes.csv',teto:'teto_orcamentario.csv'})){
    const data='PCDP;nome\n000001/26;Pessoa de teste\n';await fs.writeFile(path.join(root,'public/dados',file),data);sources[key]={sha256:crypto.createHash('sha256').update(data).digest('hex')};
  }
  await fs.writeFile(path.join(root,'public/dados/manifesto.json'),JSON.stringify({sources}));
  const result=await generateSnapshot({root});assert.deepEqual(result.rows,{tesgen:1,bilhetes:1,teto:1});
  assert.equal(await fs.readFile(path.join(root,'dados.js'),'utf8'),await fs.readFile(path.join(root,'dist/dados.js'),'utf8'));
  await fs.appendFile(path.join(root,'public/dados/bilhetes.csv'),'registro;alterado\n');
  await assert.rejects(generateSnapshot({root,allowMissing:true}),/Hash divergente/);
}));
