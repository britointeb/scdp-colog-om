import {normalizeDatasets, normalizeText, normalizeCommitment, parseMoneyToCents, parseDate, sumCents} from './dados.js';

export const FINANCE = {
  provisionCents:['PROVISAO RECEBIDA'],
  committedCents:['DESPESAS EMPENHADAS (CONTROLE EMPENHO)'],
  currentLiquidatedCents:['DESPESAS LIQUIDADAS (CONTROLE EMPENHO)'],
  processedLiquidatedCents:['RESTOS A PAGAR PROCESSADOS LIQUIDADOS'],
  nonProcessedLiquidatedCents:['RESTOS A PAGAR NAO PROCESSADOS LIQUIDADOS'],
  currentPaidCents:['DESPESAS PAGAS (CONTROLE EMPENHO)'],
  processedPaidCents:['RESTOS A PAGAR PROCESSADOS PAGOS'],
  nonProcessedPaidCents:['RESTOS A PAGAR NAO PROCESSADOS PAGOS'],
  toLiquidateSourceCents:['DESPESAS A LIQUIDAR (CONTROLE EMPENHO)','DESPESAS A LIQUIDAR','A LIQUIDAR'],
  toPaySourceCents:['DESPESAS A PAGAR (CONTROLE EMPENHO)','DESPESAS A PAGAR','A PAGAR'],
  blockedCents:['DESPESAS BLOQUEADAS','RESTOS A PAGAR NAO PROCESSADOS BLOQUEADOS','RESTOS A PAGAR PROCESSADOS BLOQUEADOS'],
  canceledCents:['DESPESAS CANCELADAS (CONTROLE EMPENHO)','RESTOS A PAGAR CANCELADOS (PROC E N PROC)'],
  availableSourceCents:['CREDITO DISPONIVEL','CREDITO DISPONÍVEL','DOTACAO DISPONIVEL','DISPONIVEL'],
};
const clean=v=>['-9','NAO SE APLICA','NÃO SE APLICA'].includes(String(v||'').trim())?'':String(v??'').trim();
export const distinct=v=>[...new Set(v.filter(Boolean))];
const present=v=>v!==null&&v!==undefined&&v!=='';
const total=v=>{const a=v.filter(present);return a.length?a.reduce((s,n)=>s+n,0):null;};
const money=v=>{try{return parseMoneyToCents(v);}catch{return null;}};
const rawSum=(raw,fields)=>total(fields.map(k=>money(raw[k])));
export const days=(a,b)=>a&&b?Math.round((Date.parse(b+'T12:00Z')-Date.parse(a+'T12:00Z'))/86400000):null;
export const active=v=>Array.isArray(v)||!!v&&v!=='all';
const selected=(v,x)=>!active(v)||(Array.isArray(v)?v:[v]).includes(x);
export const INITIAL_FILTERS={year:'all',ug:'all',ugr:'all',person:'all',pcdp:'all',commitment:'all',subelement:'all',status:'all',tripType:'all',transport:'all',carrier:'all',agency:'all',action:'all',pi:'all',start:'',end:'',query:'',observation:''};
const search=r=>normalizeText(Object.values(r.raw).join(' '));

export function buildModel(raw) {
  const d=normalizeDatasets(raw), warnings=[];
  const columns=distinct(raw.tesgen.flatMap(Object.keys));
  const fieldMap=new Map(columns.map(k=>[normalizeText(k),k]));
  const ne=r=>r.commitment||normalizeCommitment(r.raw.empenho_vinculo)||normalizeCommitment(r.raw['Documento Número'],r.ug)||normalizeCommitment(r.raw['Documento CCor Número'],r.ug);
  d.tesgen=d.tesgen.map(r=>{
    const commitment=ne(r), ug=r.ug||commitment.slice(0,6);
    const n={...r,commitment,ug,category:clean(r.raw['Natureza Despesa Detalhada Nome'])||'Não informado',nature:clean(r.raw['Natureza Despesa Detalhada Código']),ugr:clean(r.raw['UG Responsável Código']),action:clean(r.raw['Ação Governo Código']),pi:clean(r.raw['PI Código PI'])};
    for(const [key,names] of Object.entries(FINANCE)) {
      let keys=distinct(names.map(k=>fieldMap.get(normalizeText(k))).filter(Boolean));
      if(['toLiquidateSourceCents','toPaySourceCents'].includes(key))keys=keys.slice(0,1);
      // The aggregate cancellation column already includes non-processed cancellations.
      if(key==='canceledCents'&&!keys.some(k=>normalizeText(k).includes('PROC E N PROC'))) keys.push(...columns.filter(k=>/^RESTOS A PAGAR (NAO )?PROCESSADOS CANCELADOS$/.test(normalizeText(k))));
      n[key]=rawSum(r.raw,keys);
    }
    n.liquidatedCents=total([n.currentLiquidatedCents,n.processedLiquidatedCents,n.nonProcessedLiquidatedCents]);
    n.paidCents=total([n.currentPaidCents,n.processedPaidCents,n.nonProcessedPaidCents]);
    n.availableCents=n.availableSourceCents;
    n.search=search(n);return n;
  });
  for(const kind of ['bilhetes','teto'])d[kind]=d[kind].map(r=>({...r,search:search(r),agency:clean(r.raw.agencia_compra_direta)}));
  const refs=new Set([...d.bilhetes,...d.teto].map(r=>r.commitment).filter(Boolean));
  const natures=new Set(d.tesgen.filter(r=>refs.has(r.commitment)).map(r=>r.nature).filter(Boolean));
  const excluded=d.tesgen.filter(r=>!refs.has(r.commitment)&&!provisionMatch(r,natures));
  d.tesgen=d.tesgen.filter(r=>refs.has(r.commitment)||provisionMatch(r,natures));
  if(excluded.length)warnings.push(`${excluded.length} registros TESGEN excluídos por não pertencerem aos empenhos de Bilhetes/Teto nem à provisão/dotação nas naturezas relacionadas.`);
  if(!fieldMap.has('RESTOS A PAGAR PROCESSADOS LIQUIDADOS'))warnings.push('RAP processados liquidados: coluna ausente na fonte. Liquidado mostra a soma das parcelas disponíveis; a parcela ausente não foi presumida como zero.');
  if(!FINANCE.availableSourceCents.some(k=>fieldMap.has(normalizeText(k))))warnings.push('Disponível calculado = provisão recebida − empenhado. A fonte não contém saldo disponível autônomo; restos a pagar e períodos distintos exigem análise da cobertura.');
  const aggregates=d.tesgen.filter(r=>/AGREGADO/.test(r.raw.criterio_escopo||'')||r.nature.endsWith('-9'));
  if(aggregates.length)warnings.push(`${aggregates.length} registros de provisão/dotação têm elemento agregado (subitem -9). São exibidos como contexto do elemento, sem rateio para um subelemento.`);
  const notFound=[...refs].filter(k=>!d.tesgen.some(r=>r.commitment===k));
  if(notFound.length)warnings.push(`${notFound.length} empenhos de Bilhetes/Teto não foram localizados na TESGEN.`);
  return {...d,meta:{...d.meta,warnings,excluded:excluded.length,notFound,columns}};
}
function provisionMatch(r,natures){
  if(r.commitment)return false;
  if(!present(r.provisionCents)&&!['NC','ND'].includes(r.raw['Doc - Tipo Código']))return false;
  return natures.has(r.nature)||(r.nature.endsWith('-9')&&[...natures].some(n=>n.slice(0,6)===r.nature.slice(0,6)));
}

export function filterModel(d,filters={}){
  const f={...INITIAL_FILTERS,...filters},q=normalizeText(f.query),obs=normalizeText(f.observation);
  const common=r=>selected(f.year,r.year)&&selected(f.ug,r.ug)&&selected(f.commitment,r.commitment)&&(r.source==='teto'||!(f.start||f.end)||r.date&&(!f.start||r.date>=f.start)&&(!f.end||r.date<=f.end));
  const travel=r=>common(r)&&selected(f.person,r.personKey)&&selected(f.pcdp,r.pcdp)&&selected(f.tripType,r.tripType);
  let bilhetes=d.bilhetes.filter(travel),teto=d.teto.filter(travel);
  const tripId=r=>r.ug+'|'+r.pcdp;
  if(['transport','carrier','agency'].some(k=>active(f[k]))){bilhetes=bilhetes.filter(r=>selected(f.transport,r.transport)&&selected(f.carrier,r.carrier)&&selected(f.agency,r.agency));const ids=new Set(bilhetes.map(tripId));teto=teto.filter(r=>ids.has(tripId(r)));}
  if(active(f.status)){const ids=new Set([...bilhetes,...teto].filter(r=>selected(f.status,r.pcdpStatus||r.status)).map(tripId));bilhetes=bilhetes.filter(r=>ids.has(tripId(r)));teto=teto.filter(r=>ids.has(tripId(r)));}
  const ledger=d.tesgen.filter(r=>(common(r)||!r.commitment&&common({...r,commitment:Array.isArray(f.commitment)?f.commitment[0]:f.commitment}))&&selected(f.ugr,r.ugr)&&selected(f.action,r.action)&&selected(f.pi,r.pi)&&(selected(f.subelement,r.category)||r.nature.endsWith('-9')&&active(f.subelement)&&d.tesgen.some(n=>selected(f.subelement,n.category)&&n.nature.slice(0,6)===r.nature.slice(0,6)))&&(!obs||normalizeText(r.observation).includes(obs)));
  const fiscalScope=['ugr','action','pi','subelement'].some(k=>active(f[k]))||!!obs;
  if(fiscalScope){const keys=new Set(ledger.map(r=>r.commitment).filter(Boolean));bilhetes=bilhetes.filter(r=>keys.has(r.commitment));teto=teto.filter(r=>keys.has(r.commitment));}
  if(q){
    const fiscalKeys=new Set(ledger.filter(r=>r.search.includes(q)).map(r=>r.commitment).filter(Boolean));
    bilhetes=bilhetes.filter(r=>r.search.includes(q)||fiscalKeys.has(r.commitment));
    teto=teto.filter(r=>r.search.includes(q)||fiscalKeys.has(r.commitment));
  }
  const context=['person','pcdp','status','tripType','transport','carrier','agency','commitment'].some(k=>active(f[k]))||fiscalScope||!!q;
  const related=new Set([...bilhetes,...teto].map(r=>r.commitment).filter(Boolean));
  if(q)ledger.filter(r=>r.search.includes(q)).forEach(r=>r.commitment&&related.add(r.commitment));
  const natures=new Set(ledger.filter(r=>related.has(r.commitment)).map(r=>r.nature));
  const tesgen=ledger.filter(r=>!context||related.has(r.commitment)||(!obs&&provisionMatch(r,natures))||(q&&r.search.includes(q)));
  return {tesgen,bilhetes,teto,meta:d.meta,filters:f,scopeContext:context};
}

export function financialSummary(rows){
  const fields=distinct([...Object.keys(FINANCE),'liquidatedCents','paidCents']);
  const s=Object.fromEntries(fields.map(k=>[k,sumCents(rows,k)]));
  s.availableCents=s.availableSourceCents??(s.provisionCents!=null&&s.committedCents!=null?s.provisionCents-s.committedCents:null);
  const columns=new Set(rows.flatMap(r=>Object.keys(r.raw||{})).map(normalizeText));
  const reconcile=(stage,source,stageFields)=>{
    const missing=[];
    if(s[stage]==null)missing.push(stage==='liquidatedCents'?'Liquidado':'Pago');
    if(s.blockedCents==null)missing.push('Bloqueado');
    if(s.canceledCents==null)missing.push('Cancelado');
    for(const key of stageFields)if(!FINANCE[key].some(k=>columns.has(normalizeText(k))))missing.push(FINANCE[key][0]);
    const independent=s[source]!=null;
    const balanceCents=independent?s[source]:s.committedCents!=null&&s[stage]!=null?s.committedCents-s[stage]-(s.blockedCents??0)-(s.canceledCents??0):null;
    const complete=s.committedCents!=null&&missing.length===0;
    const totalCents=complete&&balanceCents!=null?s[stage]+balanceCents+s.blockedCents+s.canceledCents:null;
    // A residual derived from the same equation is a calculated balance, never independent evidence of reconciliation.
    const differenceCents=independent&&totalCents!=null?s.committedCents-totalCents:null;
    return {balanceCents,source:independent?'source':balanceCents!=null?'calculated':'unavailable',complete,missing:distinct(missing),totalCents,differenceCents,status:balanceCents==null?'unavailable':!independent?'calculated':!complete?'incomplete':differenceCents===0?'reconciled':'divergent'};
  };
  s.reconciliation={liquidation:reconcile('liquidatedCents','toLiquidateSourceCents',['currentLiquidatedCents','processedLiquidatedCents','nonProcessedLiquidatedCents']),payment:reconcile('paidCents','toPaySourceCents',['currentPaidCents','processedPaidCents','nonProcessedPaidCents'])};
  s.toLiquidateCents=s.reconciliation.liquidation.balanceCents;
  s.toPayCents=s.reconciliation.payment.balanceCents;
  return s;
}
export function filterOptions(d){
  const all=[...d.tesgen,...d.bilhetes,...d.teto], t=[...d.bilhetes,...d.teto];
  const options=(rows,field,label)=>distinct(rows.map(r=>r[field])).sort((a,b)=>a.localeCompare(b,'pt-BR')).map(value=>({value,label:label?.(value)||value}));
  return {year:options(all,'year').reverse(),ug:options(all,'ug'),ugr:options(d.tesgen,'ugr'),person:options(t,'personKey',v=>t.find(r=>r.personKey===v)?.person),pcdp:options(t,'pcdp'),commitment:options(all,'commitment'),subelement:options(d.tesgen,'category'),status:options(t.map(r=>({...r,s:r.pcdpStatus||r.status})),'s'),tripType:options(t,'tripType'),transport:options(d.bilhetes,'transport'),carrier:options(d.bilhetes,'carrier'),agency:options(d.bilhetes,'agency'),action:options(d.tesgen,'action'),pi:options(d.tesgen,'pi')};
}

function dedup(rows,key){const m=new Map();for(const r of rows)m.set(key(r),r);return [...m.values()];}
export const ticketEvents=rows=>dedup(rows,r=>[r.ug,r.pcdp,r.ticket,r.passage,r.status,r.raw.data_evento,r.route,r.raw.valor_emitido,r.raw.valor_a_emitir,r.raw.valor_a_devolver].join('|'));
export function makeTrips(d){
  const natureByNe=new Map();for(const row of d.tesgen){if(!row.commitment)continue;if(!natureByNe.has(row.commitment))natureByNe.set(row.commitment,new Set());natureByNe.get(row.commitment).add(row.category);}
  const groups=new Map();for(const row of [...d.bilhetes,...d.teto]){const k=row.ug+'|'+row.pcdp;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}
  return [...groups].map(([key,rows])=>{
    const eventOrder=r=>(r.eventDate||'')+' '+(String(r.raw.data_evento||'').match(/\d{2}:\d{2}/)?.[0]||'00:00');
    const b=rows.filter(r=>r.source==='bilhetes').sort((a,b)=>(b.reportEnd||'').localeCompare(a.reportEnd||'')||eventOrder(b).localeCompare(eventOrder(a)));
    const t=rows.filter(r=>r.source==='teto').sort((a,b)=>(b.coverageEnd||'').localeCompare(a.coverageEnd||''));
    const latest=dedup([...t].reverse(),r=>[r.commitment,r.component||r.raw.bloco_pcdp||'',r.personKey].join('|'));
    const ref=b[0]||t[0],events=ticketEvents(b);
    const snapshot=b[0]?.raw;
    const realizedCents=sumCents(latest,'realizedCents'),inProgressCents=sumCents(latest,'inProgressCents');
    const ticketValue=snapshot?total([money(snapshot.total_pcdp_emitido),money(snapshot.total_pcdp_a_emitir)]):null;
    const valueCents=t.length?total([realizedCents,inProgressCents]):ticketValue??total([sumCents(events,'issuedCents'),sumCents(events,'toIssueCents')]);
    const expenses={};for(const r of latest){const cats=[...(natureByNe.get(r.commitment)||[])],name=cats.length===1?cats[0]:cats.length?'Empenho com múltiplas naturezas':'Natureza não identificada';expenses[name]=(expenses[name]||0)+(r.realizedCents||0)+(r.inProgressCents||0);}if(!t.length&&valueCents!=null)expenses['Passagens (Bilhetes)']=valueCents;
    const tickets=dedup([...b].reverse(),r=>r.ticket||r.passage||r.id);
    const components={};for(const field of ['valor_tarifa','valor_embarque','valor_servico'])components[field]=total(tickets.map(r=>money(r.raw[field])));
    for(const [field,normalized] of [['valor_a_emitir','toIssueCents'],['valor_emitido','issuedCents'],['valor_a_devolver','toRefundCents']])components[field]=snapshot?money(snapshot['total_pcdp_'+field.replace('valor_','')])??sumCents(events,normalized):null;
    const start=b.find(r=>r.tripStart)?.tripStart||'',end=b.find(r=>r.tripEnd)?.tripEnd||'',request=b.find(r=>r.requestDate)?.requestDate||'';
    return {key,pcdp:ref.pcdp,ug:ref.ug,person:ref.person,personKey:ref.personKey,tripType:ref.tripType||'Não informado',status:b[0]?.pcdpStatus||t[0]?.status||'Não informado',start,end,request,duration:days(start,end),lead:request&&start?days(request,start):b.find(r=>r.leadDays!=null)?.leadDays??null,valueCents,realizedCents,inProgressCents,expenses,valueSource:t.length?'Teto · realizado + em andamento':'Bilhetes · total de referência da PCDP',commitments:distinct(rows.map(r=>r.commitment)),route:distinct(b.map(r=>r.route)).join(' • '),transports:distinct(b.map(r=>r.transport)),carriers:distinct(b.map(r=>r.carrier)),agencies:distinct(b.map(r=>r.agency)),bilhetes:b,teto:t,events,components};
  });
}
export function groupTrips(trips,key){
  const m=new Map();for(const trip of trips){const names=distinct(Array.isArray(key(trip))?key(trip):[key(trip)||'Não informado']);for(const name of names){if(!m.has(name))m.set(name,[]);m.get(name).push(trip);}}
  return [...m].map(([name,t])=>({name,count:t.length,people:distinct(t.map(r=>r.personKey)).length,value:total(t.map(r=>r.valueCents)),trips:t})).sort((a,b)=>(b.value||0)-(a.value||0));
}
export function commitments(d,trips=makeTrips(d)){
  const keys=distinct([...d.tesgen,...d.bilhetes,...d.teto].map(r=>r.commitment));
  return keys.map(key=>{const rows=d.tesgen.filter(r=>r.commitment===key),ts=trips.filter(t=>t.commitments.includes(key));const dates=rows.filter(r=>r.date&&r.raw['Documento Número']?.includes('NE')).map(r=>r.date).sort();const observed=rows.map(r=>r.date).filter(Boolean).sort();return {key,...financialSummary(rows),date:dates[0]||'',firstMovement:observed[0]||'',lastMovement:observed.at(-1)||'',trips:ts,rows};});
}
