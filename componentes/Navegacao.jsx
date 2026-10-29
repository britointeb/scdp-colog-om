import React,{createContext,useContext,useMemo} from 'react';
import {normalizeText} from '../servicos/dados.js';
import {entityHref} from '../servicos/rotas.js';
const Context=createContext({people:[],trips:[],onTrip:()=>{},onPerson:()=>{}});
export function NavegacaoProvider({data,onTrip,onPerson,children}){
  const value=useMemo(()=>{
    const people=new Map(),trips=new Map();
    for(const row of [...(data?.bilhetes||[]),...(data?.teto||[])]){
      if(row.personKey)people.set(row.personKey,row.person);
      if(row.pcdp)trips.set(row.ug+'|'+row.pcdp,{key:row.ug+'|'+row.pcdp,pcdp:row.pcdp,ug:row.ug});
    }
    return {people:[...people].map(([key,name])=>({key,name})),trips:[...trips.values()],onTrip,onPerson};
  },[data,onTrip,onPerson]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function PcdpLink({pcdp,ug,tripKey,children}){
  const nav=useContext(Context),trip=nav.trips.find(t=>tripKey?t.key===tripKey:t.pcdp===pcdp&&(!ug||t.ug===ug));
  const key=tripKey||trip?.key||(ug?ug+'|'+pcdp:pcdp);
  return <a className="link entity-link pcdp-link" href={entityHref('pcdp',key)} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.button===0){e.preventDefault();nav.onTrip(key);}}}>{children||pcdp}</a>;
}
export function PersonLink({name,personKey,children}){
  const nav=useContext(Context),key=personKey||nav.people.find(p=>normalizeText(p.name)===normalizeText(name))?.key||normalizeText(name);
  return <a className="link entity-link person-link" href={entityHref('proposto',key)} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.button===0){e.preventDefault();nav.onPerson(key);}}}>{children||name}</a>;
}
export function LinkedValue({label='',value,row={}}){
  const nav=useContext(Context);
  if(value==null||value==='')return '—';
  if(typeof value!=='string')return value;
  const normalized=normalizeText(label);
  if(normalized.includes('PCDP')){
    const pieces=value.split(/(\d{4,6}\/\d{2,4}(?:-\d+[A-Z]*)?)/g);
    return <>{pieces.map((s,i)=>/^\d{4,6}\//.test(s)?<PcdpLink key={i} pcdp={s} ug={row.ug||row.t?.ug||row.trip?.ug||row.n?.key?.slice(0,6)}/>:s)}</>;
  }
  if(normalized.includes('PROPOST')||normalized==='PESSOA'||normalized==='NOME_PROPOSTO'){
    const matches=nav.people.filter(p=>value.includes(p.name)).sort((a,b)=>b.name.length-a.name.length);
    if(matches.length){const escaped=matches.map(p=>p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));const re=new RegExp('('+escaped.join('|')+')','g');return <>{value.split(re).map((s,i)=>matches.some(p=>p.name===s)?<PersonLink key={i} name={s}/>:s)}</>;}
    const exact=nav.people.find(p=>normalizeText(p.name)===normalizeText(value));
    return exact?<PersonLink name={value} personKey={exact.key}/>:value;
  }
  return value;
}
