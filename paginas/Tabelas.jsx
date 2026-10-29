import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { Search, Download, Columns3, ArrowUpDown, ChevronLeft, ChevronRight, X, FileText, ExternalLink } from 'lucide-react';
import { money, date, number } from '../componentes/Grafico.jsx';

const columns = {
  tesgen: [ ['date','Emissão','date'], ['ug','UG'], ['document','Documento'], ['commitment','Empenho'], ['beneficiary','Favorecido'], ['category','Natureza da despesa'], ['committedCents','Empenhado','money'], ['liquidatedCents','Liquidado','money'], ['paidCents','Pago','money'], ['provisionCents','Provisão','money'], ['status','Tipo de documento'] ],
  bilhetes: [ ['pcdp','PCDP'], ['person','Pessoa'], ['ug','UG'], ['eventDate','Data do evento','date'], ['ticket','Bilhete'], ['status','Situação'], ['issuedCents','Emitido','money'], ['toRefundCents','A devolver','money'], ['toIssueCents','A emitir','money'], ['tripStart','Início da viagem','date'], ['route','Trechos'], ['commitment','Empenho'] ],
  teto: [ ['pcdp','PCDP'], ['person','Pessoa'], ['ug','UG'], ['commitment','Empenho'], ['status','Situação'], ['realizedCents','Realizado','money'], ['inProgressCents','Em andamento','money'], ['coverageStart','Cobertura inicial','date'], ['coverageEnd','Cobertura final','date'] ],
};
const names = { tesgen: 'Execução TESGEN', bilhetes: 'Bilhetes', teto: 'Teto Orçamentário' };
const display = (r, [key,,type]) => type === 'money' ? money(r[key]) : type === 'date' ? r.isOpening ? 'Saldo inicial' : date(r[key]) : r[key] || '—';

export default function Tabelas({ data, filtered, onPersonChange }) {
  const [source,setSource] = useState('tesgen');
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState({key:'date',direction:-1});
  const [page,setPage] = useState(0);
  const [pageSize,setPageSize] = useState(25);
  const [hidden,setHidden] = useState([]);
  const [showColumns,setShowColumns] = useState(false);
  const [detail,setDetail] = useState(null);
  const cols = columns[source];
  const shown = cols.filter(([key]) => !hidden.includes(key));
  const rows = useMemo(() => {
    const q = query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const selected = filtered[source].filter(row => !q || cols.some(([key]) => String(row[key] ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)));
    return selected.sort((a,b) => {
      const aa = a[sort.key], bb = b[sort.key];
      if (aa == null || aa === '') return 1;
      if (bb == null || bb === '') return -1;
      return (typeof aa === 'number' ? aa - bb : String(aa).localeCompare(String(bb),'pt-BR',{numeric:true})) * sort.direction;
    });
  },[filtered,source,query,sort]);
  useEffect(()=>setPage(0),[filtered,source,query,pageSize]);
  const pages = Math.max(1,Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page,pages-1);
  const visible = rows.slice(currentPage*pageSize,(currentPage+1)*pageSize);

  function exportCsv() {
    const csv = Papa.unparse({ fields:shown.map(c=>c[1]), data:rows.map(r=>shown.map(([key,,type])=>type==='money' ? r[key] == null ? '' : (r[key]/100).toFixed(2).replace('.',',') : r[key] ?? '')) },{delimiter:';',escapeFormulae:true});
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`scdp_${source}_filtrado.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const related = detail ? Object.entries({tesgen:data.tesgen,bilhetes:data.bilhetes,teto:data.teto}).map(([key,items])=>({source:key,rows:items.filter(r=>detail.commitment ? r.commitment && r.commitment===detail.commitment && r.ug===detail.ug : detail.pcdp && r.pcdp===detail.pcdp && r.ug===detail.ug)})) : [];
  return <section className="card table-card">
    <div className="table-source-tabs" role="tablist" aria-label="Base da tabela">{Object.keys(names).map(key=><button role="tab" aria-selected={source===key} className={source===key?'selected':''} key={key} onClick={()=>{setSource(key);setHidden([]);setSort({key:key==='tesgen'?'date':'pcdp',direction:-1});}}>{names[key]}<span>{number(filtered[key].length)}</span></button>)}</div>
    <div className="table-toolbar"><div className="table-search"><Search size={16}/><input aria-label="Buscar na tabela" placeholder="Buscar nesta tabela…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="table-actions"><div className="column-menu-wrap"><button className="button button-secondary" aria-expanded={showColumns} onClick={()=>setShowColumns(v=>!v)}><Columns3 size={15}/>Colunas</button>{showColumns&&<div className="column-menu">{cols.map(([key,label])=><label key={key}><input type="checkbox" checked={!hidden.includes(key)} onChange={()=>setHidden(v=>v.includes(key)?v.filter(k=>k!==key):shown.length>1?[...v,key]:v)}/>{label}</label>)}</div>}</div><button className="button button-secondary" onClick={exportCsv} disabled={!rows.length}><Download size={15}/>Exportar CSV</button></div></div>
    <div className="table-scroll"><table className="data-table"><thead><tr>{shown.map(([key,label,type])=><th key={key} className={type==='money'?'numeric':''} aria-sort={sort.key===key?(sort.direction===1?'ascending':'descending'):'none'}><button onClick={()=>setSort({key,direction:sort.key===key?-sort.direction:1})}>{label}<ArrowUpDown size={11}/></button></th>)}<th>Detalhes</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}>{shown.map(col=><td key={col[0]} className={`${col[2]==='money'?'numeric ':''}${col[0]==='person'||col[0]==='beneficiary'?'person-cell':''}`} title={display(row,col)}>{col[0]==='person'&&row.personKey?<button className="cell-link" onClick={()=>onPersonChange(row.personKey)}>{display(row,col)}</button>:col[0]==='status'?<span className="status-tag">{display(row,col)}</span>:display(row,col)}</td>)}<td><button className="icon-button" aria-label={`Ver detalhes ${row.document||row.pcdp||row.id}`} onClick={()=>setDetail(row)}><ExternalLink size={15}/></button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty-state"><Search size={28}/><h3>Nenhum registro encontrado</h3><p>Ajuste os filtros ou a busca para ampliar o recorte.</p></div>}</div>
    <div className="table-footer"><span>{rows.length?`${number(currentPage*pageSize+1)}–${number(Math.min((currentPage+1)*pageSize,rows.length))} de ${number(rows.length)} registros`:'0 registros'}</span><div><label>Linhas <select aria-label="Linhas por página" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><button className="icon-button" aria-label="Página anterior" disabled={currentPage===0} onClick={()=>setPage(v=>v-1)}><ChevronLeft size={17}/></button><span>{currentPage+1} / {pages}</span><button className="icon-button" aria-label="Próxima página" disabled={currentPage>=pages-1} onClick={()=>setPage(v=>v+1)}><ChevronRight size={17}/></button></div></div>
    <p className="table-footnote">{source==='tesgen'?'Cada medida financeira é independente. Saldos iniciais permanecem identificados; favorecido contábil pode ser um fornecedor.':source==='bilhetes'?'Cada linha representa um evento. Totais de referência da PCDP e tarifas repetidas não são somados.':'Cada linha representa um componente de empenho. As datas indicam a cobertura do relatório, sem data individual de movimento.'}</p>
    {detail&&<div className="drawer-backdrop" onClick={()=>setDetail(null)}><aside className="detail-drawer" aria-label="Detalhes do registro" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}><div className="drawer-title"><div><span className="eyebrow">{names[source]}</span><h2>Detalhes do registro</h2></div><button className="icon-button" aria-label="Fechar detalhes" onClick={()=>setDetail(null)} autoFocus><X size={20}/></button></div><dl className="detail-fields">{cols.map(col=><div key={col[0]}><dt>{col[1]}</dt><dd>{display(detail,col)}</dd></div>)}<div><dt>Arquivo de origem</dt><dd>{detail.sourceFile||'Não informado'}</dd></div></dl><h3>Relacionamentos encontrados</h3><p className="muted">Por UG e empenho completo. Valores de um empenho compartilhado são contexto contábil.</p><div className="related-sources">{related.map(r=><div key={r.source}><FileText size={17}/><span>{names[r.source]}</span><strong>{r.rows.length}</strong></div>)}</div>{detail.personKey&&<button className="button" onClick={()=>{onPersonChange(detail.personKey);setDetail(null);}}>Abrir relatório da pessoa</button>}</aside></div>}
  </section>;
}
