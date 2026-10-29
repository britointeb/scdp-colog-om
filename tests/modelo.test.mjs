import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,filterModel,financialSummary,makeTrips} from '../servicos/modelo.js';
import {itinerary} from '../servicos/itinerarios.js';
const ne='1604672026NE000028';
const ledger=(extra={})=>({'Doc - Exercício Ano':'2026','Emitente - UG Código':'160467','NE CCor Número':ne,'Natureza Despesa Detalhada Código':'33903301','Natureza Despesa Detalhada Nome':'PASSAGENS PARA O PAIS','Emissão - Dia Data Completa':'15/08/2026','DESPESAS EMPENHADAS (CONTROLE EMPENHO)':'100,00',...extra});
const ticket=(extra={})=>({PCDP:'000001/26',nome_proposto:'Pessoa A',UG:'160467',empenho:ne,tipo_viagem:'Nacional',valor_emitido:'10,00',periodo_viagem_inicio:'2026-08-09',periodo_viagem_fim:'2026-08-12',data_solicitacao:'2026-08-01',meio_transporte:'Aéreo',total_pcdp_emitido:'100,00',total_pcdp_a_emitir:'0,00',...extra});
const teto=(extra={})=>({PCDP:'000001/26',nome_proposto:'Pessoa A',UG:'160467',empenho:ne,tipo_viagem:'Nacional',valor_realizado:'80,00',valor_em_andamento:'20,00',periodo_inicio:'01/01/2026',periodo_fim:'26/10/2026',componente:'1',...extra});
test('liquidação e pagamento incorporam RAP sem duplicar cancelamento agregado',()=>{
 const d=buildModel({tesgen:[ledger({'DESPESAS LIQUIDADAS (CONTROLE EMPENHO)':'30,00','RESTOS A PAGAR PROCESSADOS LIQUIDADOS':'2,00','RESTOS A PAGAR NAO PROCESSADOS LIQUIDADOS':'3,00','DESPESAS PAGAS (CONTROLE EMPENHO)':'40,00','RESTOS A PAGAR PROCESSADOS PAGOS':'5,00','RESTOS A PAGAR NAO PROCESSADOS PAGOS':'6,00','RESTOS A PAGAR CANCELADOS (PROC E N PROC)':'7,00','RESTOS A PAGAR NAO PROCESSADOS CANCELADOS':'7,00','RESTOS A PAGAR NAO PROCESSADOS BLOQUEADOS':'8,00'})],bilhetes:[ticket()],teto:[]});
 const s=financialSummary(d.tesgen);assert.equal(s.liquidatedCents,3500);assert.equal(s.paidCents,5100);assert.equal(s.canceledCents,700);assert.equal(s.toLiquidateCents,5000);assert.equal(s.toPayCents,3400);assert.equal(s.reconciliation.liquidation.status,'calculated');assert.equal(s.reconciliation.payment.differenceCents,null);
});
test('TESGEN restrita à união de empenhos e provisão por natureza, sem multiplicar linhas',()=>{
 const provision=ledger({'NE CCor Número':'','Doc - Tipo Código':'NC','PROVISAO RECEBIDA':'150,00','DESPESAS EMPENHADAS (CONTROLE EMPENHO)':''});
 const d=buildModel({tesgen:[ledger(),ledger({'NE CCor Número':'1604672026NE999999'}),provision],bilhetes:[ticket(),ticket()],teto:[teto()]});
 assert.equal(d.tesgen.length,2);assert.equal(d.meta.excluded,1);assert.equal(financialSummary(d.tesgen).availableCents,5000);
 assert.equal(filterModel(d,{commitment:[ne]}).tesgen.length,2);
});
test('filtros aceitam vários valores e seleção vazia produz zero registros',()=>{
 const d=buildModel({tesgen:[ledger()],bilhetes:[ticket(),ticket({PCDP:'000002/26',nome_proposto:'Pessoa B'})],teto:[]});
 assert.equal(filterModel(d,{pcdp:['000001/26','000002/26']}).bilhetes.length,2);
 assert.equal(filterModel(d,{pcdp:[]}).bilhetes.length,0);assert.equal(filterModel(d,{pcdp:[]}).tesgen.length,0);
 assert.equal(filterModel(d,{person:['PESSOA B']}).bilhetes.length,1);
});
test('busca geral alcança qualquer campo bruto e observação seleciona vínculos',()=>{
 const d=buildModel({tesgen:[ledger({'Doc - Observação Texto':'Missão amazônica','PI Nome':'Campo especial'})],bilhetes:[ticket()],teto:[teto()]});
 assert.equal(filterModel(d,{query:'campo especial'}).bilhetes.length,1);
 assert.equal(filterModel(d,{observation:'AMAZONICA'}).teto.length,1);
 assert.equal(filterModel(d,{observation:'ausente'}).tesgen.length,0);
});
test('filtro de transporte preserva Teto das PCDPs relacionadas',()=>{
 const d=buildModel({tesgen:[ledger()],bilhetes:[ticket()],teto:[teto()]});
 const f=filterModel(d,{transport:['Aéreo']});assert.equal(f.teto.length,1);assert.equal(makeTrips(f)[0].valueCents,10000);
});
test('valor da PCDP usa Teto uma vez por componente na última cobertura',()=>{
 const d=buildModel({tesgen:[ledger()],bilhetes:[ticket(),ticket()],teto:[teto({periodo_fim:'01/09/2026',valor_realizado:'10,00'}),teto(),teto()]});
 const trips=makeTrips(d);assert.equal(trips.length,1);assert.equal(trips[0].valueCents,10000);assert.equal(trips[0].duration,3);assert.equal(trips[0].lead,8);
});
test('totais repetidos de Bilhetes não aumentam o valor geral',()=>{
 const d=buildModel({tesgen:[],bilhetes:[ticket(),ticket({situacao_bilhete:'Emitido'})],teto:[]});
 assert.equal(makeTrips(d)[0].valueCents,10000);
});
test('itinerário alinha períodos, rotas, meios e companhias por posição',()=>{
 const legs=itinerary({PCDP:'1/26',trechos:'Brasília / Rio de Janeiro Rio de Janeiro / Brasília',periodo_trechos:'17/08/2026 08:55 - 17/08/2026 10:40 21/08/2026 12:50 - 21/08/2026 14:35',meio_transporte:'Aéreo Aéreo',companhia:'GOL Linhas Aéreas Inteligentes GOL Linhas Aéreas Inteligentes'});
 assert.equal(legs.length,2);assert.equal(legs[0].from.name,'Brasília');assert.equal(legs[1].from.name,'Rio de Janeiro');assert.equal(legs[1].period.slice(0,10),'21/08/2026');assert.equal(legs[1].carrier,'GOL Linhas Aéreas Inteligentes');assert.ok(legs.every(l=>l.confirmed));
});
test('trecho truncado ou companhia ambígua permanece identificado',()=>{
 const l=itinerary({trechos:'de Janeiro',periodo_trechos:'',companhia:'BRASIL'});assert.equal(l[0].confirmed,false);assert.equal(l[0].from,null);assert.equal(l[0].route,'de Janeiro');
});
test('último valor do bilhete considera o horário do evento no mesmo dia',()=>{
 const d=buildModel({tesgen:[],teto:[],bilhetes:[ticket({numero_bilhete:'123',data_evento:'10/08/2026 08:00',valor_tarifa:'10,00'}),ticket({numero_bilhete:'123',data_evento:'10/08/2026 18:00',valor_tarifa:'20,00'})]});
 assert.equal(makeTrips(d)[0].components.valor_tarifa,2000);
});
const completeLedger=extra=>ledger({
 'DESPESAS LIQUIDADAS (CONTROLE EMPENHO)':'50,00','RESTOS A PAGAR PROCESSADOS LIQUIDADOS':'0,00','RESTOS A PAGAR NAO PROCESSADOS LIQUIDADOS':'0,00',
 'DESPESAS PAGAS (CONTROLE EMPENHO)':'30,00','RESTOS A PAGAR PROCESSADOS PAGOS':'0,00','RESTOS A PAGAR NAO PROCESSADOS PAGOS':'0,00',
 'RESTOS A PAGAR NAO PROCESSADOS BLOQUEADOS':'10,00','RESTOS A PAGAR CANCELADOS (PROC E N PROC)':'5,00',...extra,
});
test('duas equações conciliam saldos próprios da fonte sem duplicar bloqueado',()=>{
 const d=buildModel({tesgen:[completeLedger({'DESPESAS A LIQUIDAR (CONTROLE EMPENHO)':'35,00','A LIQUIDAR':'999,00','DESPESAS A PAGAR (CONTROLE EMPENHO)':'55,00'})],bilhetes:[ticket()],teto:[]});
 const s=financialSummary(d.tesgen);assert.equal(s.toLiquidateCents,3500);assert.equal(s.toPayCents,5500);
 for(const c of Object.values(s.reconciliation)){assert.equal(c.status,'reconciled');assert.equal(c.totalCents,10000);assert.equal(c.differenceCents,0);assert.equal(c.source,'source');}
});
test('divergência na liquidação não altera a conferência por pagamento',()=>{
 const d=buildModel({tesgen:[completeLedger({'DESPESAS A LIQUIDAR':'30,00','DESPESAS A PAGAR':'55,00'})],bilhetes:[ticket()],teto:[]});
 const s=financialSummary(d.tesgen);assert.equal(s.reconciliation.liquidation.differenceCents,500);assert.equal(s.reconciliation.liquidation.status,'divergent');assert.equal(s.reconciliation.payment.status,'reconciled');
});
test('saldo derivado fecha a composição mas não é apresentado como conferência independente',()=>{
 const d=buildModel({tesgen:[completeLedger({})],bilhetes:[ticket()],teto:[]}),s=financialSummary(d.tesgen);
 assert.equal(s.toLiquidateCents,3500);assert.equal(s.toPayCents,5500);
 for(const c of Object.values(s.reconciliation)){assert.equal(c.status,'calculated');assert.equal(c.complete,true);assert.equal(c.differenceCents,null);}
});
test('saldo parcial identifica parcelas ausentes e não declara conciliação',()=>{
 const d=buildModel({tesgen:[ledger({'DESPESAS LIQUIDADAS (CONTROLE EMPENHO)':'50,00'})],bilhetes:[ticket()],teto:[]}),s=financialSummary(d.tesgen);
 assert.equal(s.toLiquidateCents,5000);assert.equal(s.reconciliation.liquidation.complete,false);assert.ok(s.reconciliation.liquidation.missing.includes('Bloqueado'));assert.equal(s.reconciliation.liquidation.differenceCents,null);
 assert.equal(s.reconciliation.payment.status,'unavailable');assert.equal(financialSummary([]).reconciliation.liquidation.status,'unavailable');
});
test('saldo residual negativo permanece visível para análise',()=>{
 const d=buildModel({tesgen:[completeLedger({'DESPESAS PAGAS (CONTROLE EMPENHO)':'120,00'})],bilhetes:[ticket()],teto:[]});
 assert.equal(financialSummary(d.tesgen).toPayCents,-3500);
});
