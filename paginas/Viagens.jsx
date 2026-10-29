import React,{useMemo,useState} from 'react';
import {makeTrips,groupTrips,distinct} from '../servicos/modelo.js';
import {citySummary,tripItinerary} from '../servicos/itinerarios.js';
import {GroupChart,Table,MapView,percent} from '../componentes/Painel.jsx';
import {money,number,date} from '../componentes/Grafico.jsx';
import {PcdpLink,PersonLink} from '../componentes/Navegacao.jsx';
const scopes=[['Geral',()=>true],['Nacional',t=>t.tripType==='Nacional'],['Internacional',t=>t.tripType==='Internacional']];
export const tripColumns=(trips,onTrip)=>[
  {label:'PCDP',value:t=>t.pcdp,render:t=><PcdpLink pcdp={t.pcdp} tripKey={t.key}/>},
  {label:'Proposto',value:t=>t.person},{label:'Tipo',value:t=>t.tripType},{label:'Situação',value:t=>t.status},
  {label:'Valor geral',value:t=>money(t.valueCents),sort:t=>t.valueCents},
  {label:'% valor',value:t=>percent(t.valueCents,trips.reduce((s,t)=>s+(t.valueCents||0),0))},
  {label:'% PCDP',value:()=>percent(1,trips.length)},
  {label:'Início',value:t=>date(t.start),sort:t=>t.start},{label:'Fim',value:t=>date(t.end),sort:t=>t.end},
  {label:'Dias',value:t=>t.duration},{label:'Antecedência',value:t=>t.lead},
  {label:'Trechos',value:t=>t.route},{label:'Fonte do valor',value:t=>t.valueSource},
];
export default function Viagens({data,onTrip,onPerson}){
  const trips=useMemo(()=>makeTrips(data),[data]),[locationScope,setLocationScope]=useState('Geral');
  const total=trips.reduce((s,t)=>s+(t.valueCents||0),0);
  const charts=[['PCDP',t=>t.pcdp+' · UG '+t.ug],['Propostos',t=>t.person],['Tipo de viagem',t=>t.tripType],['Situação da PCDP',t=>t.status],['Meio de transporte',t=>t.transports.length?t.transports:['Não informado']],['Companhia',t=>t.carriers.length?t.carriers:['Não informado']],['Agência / compra direta',t=>t.agencies.length?t.agencies:['Não informado']]];
  const extremes=[];
  for(const [label,test]of scopes){const subset=trips.filter(test);for(const [metric,key,dir]of [['Viagem mais demorada','duration',-1],['Maior valor geral','valueCents',-1],['Viagem mais antiga','start',1],['Viagem mais recente','start',-1],['Menor antecedência','lead',1],['Maior antecedência','lead',-1]]){const eligible=subset.filter(t=>t[key]!==null&&t[key]!==undefined&&t[key]!==''),sorted=[...eligible].sort((a,b)=>(typeof a[key]==='number'?a[key]-b[key]:String(a[key]).localeCompare(String(b[key])))*dir);const t=sorted[0];extremes.push({key:label+metric,scope:label,metric,trip:t,measure:t?(key==='valueCents'?money(t[key]):key==='start'?date(t[key]):`${t[key]} dias`):'Sem informação',ties:t?eligible.filter(x=>x[key]===t[key]).length:0});}}
  const leaders=[];
  for(const [scope,test]of scopes){const grouped=groupTrips(trips.filter(test),t=>t.personKey).map(g=>({...g,name:g.trips[0].person,days:g.trips.reduce((s,t)=>s+(t.duration||0),0),cities:distinct(g.trips.flatMap(t=>tripItinerary(t).flatMap(l=>[l.from?.name,l.to?.name]))).length}));for(const [metric,key]of [['Maior valor total','value'],['Mais PCDPs','count'],['Mais dias de viagem','days'],['Mais locais visitados','cities']]){const sorted=[...grouped].sort((a,b)=>(b[key]||0)-(a[key]||0)),g=sorted[0];leaders.push({key:scope+metric,scope,metric,g,measure:g?(key==='value'?money(g.value):number(g[key])):'Sem informação'});}}
  for(const [scope,test] of scopes){const subset=trips.filter(test),categories=distinct(subset.flatMap(t=>Object.keys(t.expenses)));for(const category of categories){const gs=groupTrips(subset.filter(t=>t.expenses[category]!=null),t=>t.personKey).map(g=>({...g,name:g.trips[0].person,value:g.trips.reduce((s,t)=>s+(t.expenses[category]||0),0)})).sort((a,b)=>b.value-a.value);if(gs[0])leaders.push({key:scope+category,scope,metric:'Maior valor: '+category,g:gs[0],measure:money(gs[0].value)});}}
  const locations=citySummary(trips.filter(scopes.find(s=>s[0]===locationScope)[1]));
  return <><div className="section-intro"><h2>Viagens em perspectiva</h2><p>PCDPs únicas por UG · valor geral = realizado + em andamento do Teto; na ausência, total de referência de Bilhetes.</p></div><div className="charts-grid">{charts.map(([title,key])=><GroupChart key={title} title={title} rows={groupTrips(trips,key)} onClick={title==='PCDP'?r=>onTrip(r.trips[0].key):title==='Propostos'?r=>onPerson(r.trips[0].personKey):undefined} note={['Companhia','Meio de transporte','Agência / compra direta'].includes(title)?'PCDPs relacionadas a cada grupo · participações podem se sobrepor':undefined}/>)}</div>
    <Table title="Viagens em destaque" subtitle="Geral, nacional e internacional · empates indicados; abra a PCDP para consultar a ficha" rows={extremes} columns={[{label:'Recorte',value:r=>r.scope},{label:'Destaque',value:r=>r.metric},{label:'Medida',value:r=>r.measure},{label:'Empates',value:r=>r.ties},{label:'PCDP',value:r=>r.trip?.pcdp,render:r=>r.trip?<PcdpLink pcdp={r.trip.pcdp} tripKey={r.trip.key}/>:'—'},{label:'Proposto',value:r=>r.trip?.person},{label:'Valor',value:r=>money(r.trip?.valueCents)},{label:'Trechos',value:r=>r.trip?.route}]} pageSize={9}/>
    <Table title="Propostos em destaque" subtitle="Valores de diárias, passagens e taxas seguem a cobertura dos componentes disponíveis no Teto; veja a ficha para a discriminação por natureza." rows={leaders} columns={[{label:'Recorte',value:r=>r.scope},{label:'Destaque',value:r=>r.metric},{label:'Proposto',value:r=>r.g?.name,render:r=>r.g?<PersonLink name={r.g.name} personKey={r.g.trips[0].personKey}/>:'—'},{label:'Medida',value:r=>r.measure},{label:'PCDPs',value:r=>r.g?.count},{label:'Dias conhecidos',value:r=>r.g?.days},{label:'Locais conhecidos',value:r=>r.g?.cities},{label:'Valor total',value:r=>money(r.g?.value)}]} pageSize={12}/>
    <div className="section-intro inline"><div><h2>Destinos e locais visitados</h2><p>Contagem distinta por cidade, PCDP e proposto, incluindo origens e destinos identificados.</p></div><select aria-label="Recorte dos destinos" value={locationScope} onChange={e=>setLocationScope(e.target.value)}>{scopes.map(([s])=><option key={s}>{s}</option>)}</select></div>
    <div className="charts-grid"><GroupChart title="Locais por PCDP" rows={locations}/><GroupChart title="Locais por proposto" rows={[...locations].sort((a,b)=>b.people-a.people)} countLabel="Propostos" countKey="people"/></div><MapView cities={locations}/>
    <Table title="Resumo dos destinos" rows={locations} columns={[{label:'Cidade',value:r=>r.name},{label:'País',value:r=>r.country},{label:'PCDPs',value:r=>r.count},{label:'% PCDPs do recorte',value:r=>percent(r.count,trips.length)},{label:'Propostos',value:r=>r.people},{label:'% propostos do recorte',value:r=>percent(r.people,distinct(trips.map(t=>t.personKey)).length)},{label:'Valor relacionado',value:r=>money(r.value)},{label:'% valor do recorte',value:r=>percent(r.value,total)}]}/>
    <Table title="Resumo de PCDPs" subtitle="Percentuais sobre as PCDPs e os valores do recorte global; campos ausentes permanecem sem informação." rows={trips} columns={tripColumns(trips,onTrip)} filename="resumo_pcdp.csv"/>
  </>;
}
