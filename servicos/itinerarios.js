import cities from '../geografia/cidades.json' with {type:'json'};
import {normalizeText} from './dados.js';
import {distinct} from './modelo.js';
export {cities};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const cityPattern=new RegExp([...cities].sort((a,b)=>b.name.length-a.name.length).map(c=>escape(c.name)).join('|'),'giu');
const find=name=>cities.find(c=>normalizeText(c.name)===normalizeText(name));
const splitAligned=(text,n)=>{
  const raw=String(text||'').trim();if(!raw)return Array(n).fill('Não informado');
  const explicit=raw.split(/\s*[;|\n]\s*/).filter(Boolean);if(explicit.length===n)return explicit;
  if(n===1)return [raw];
  const words=raw.split(/\s+/);if(words.length%n===0){const len=words.length/n;const pieces=Array.from({length:n},(_,i)=>words.slice(i*len,(i+1)*len).join(' '));if(pieces.every(x=>x===pieces[0]))return pieces;}
  return Array(n).fill(raw+' (associação não confirmada)');
};
export function itinerary(row){
  const raw=row.raw||row,route=String(raw.trechos||''),periods=String(raw.periodo_trechos||'').match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/g)||[];
  const matches=[...route.matchAll(cityPattern)].map(m=>find(m[0]));
  const n=Math.max(periods.length,Math.ceil(matches.length/2),1),transports=splitAligned(raw.meio_transporte,n),carriers=splitAligned(raw.companhia,n);
  const routeRemainder=route.replace(cityPattern,'').replace(/[\/\s;|–-]/g,'');
  const aligned=matches.length===n*2&&!routeRemainder;
  return Array.from({length:n},(_,i)=>({pcdp:row.pcdp||raw.PCDP,person:row.person||raw.nome_proposto,index:i+1,period:periods[i]||raw.periodo_trechos||'Não informado',from:aligned?matches[i*2]:null,to:aligned?matches[i*2+1]:null,route:aligned?`${matches[i*2].name} → ${matches[i*2+1].name}`:route||'Não informado',transport:transports[i],carrier:carriers[i],confirmed:aligned&&!transports[i].includes('não confirmada')&&!carriers[i].includes('não confirmada'),sourceRow:row.id||''}));
}
export function tripItinerary(trip){
  const map=new Map();for(const r of trip.bilhetes)for(const leg of itinerary(r)){const k=[leg.period,leg.route,leg.transport,leg.carrier].join('|');if(!map.has(k))map.set(k,leg);}
  return [...map.values()].map(l=>({...l,pcdpKey:trip.key,tripValue:trip.valueCents})).sort((a,b)=>{const iso=x=>x.period.slice(0,10).split('/').reverse().join('-')+x.period.slice(10,16);return iso(a).localeCompare(iso(b));});
}
export function citySummary(trips){
  const groups=new Map();for(const trip of trips){const legs=tripItinerary(trip),names=distinct(legs.flatMap(l=>[l.from?.name,l.to?.name]));for(const name of names){if(!groups.has(name))groups.set(name,[]);groups.get(name).push(trip);}}
  return [...groups].map(([name,ts])=>({...find(name),count:ts.length,people:distinct(ts.map(t=>t.personKey)).length,value:ts.reduce((s,t)=>s+(t.valueCents||0),0),trips:ts})).sort((a,b)=>b.count-a.count);
}
