import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Building2, Plane, Info, ArrowRight, SlidersHorizontal } from 'lucide-react';
import Grafico, { ChartCard, palette, baseOption, shortMoney, money, number, sumBy } from '../componentes/Grafico.jsx';

const axis = { axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#edf1f2', type: 'dashed' } } };
const sum = (rows, field) => rows.reduce((n, r) => n + (r[field] ?? 0), 0);

export function Evolution({ filtered, metric = 'paidCents', onMonth }) {
  const option = useMemo(() => {
    const rows = filtered.tesgen.filter(r => r.date && !r.isOpening);
    const months = [...new Set(rows.map(r => r.date.slice(0, 7)))].sort();
    const fields = metric === 'all' ? [['committedCents', 'Empenhado'], ['liquidatedCents', 'Liquidado'], ['paidCents', 'Pago']] : [[metric, { paidCents: 'Pago', committedCents: 'Empenhado', liquidatedCents: 'Liquidado', provisionCents: 'Provisão recebida' }[metric] || 'Valor']];
    return {
      ...baseOption(),
      legend: fields.length > 1 ? { top: 0, right: 18, icon: 'circle', itemWidth: 7, itemHeight: 7 } : undefined,
      tooltip: { ...baseOption().tooltip, valueFormatter: money },
      xAxis: { ...axis, type: 'category', boundaryGap: false, data: months, axisLabel: { formatter: v => { const [y, m] = v.split('-'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]}/${y.slice(2)}`; }, margin: 15 }, splitLine: { show: false } },
      yAxis: { ...axis, type: 'value', axisLabel: { formatter: shortMoney }, name: 'R$' },
      series: fields.map(([field, name], i) => ({ name, type: 'line', smooth: .25, symbol: 'circle', symbolSize: 5, showSymbol: months.length < 18, lineStyle: { width: 2.7 }, areaStyle: fields.length === 1 ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#237d712b' }, { offset: 1, color: '#237d7100' }] } } : undefined, data: months.map(m => sum(rows.filter(r => r.date.startsWith(m)), field)) })),
      graphic: undefined,
    };
  }, [filtered, metric]);
  if (!filtered.tesgen.some(r => r.date)) return <div className="empty-chart">Sem lançamentos datados neste recorte.</div>;
  return <Grafico option={option} height={280} onClick={p => onMonth?.(p.name)} label="Evolução mensal da execução TESGEN" />;
}

export function UnitRanking({ filtered, field = 'paidCents', source = 'tesgen', onUnit, limit = 7 }) {
  const items = useMemo(() => sumBy(filtered[source], field, r => r.ug || 'Sem UG').slice(0, limit), [filtered, field, source, limit]);
  const option = useMemo(() => ({ ...baseOption(), grid: { left: 12, right: 60, top: 5, bottom: 10, containLabel: true }, tooltip: { ...baseOption().tooltip, valueFormatter: money }, xAxis: { ...axis, type: 'value', axisLabel: { formatter: shortMoney }, splitNumber: 3 }, yAxis: { ...axis, type: 'category', inverse: true, data: items.map(v => v.name), splitLine: { show: false } }, series: [{ type: 'bar', barWidth: 16, data: items.map((v, i) => ({ ...v, itemStyle: { color: i === 0 ? '#237d71' : '#8ab6aa', borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', formatter: p => shortMoney(p.value), color: '#4d646b', fontSize: 10 } }] }), [items]);
  if (!items.length) return <div className="empty-chart">Sem valores para comparar neste recorte.</div>;
  return <Grafico option={option} height={280} onClick={p => onUnit?.(p.name)} label="Ranking de unidades por valor" />;
}

export function PeopleRanking({ filtered, onPerson }) {
  const items = useMemo(() => {
    const byName = sumBy(filtered.teto, 'realizedCents', 'person').slice(0, 8);
    return byName.map(v => ({ ...v, personKey: filtered.teto.find(r => r.person === v.name)?.personKey }));
  }, [filtered]);
  const option = useMemo(() => ({ ...baseOption(), grid: { left: 12, right: 50, top: 6, bottom: 8, containLabel: true }, tooltip: { ...baseOption().tooltip, valueFormatter: money }, xAxis: { ...axis, type: 'value', axisLabel: { formatter: shortMoney }, splitNumber: 3 }, yAxis: { ...axis, type: 'category', inverse: true, data: items.map(v => v.name), axisLabel: { width: 155, overflow: 'truncate', fontSize: 10 }, splitLine: { show: false } }, series: [{ type: 'bar', barWidth: 14, data: items.map(v => ({ ...v, itemStyle: { color: '#406f9b', borderRadius: [0, 4, 4, 0] } })) }] }), [items]);
  if (!items.length) return <div className="empty-chart">Sem pessoas com valores realizados neste recorte.</div>;
  return <Grafico option={option} height={290} onClick={p => onPerson?.(p.data.personKey)} label="Pessoas por valor realizado no SCDP" />;
}

function StatusDonut({ filtered }) {
  const items = useMemo(() => {
    const pcdps = new Map(filtered.teto.map(r => [r.pcdp, r.status || 'Não informado']));
    const counts = new Map();
    for (const status of pcdps.values()) counts.set(status, (counts.get(status) || 0) + 1);
    return [...counts].map(([name, value]) => ({ name, value }));
  }, [filtered]);
  const option = useMemo(() => ({ ...baseOption(), tooltip: { trigger: 'item', confine: true, formatter: '{b}: {c} PCDPs ({d}%)' }, legend: { bottom: 0, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 10, color: '#647784' } }, series: [{ type: 'pie', radius: ['57%', '77%'], center: ['50%', '43%'], padAngle: 3, itemStyle: { borderRadius: 4 }, label: { show: false }, emphasis: { label: { show: true, fontSize: 12, formatter: '{c}\nPCDPs', position: 'center' } }, data: items }] }), [items]);
  if (!items.length) return <div className="empty-chart">Sem PCDPs neste recorte.</div>;
  return <Grafico option={option} height={240} label="Distribuição de PCDPs por situação" />;
}

export default function Analises({ filtered, summary, filters, onFilter, onNavigate, expanded = false }) {
  const [metric, setMetric] = useState('paidCents');
  const month = (value) => { if (!/^\d{4}-\d{2}$/.test(value)) return; const [y, m] = value.split('-').map(Number); onFilter({ year: String(y), start: `${value}-01`, end: `${value}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }); };
  const select = <select className="compact-select" aria-label="Medida do gráfico de evolução" value={metric} onChange={e => setMetric(e.target.value)}><option value="paidCents">Pago</option><option value="committedCents">Empenhado</option><option value="liquidatedCents">Liquidado</option><option value="provisionCents">Provisão</option><option value="all">Comparar etapas</option></select>;
  const categoryItems = useMemo(() => sumBy(filtered.tesgen, metric === 'all' ? 'paidCents' : metric, 'category').slice(0, 9), [filtered, metric]);
  const categoryOption = useMemo(() => ({ ...baseOption(), tooltip: { trigger: 'item', confine: true, valueFormatter: money }, series: [{ type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, left: 8, right: 8, top: 10, bottom: 8, label: { fontSize: 11, formatter: p => `${p.name}\nR$ ${shortMoney(p.value)}`, overflow: 'truncate' }, itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 2, borderRadius: 5 }, data: categoryItems }] }), [categoryItems]);
  const ticketMonths = useMemo(() => {
    const rows = filtered.bilhetes.filter(r => r.eventDate);
    const items = sumBy(rows, 'issuedCents', r => r.eventDate.slice(0, 7)).sort((a, b) => a.name.localeCompare(b.name));
    return { ...baseOption(), tooltip: { ...baseOption().tooltip, valueFormatter: money }, xAxis: { ...axis, type: 'category', data: items.map(r => r.name), splitLine: { show: false } }, yAxis: { ...axis, type: 'value', axisLabel: { formatter: shortMoney }, name: 'R$' }, series: [{ name: 'Emitido', type: 'bar', barMaxWidth: 42, itemStyle: { color: '#406f9b', borderRadius: [4, 4, 0, 0] }, data: items.map(r => r.value) }] };
  }, [filtered]);
  return <>
    <div className="analysis-grid">
      <ChartCard title="Evolução financeira" subtitle="Valores por mês de emissão · TESGEN" action={select} className="chart-wide"><Evolution filtered={filtered} metric={metric} onMonth={month} /></ChartCard>
      <ChartCard title="Unidades em destaque" subtitle="Valor pago por UG · clique para filtrar" action={<span className="subtle-icon"><Building2 size={17}/></span>}><UnitRanking filtered={filtered} onUnit={ug => onFilter({ ug })} /></ChartCard>
    </div>
    <div className="analysis-grid second-row">
      <ChartCard title="Viagens e bilhetes" subtitle="Indicadores operacionais · fontes separadas" className="travel-card">
        <div className="travel-stats"><div className="travel-icon"><Plane size={24}/></div><div><strong>{number(summary.pcdps)}</strong><span>PCDPs distintas nas bases de viagens</span></div><button className="icon-button" title="Consultar viagens" onClick={() => onNavigate('tabelas')}><ArrowUpRight size={19}/></button></div>
        <div className="travel-row"><span>Realizado SCDP</span><strong>{money(summary.teto.realizedCents)}</strong></div>
        <div className="travel-row"><span>Em andamento SCDP</span><strong>{money(summary.teto.inProgressCents)}</strong></div>
        <div className="travel-row"><span>Bilhetes · valor emitido</span><strong>{money(summary.bilhetes.issuedCents)}</strong></div>
        <div className="travel-row"><span>Bilhetes · a devolver</span><strong>{money(summary.bilhetes.toRefundCents)}</strong></div>
        <p className="micro-note">Valores de fontes diferentes podem representar o mesmo processo e são apresentados separadamente.</p>
      </ChartCard>
      <ChartCard title="Situação das PCDPs" subtitle="Contagem distinta · Teto Orçamentário"><StatusDonut filtered={filtered}/></ChartCard>
      <ChartCard title="Realizado por pessoa" subtitle="SCDP · clique para selecionar" className="people-card"><PeopleRanking filtered={filtered} onPerson={person => onFilter({ person })}/></ChartCard>
    </div>
    {expanded && <div className="analysis-grid">
      <ChartCard title="Composição por natureza de despesa" subtitle="TESGEN · medida selecionada na evolução" className="chart-wide">{categoryItems.length ? <Grafico option={categoryOption} height={300} onClick={p => onFilter({ category: p.name })} label="Composição por natureza de despesa"/> : <div className="empty-chart">Sem valores no recorte.</div>}</ChartCard>
      <ChartCard title="Emissões de bilhetes" subtitle="Valor emitido por mês do evento · Bilhetes">{filtered.bilhetes.some(r => r.eventDate) ? <Grafico option={ticketMonths} height={300} label="Bilhetes emitidos por mês"/> : <div className="empty-chart">Sem eventos datados no recorte.</div>}</ChartCard>
    </div>}
    {!expanded && <button className="text-button explore-link" onClick={() => onNavigate('graficos')}>Explorar todas as análises <ArrowRight size={15}/></button>}
  </>;
}
