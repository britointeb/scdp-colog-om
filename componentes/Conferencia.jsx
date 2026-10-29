import React from 'react';
import {money} from './Grafico.jsx';

export function reconciliationLabel(check){
  if(check.status==='unavailable')return 'Sem dados suficientes';
  if(check.status==='calculated')return check.complete?'Saldo calculado':'Saldo calculado parcial';
  if(check.status==='incomplete')return 'Conferência incompleta';
  return check.status==='reconciled'?'Soma conciliada':`Diferença: ${money(check.differenceCents)}`;
}
export default function Conferencia({summary}){
  const checks=summary.reconciliation;
  const reconciled=Object.values(checks).every(c=>c.status==='reconciled');
  const calculated=Object.values(checks).some(c=>c.source==='calculated');
  const title=Object.values(checks).every(c=>c.status==='unavailable')?'Sem dados suficientes':reconciled?'Duas equações conciliadas':calculated?'Saldos a liquidar e a pagar calculados':'Confira as duas composições';
  const balanceLabel=c=>c.source==='calculated'?c.complete?'Calculado':'Calculado parcial':c.source==='source'?'Informado na fonte':'Indisponível';
  return <details className={`card reconciliation ${reconciled?'ok':''}`}><summary><span className="status-dot"/><strong>Conferência do empenhado</strong><span>{title}</span><small>Ver composições ⌄</small></summary><div className="equation-grid">{[
    ['Liquidação','Empenhado = Liquidado + A liquidar + Bloqueado + Cancelado','Liquidado',summary.liquidatedCents,'A liquidar',checks.liquidation],
    ['Pagamento','Empenhado = Pago + A pagar + Bloqueado + Cancelado','Pago',summary.paidCents,'A pagar',checks.payment],
  ].map(([label,formula,stage,stageValue,balance,check])=><section className="equation-card" key={label} aria-label={`Composição por ${label.toLowerCase()}`}><div className="equation-heading"><h3>{label}</h3><span className={`equation-status ${check.status}`}>{reconciliationLabel(check)}</span></div><p className="equation-formula">{formula}</p><div className="reconciliation-values">{[['Empenhado',summary.committedCents], [stage,stageValue],[balance,check.balanceCents],['Bloqueado',summary.blockedCents],['Cancelado',summary.canceledCents]].map(([name,value])=><div key={name}><small>{name}</small><strong>{money(value)}</strong>{name===balance&&<em>{balanceLabel(check)}</em>}</div>)}</div>{check.source==='source'&&check.differenceCents!=null&&<p className="equation-difference">Empenhado − soma das parcelas = <strong>{money(check.differenceCents)}</strong></p>}{check.missing.length>0&&<p className="equation-note">Parcelas sem valor ou coluna: {check.missing.join('; ')}. O saldo calculado parcial usa somente as parcelas conhecidas.</p>}</section>)}</div>{calculated&&<p className="data-note">Quando a fonte não informa “A liquidar” ou “A pagar”, o painel calcula o saldo pela respectiva equação. Saldos derivados não constituem uma conferência independente dos dados. Bloqueado é contado uma única vez em cada composição.</p>}</details>;
}
