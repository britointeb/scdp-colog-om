import React,{useMemo,useRef,useState} from 'react';
import Grafico from './Grafico.jsx';
import {Table} from './Controles.jsx';
import {downloadBlob,filename,formatCell,makeCsv,makeXlsx,makeChartPng,makePdf} from '../servicos/exportar.js';
import {pieOption} from '../servicos/graficos.js';
const MODES={bar:'Barras',stacked:'Barras empilhadas',percent:'Empilhadas 100%',pie:'Pizza',table:'Tabela',bubble:'Bolhas',line:'Linhas',map:'Mapa'};
export default function AnaliseGrafico({title,subtitle,data,option,modes=['bar','pie','table'],initialMode=modes[0],optionForMode,height=360,onClick,children,action}){
  const [mode,setMode]=useState(initialMode),[metric,setMetric]=useState(()=>data.columns.find(c=>['number','money','percent'].includes(c.type))?.key),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const chart=useRef(),numeric=data.columns.filter(c=>['number','money','percent'].includes(c.type)),plotMode=mode==='table'?initialMode:mode;
  const plot=useMemo(()=>plotMode==='pie'?pieOption(data,metric):optionForMode?.(plotMode)||option,[plotMode,data,metric,optionForMode,option]);
  const save=async format=>{
    setBusy(format);setMessage('');
    try{
      const name=filename(title);
      if(format==='CSV')downloadBlob(new Blob([makeCsv(data)],{type:'text/csv;charset=utf-8'}),name+'.csv');
      if(format==='XLSX')downloadBlob(new Blob([makeXlsx(data,title)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');
      if(format==='PNG'||format==='PDF'){
        const image=await makeChartPng(chart.current?.getSvg(),title,{branding:format!=='PDF'});
        if(format==='PNG'){const response=await fetch(image);downloadBlob(await response.blob(),name+'.png');}
        else downloadBlob(await makePdf(data,title,image),name+'.pdf');
      }
      setMessage(`${format} gerado.`);
    }catch(error){setMessage(error.message||'Não foi possível gerar o arquivo.');}finally{setBusy('');}
  };
  return <section className="card chart-card exportable-chart" data-chart-title={title} data-view={mode}><div className="card-heading"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div><div className="chart-controls">{modes.length>1&&<label className="chart-view-label">Visualização<select aria-label={`Visualização de ${title}`} value={mode} onChange={e=>setMode(e.target.value)}>{modes.map(m=><option key={m} value={m}>{MODES[m]}</option>)}</select></label>}{mode==='pie'&&numeric.length>1&&<label className="chart-view-label">Medida<select aria-label={`Medida da pizza de ${title}`} value={metric} onChange={e=>setMetric(e.target.value)}>{numeric.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label>}{action}<div className="chart-downloads" aria-label={`Exportações de ${title}`}>{['PNG','XLSX','CSV','PDF'].map(f=><button className="button button-secondary small" key={f} disabled={!!busy} onClick={()=>save(f)} aria-label={`Baixar ${f} de ${title}`}>{busy===f?'Gerando…':f}</button>)}</div></div></div>{children}<div className={mode==='table'?'chart-offscreen':''} aria-hidden={mode==='table'}><Grafico ref={chart} label={title} option={plot} height={height} onClick={p=>onClick?.(p,plotMode)}/></div>{mode==='table'&&<Table exportable={false} title={`${title} — dados`} rows={data.rows} columns={data.columns.map(c=>({label:c.label,value:r=>c.type==='text'?r[c.key]:formatCell(r[c.key],c),sort:r=>r[c.key]}))} filename={filename(title)+'.csv'}/>}<span className="export-status" role="status">{message}</span></section>;
}
