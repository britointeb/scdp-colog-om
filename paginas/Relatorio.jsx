import React, { useMemo, useState } from 'react';
import { buildPersonReport, createDocxReport, createPdfReport, formatMoney, formatReportDate } from '../servicos/relatorios.js';

const METRICS = [
  ['realizedCents', 'Realizado SCDP', 'Teto Orçamentário'],
  ['inProgressCents', 'Em andamento', 'Teto Orçamentário'],
  ['issuedCents', 'Emitido', 'Eventos de Bilhetes'],
  ['toRefundCents', 'A devolver', 'Eventos de Bilhetes'],
];

export default function Relatorio({ data, filtered, filters = {}, options = {}, onPersonChange }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const report = useMemo(() => buildPersonReport({ data, filtered, filters }), [data, filtered, filters]);
  const people = options.people || [];

  async function exportReport(format) {
    setError('');
    setBusy(format);
    try {
      if (format === 'pdf') await createPdfReport(report);
      else await createDocxReport(report);
    } catch (exportError) {
      setError(exportError.message || 'Não foi possível gerar o relatório.');
    } finally {
      setBusy('');
    }
  }

  return <div className="report-preview">
    <div className="card report-toolbar">
      <div>
        <h2>Relatório individual</h2>
        <p className="muted">Selecione uma pessoa para conferir e exportar o recorte atual.</p>
      </div>
      <div className="report-actions">
        <label className="report-person-label" htmlFor="report-person">Pessoa
          <select id="report-person" value={filters.person || 'all'} onChange={event => { setError(''); onPersonChange?.(event.target.value); }}>
            <option value="all">Selecione uma pessoa</option>
            {people.map(person => <option key={person.value} value={person.value}>{person.label}</option>)}
          </select>
        </label>
        <button type="button" className="button" disabled={!report?.hasData || Boolean(busy)} onClick={() => exportReport('pdf')}>{busy === 'pdf' ? 'Gerando PDF…' : 'Baixar PDF'}</button>
        <button type="button" className="button button-secondary" disabled={!report?.hasData || Boolean(busy)} onClick={() => exportReport('docx')}>{busy === 'docx' ? 'Gerando DOCX…' : 'Baixar DOCX'}</button>
        <button type="button" className="button button-secondary" disabled={!report?.hasData || Boolean(busy)} onClick={() => window.print()}>Imprimir</button>
      </div>
      {error && <p className="report-error" role="alert">{error}</p>}
    </div>

    {!report && <div className="card empty-state"><h3>Escolha a pessoa do relatório</h3><p>Os filtros do painel serão preservados. O documento apresentará as PCDPs, os empenhos e o histórico de bilhetes encontrados nas bases.</p></div>}
    {report && !report.hasData && <div className="card empty-state"><h3>Nenhum registro neste recorte</h3><p>Não há dados de Teto ou Bilhetes para {report.name} com os filtros atuais. Amplie o período ou limpe os demais filtros.</p></div>}

    {report?.hasData && <article className="report-paper" aria-label={`Prévia do relatório individual de ${report.name}`}>
      <header className="report-heading">
        <span className="eyebrow">SCDP / RELATÓRIO INDIVIDUAL</span>
        <h1>{report.name}</h1>
        <p className="muted">Gerado em {report.generatedAt} (Brasília)</p>
        <p><strong>UGs:</strong> {report.units.join(', ') || 'Não informadas'}</p>
        <p className="report-filter-line">{report.filters.join(' · ')}</p>
      </header>

      <div className="report-kpis">
        {METRICS.map(([field, title, source]) => <div key={field}>
          <span>{title}</span><strong>{formatMoney(report.metrics[field])}</strong><small>{source}</small>
        </div>)}
      </div>
      <p className="report-counts">{report.counts.pcdps} PCDPs distintas · {report.counts.tickets} bilhetes distintos · {report.counts.events} eventos · {report.counts.components} componentes de empenho</p>
      <p className="report-note">A emitir em Bilhetes: <strong>{formatMoney(report.metrics.toIssueCents)}</strong>. Os valores de Teto e de Bilhetes são apresentados separadamente.</p>

      <section className="report-section">
        <h2>PCDPs e empenhos</h2>
        <div className="report-table-wrap"><table className="report-table">
          <thead><tr><th>PCDP / UG</th><th>Empenhos</th><th className="numeric">Realizado SCDP</th><th className="numeric">Em andamento</th></tr></thead>
          <tbody>{report.pcdps.map(row => <tr key={`${row.pcdp}|${row.ug}`}>
            <td><strong>{row.pcdp}</strong><small>UG {row.ug}</small></td>
            <td>{row.commitments.length ? row.commitments.map(commitment => <small key={commitment}>{commitment}</small>) : 'Não informado'}</td>
            <td className="numeric">{formatMoney(row.realizedCents)}</td><td className="numeric">{formatMoney(row.inProgressCents)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="report-section">
        <h2>Histórico de bilhetes</h2>
        {report.events.length ? <div className="report-table-wrap"><table className="report-table report-ticket-table">
          <thead><tr><th>PCDP / evento</th><th>Bilhete / situação</th><th>Trechos / viagem</th><th className="numeric">Emitido</th><th className="numeric">A devolver</th></tr></thead>
          <tbody>{report.events.map((row, index) => <tr key={row.id || index}>
            <td>{row.pcdp || 'Não informada'}<small>{formatReportDate(row.eventDate || row.date)}</small></td>
            <td>{row.ticket || 'Não informado'}<small>{row.status || 'Situação não informada'}</small></td>
            <td>{row.route || 'Trechos não informados'}<small>{formatReportDate(row.tripStart)} a {formatReportDate(row.tripEnd)}</small></td>
            <td className="numeric">{formatMoney(row.issuedCents)}</td><td className="numeric">{formatMoney(row.toRefundCents)}</td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">Sem eventos de bilhetes no recorte selecionado.</p>}
      </section>

      <section className="report-section report-methodology">
        <h2>Cobertura e critérios</h2>
        <p className="report-note"><strong>Teto:</strong> {report.coverage.teto}. <strong>Bilhetes:</strong> {report.coverage.bilhetes}.</p>
        {report.notes.map(note => <p className="report-note" key={note}>{note}</p>)}
      </section>
      <footer className="report-footer">Painel SCDP · Relatório individual · {report.generatedAt} (Brasília)</footer>
    </article>}
  </div>;
}
