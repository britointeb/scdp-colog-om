import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, HeatmapChart, TreemapChart, ScatterChart, LinesChart, MapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, VisualMapComponent, AriaComponent, GeoComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { LabelLayout } from 'echarts/features';

echarts.use([BarChart, LineChart, PieChart, HeatmapChart, TreemapChart, ScatterChart, LinesChart, MapChart, GeoComponent, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, VisualMapComponent, AriaComponent, SVGRenderer, LabelLayout]);
export {echarts};

export const palette = ['#2563eb', '#fbd24c', '#ed2429', '#1e293b', '#64748b', '#0891b2', '#8b5cf6'];
export const shortMoney = (cents) => {
  if (cents === null || cents === undefined) return '—';
  const n = cents / 100;
  return Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};
export const money = (cents) => cents == null ? '—' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const number = (n) => n == null ? '—' : n.toLocaleString('pt-BR');
export const date = (v) => v ? new Date(v.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

export function baseOption() {
  return {
    color: palette,
    animationDuration: 380,
    textStyle: { fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#64748b' },
    aria: { enabled: true },
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#cbd5e1', textStyle: { color: '#1e293b', fontSize: 12 }, confine: true, extraCssText: 'box-shadow:0 8px 30px #1e293b14;border-radius:8px;' },
    grid: { left: 20, right: 24, top: 34, bottom: 22, containLabel: true },
  };
}

const Grafico=forwardRef(function Grafico({ option, height = 280, onClick, label = 'Gráfico interativo' },ref) {
  const el = useRef(null);
  const instance = useRef(null);
  const callback = useRef(onClick);
  callback.current = onClick;
  useImperativeHandle(ref,()=>({getSvg:()=>instance.current?.getDataURL({type:'svg',backgroundColor:'#fff'})}),[]);
  useEffect(() => {
    const chart = echarts.init(el.current, null, { renderer: 'svg' });
    instance.current = chart;
    chart.on('click', (params) => callback.current?.(params));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el.current);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);
  useEffect(() => {
    const series=(option.series||[]).map(s=>['bar','line'].includes(s.type)?{...s,label:{show:true,position:s.stack?'inside':'top',fontSize:10,formatter:p=>p.value==null?'':Number(p.value).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1}),...s.label},labelLayout:typeof s.labelLayout==='function'?s.labelLayout:{hideOverlap:false,...s.labelLayout}}:s);
    instance.current?.setOption({ ...option,animation:false,series, aria: { enabled: true, label: { enabled: true, description: label } } }, { notMerge: true });
  }, [option, label]);
  return <div ref={el} className="chart-canvas" style={{ height }} role="img" aria-label={label} />;
});
export default Grafico;

export function ChartCard({ title, subtitle, action, children, className = '' }) {
  return <section className={`card chart-card ${className}`}><div className="card-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export function sumBy(rows, field, key) {
  const map = new Map();
  for (const row of rows) {
    const k = typeof key === 'function' ? key(row) : row[key];
    if (!k || row[field] == null) continue;
    map.set(k, (map.get(k) || 0) + row[field]);
  }
  return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
