import {build} from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateSnapshot} from './fotografia.mjs';
import {PAGES_DATA,verifyPagesArtifact} from './verificar_pages.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pages=process.argv.includes('--pages');
const output=path.join(root,'dist',...(pages?['pages']:[]));
const offline=pages?path.join(output,'offline'):path.join(root,'offline');
if(!pages)await generateSnapshot({allowMissing:true});
await build({root,configFile:false,publicDir:false,define:{'process.env.NODE_ENV':'"production"'},build:{outDir:offline,emptyOutDir:true,target:'es2022',cssCodeSplit:false,lib:{entry:path.join(root,'app.jsx'),name:'SCDP',formats:['iife'],fileName:()=> 'painel.js',cssFileName:'painel'},rollupOptions:{output:{inlineDynamicImports:true}}}});
await fs.mkdir(path.join(output,'offline'),{recursive:true});
await fs.copyFile(path.join(root,'index.html'),path.join(output,'index.html'));
if(pages){
  // A publicacao nunca copia a fotografia ou os CSVs existentes na maquina.
  await fs.writeFile(path.join(output,'dados.js'),PAGES_DATA,'utf8');
  await fs.writeFile(path.join(output,'.nojekyll'),'','utf8');
  await verifyPagesArtifact(output);
  console.log('GitHub Pages pronto em dist/pages, com importacao de CSVs pelo navegador.');
}else{
  await fs.copyFile(path.join(root,'dados.js'),path.join(output,'dados.js'));
  for(const file of ['painel.js','painel.css'])await fs.copyFile(path.join(offline,file),path.join(output,'offline',file));
  console.log('Pronto: abra index.html por duplo clique. Nenhum servidor é necessário.');
}
