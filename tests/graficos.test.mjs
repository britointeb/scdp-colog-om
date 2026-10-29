import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {makeCsv,makeXlsx,formatCell} from '../servicos/exportar.js';
import {stackedOption,pieOption,bubbleOption} from '../servicos/graficos.js';
import {entityHref,readRoute} from '../servicos/rotas.js';
const data={columns:[{key:'name',label:'Proposto',type:'text'},{key:'count',label:'PCDPs',type:'number'},{key:'amount',label:'Valor geral',type:'money'}],rows:[{name:'JOÃO & SILVA',count:2,amount:1234.56},{name:'=HYPERLINK("x")',count:1,amount:-12.34}]};
test('CSV preserva números e protege textos que seriam interpretados como fórmulas',()=>{
 const csv=makeCsv(data);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"1234.56"'));assert.ok(csv.includes("\"'=HYPERLINK"));assert.ok(csv.includes('"-12.34"'));
});
test('XLSX contém planilha, cabeçalhos, números, estilos e textos escapados',()=>{
 const files=unzipSync(makeXlsx(data,'Título da análise')),sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
 assert.ok(files['[Content_Types].xml']);assert.ok(files['xl/styles.xml']);assert.ok(sheet.includes('JOÃO &amp; SILVA'));assert.ok(sheet.includes('<v>1234.56</v>'));assert.ok(sheet.includes('t="inlineStr"'));assert.ok(!sheet.includes('<f>'));assert.ok(sheet.includes('topLeftCell="A4"'));assert.ok(sheet.includes('ref="A3:C5"'));
});
test('barras em 100% fecham por mês e mantêm os dados absolutos intactos',()=>{
 const d={columns:[{key:'month',label:'Mês',type:'text'},{key:'a',label:'Até 15',type:'number'},{key:'b',label:'Acima de 15',type:'number'}],rows:[{month:'2026-08',a:3,b:1},{month:'2026-09',a:0,b:0}]};
 const before=JSON.stringify(d),option=stackedOption(d,{percent:true});assert.equal(option.series[0].data[0],75);assert.equal(option.series[1].data[0],25);assert.equal(option.series[0].data[1],0);assert.equal(option.yAxis.max,100);assert.equal(JSON.stringify(d),before);
});
test('pizza mantém a soma ao agrupar categorias excedentes',()=>{
 const d={columns:data.columns,rows:Array.from({length:20},(_,i)=>({name:'Pessoa '+i,count:i+1,amount:i}))},option=pieOption(d,'count');
 assert.equal(option.series[0].data.length,13);assert.equal(option.series[0].data.reduce((s,r)=>s+r.value,0),210);assert.ok(option.series[0].data.at(-1).name.startsWith('Outros'));
});
test('bolhas só representam eventos existentes, com rótulos numéricos',()=>{
 const d={rows:[{month:'2026-08',status:'Concluída',count:0},{month:'2026-09',status:'Concluída',count:8}]},option=bubbleOption(d);
 assert.equal(option.series[0].type,'scatter');assert.equal(option.series[0].data.length,1);assert.deepEqual(option.series[0].data[0].value,['2026-09','Concluída',8]);assert.equal(option.series[0].label.show,true);
});
test('links de PCDP preservam UG, ano e sufixo de complementação',()=>{
 const key='160467|019584/26-1C';assert.deepEqual(readRoute(entityHref('pcdp',key)),{page:'pcdp',key});
 assert.deepEqual(readRoute(entityHref('proposto','JOÃO DA SILVA')),{page:'proposto',key:'JOÃO DA SILVA'});
 assert.equal(readRoute('#inexistente').page,'viagens');assert.equal(readRoute('#pcdp/%invalido').key,'');
});
test('formatos de valor e percentual usam notação brasileira',()=>{
 assert.ok(formatCell(1234.56,{type:'money'}).includes('1.234,56'));assert.equal(formatCell(25,{type:'percent'}),'25%');assert.equal(formatCell(null),'—');
});
