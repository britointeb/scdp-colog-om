const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

export function formatMoney(cents) {
  return Number.isFinite(cents) ? MONEY.format(cents / 100) : 'Não informado';
}

export function formatReportDate(value) {
  if (!value) return 'Não informada';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? 'Não informada' : DATE.format(date);
}

function sum(rows, field) {
  const values = rows.map(row => row[field]).filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function unique(values) {
  return [...new Set(values.filter(value => value && value !== '-9'))];
}

function labelFilters(filters) {
  const labels = [];
  if (filters.year && filters.year !== 'all') labels.push(`Exercício: ${filters.year}`);
  if (filters.ug && filters.ug !== 'all') labels.push(`UG: ${filters.ug}`);
  if (filters.start) labels.push(`De: ${formatReportDate(filters.start)}`);
  if (filters.end) labels.push(`Até: ${formatReportDate(filters.end)}`);
  if (filters.pcdp) labels.push(`PCDP: ${filters.pcdp}`);
  if (filters.commitment) labels.push(`Empenho: ${filters.commitment}`);
  if (filters.category && filters.category !== 'all') labels.push(`Categoria: ${filters.category}`);
  if (filters.status && filters.status !== 'all') labels.push(`Situação: ${filters.status}`);
  if (filters.query) labels.push(`Busca: ${filters.query}`);
  return labels.length ? labels : ['Todo o período disponível nas bases'];
}

function getCoverage(data, rows, source) {
  if (source === 'teto') {
    const starts = unique(rows.map(row => row.coverageStart)).sort();
    const ends = unique(rows.map(row => row.coverageEnd)).sort();
    if (starts.length || ends.length) return `${formatReportDate(starts[0])} a ${formatReportDate(ends.at(-1))}`;
  }
  const sourceMeta = data?.meta?.coverage?.[source];
  return sourceMeta?.start || sourceMeta?.end
    ? `${formatReportDate(sourceMeta.start)} a ${formatReportDate(sourceMeta.end)}`
    : 'Não informada';
}

/** Source values remain separate: a commitment can cover several travellers. */
export function buildPersonReport({ data, filtered, filters = {}, personKey = filters.person, now = new Date() }) {
  if (!personKey || personKey === 'all') return null;
  const selected = filtered || data || {};
  const bilhetes = (selected.bilhetes || []).filter(row => row.personKey === personKey);
  const teto = (selected.teto || []).filter(row => row.personKey === personKey);
  const allPersonRows = [...(data?.teto || []), ...(data?.bilhetes || [])].filter(row => row.personKey === personKey);
  const name = [...teto, ...bilhetes, ...allPersonRows].find(row => row.person)?.person || personKey;
  const groups = new Map();
  for (const row of [...teto, ...bilhetes]) {
    const key = `${row.pcdp || 'SEM_PCDP'}|${row.ug || 'SEM_UG'}`;
    if (!groups.has(key)) groups.set(key, { pcdp: row.pcdp || 'Não informada', ug: row.ug || 'Não informada', teto: [], bilhetes: [], commitments: new Set() });
    const group = groups.get(key);
    if (row.commitment) group.commitments.add(row.commitment);
    if (row.source === 'teto') group.teto.push(row);
    else if (row.source === 'bilhetes') group.bilhetes.push(row);
    else if (teto.includes(row)) group.teto.push(row);
    else group.bilhetes.push(row);
  }
  const pcdps = [...groups.values()].map(group => ({
    pcdp: group.pcdp,
    ug: group.ug,
    commitments: [...group.commitments].sort(),
    realizedCents: sum(group.teto, 'realizedCents'),
    inProgressCents: sum(group.teto, 'inProgressCents'),
    issuedCents: sum(group.bilhetes, 'issuedCents'),
    toRefundCents: sum(group.bilhetes, 'toRefundCents'),
    events: group.bilhetes.length,
  })).sort((a, b) => a.pcdp.localeCompare(b.pcdp, 'pt-BR', { numeric: true }) || a.ug.localeCompare(b.ug));
  const events = bilhetes.slice().sort((a, b) => (a.eventDate || a.date || '').localeCompare(b.eventDate || b.date || '') || (a.pcdp || '').localeCompare(b.pcdp || ''));
  const report = {
    name,
    personKey,
    generatedAt: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(now),
    generatedIso: now.toISOString().slice(0, 10),
    filters: labelFilters(filters),
    units: unique([...teto, ...bilhetes].map(row => row.ug)).sort(),
    organizations: unique([...teto, ...bilhetes].map(row => row.om)).sort(),
    pcdps,
    events,
    counts: {
      pcdps: unique([...teto, ...bilhetes].map(row => row.pcdp)).length,
      tickets: unique(bilhetes.map(row => row.ticket)).length,
      events: bilhetes.length,
      components: teto.length,
    },
    metrics: {
      realizedCents: sum(teto, 'realizedCents'),
      inProgressCents: sum(teto, 'inProgressCents'),
      issuedCents: sum(bilhetes, 'issuedCents'),
      toIssueCents: sum(bilhetes, 'toIssueCents'),
      toRefundCents: sum(bilhetes, 'toRefundCents'),
    },
    coverage: { teto: getCoverage(data, teto, 'teto'), bilhetes: getCoverage(data, bilhetes, 'bilhetes') },
    hasData: teto.length + bilhetes.length > 0,
    notes: [
      'Realizado e em andamento vêm da base Teto Orçamentário. Emitido, a emitir e a devolver vêm dos eventos de Bilhetes. Os valores das duas fontes permanecem separados.',
      'Cada linha de Bilhetes representa um evento do histórico. Os totais de referência da PCDP, a tarifa repetida e os totais da passagem não são somados entre eventos.',
      'A cobertura de Teto identifica o período do relatório, e não a data de cada movimento. A base não contém o limite orçamentário autorizado.',
      'A pessoa é identificada pelo nome registrado nas bases. PCDPs complementares mantêm o identificador completo. Empenhos podem abranger mais de uma pessoa; valores da TESGEN não são atribuídos ao viajante.',
      'Não informado indica ausência de valor ou de registros na fonte para o recorte selecionado. Um valor zero informado permanece R$ 0,00.',
    ],
  };
  return report;
}

function fileName(report, extension) {
  const person = report.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 85);
  return `SCDP_${person || 'pessoa'}_${report.generatedIso}.${extension}`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function assertReport(report) {
  if (!report?.hasData) throw new Error('Selecione uma pessoa com registros no recorte atual para gerar o relatório.');
}

function reportMetrics(report) {
  return [
    ['Realizado SCDP', formatMoney(report.metrics.realizedCents), 'Teto Orçamentário'],
    ['Em andamento SCDP', formatMoney(report.metrics.inProgressCents), 'Teto Orçamentário'],
    ['Emitido', formatMoney(report.metrics.issuedCents), 'Eventos de Bilhetes'],
    ['A emitir', formatMoney(report.metrics.toIssueCents), 'Eventos de Bilhetes'],
    ['A devolver', formatMoney(report.metrics.toRefundCents), 'Eventos de Bilhetes'],
    ['PCDPs / bilhetes / eventos', `${report.counts.pcdps} / ${report.counts.tickets} / ${report.counts.events}`, 'Contagem distinta / histórico'],
  ];
}

function pdfText(value) {
  return String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/[–—]/g, '-').replace(/→/g, '>');
}

export async function createPdfReport(report, { download = true } = {}) {
  assertReport(report);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const navy = [18, 42, 66];
  doc.setProperties({ title: `SCDP - Relatório de ${report.name}`, subject: 'Relatório individual de viagens e bilhetes', author: 'Painel SCDP', creator: 'Painel SCDP' });
  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 11, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  doc.text('SCDP / RELATÓRIO INDIVIDUAL', 15, 21);
  doc.setFontSize(17);
  const personLines = doc.splitTextToSize(pdfText(report.name), 180);
  doc.text(personLines, 15, 31);
  let y = 34 + personLines.length * 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const text of [`Gerado em ${report.generatedAt} (Brasília)`, `UGs: ${report.units.join(', ') || 'Não informadas'}`, ...report.filters]) {
    const lines = doc.splitTextToSize(pdfText(text), 180);
    doc.text(lines, 15, y);
    y += lines.length * 4.4 + 1;
  }
  const table = (head, body, extra = {}) => {
    autoTable(doc, {
      startY: y + 3,
      head: [head.map(pdfText)],
      body: body.map(row => row.map(pdfText)),
      margin: { left: 15, right: 15, top: 18, bottom: 18 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, overflow: 'linebreak', valign: 'middle', textColor: [37, 52, 66] },
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 250] },
      ...extra,
    });
    y = doc.lastAutoTable.finalY + 7;
  };
  const heading = text => {
    if (y > 258) { doc.addPage(); y = 22; }
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(pdfText(text), 15, y);
    y += 2;
  };
  table(['Indicador', 'Valor', 'Fonte'], reportMetrics(report), { columnStyles: { 1: { halign: 'right' } } });
  heading('PCDPs e empenhos');
  table(['PCDP / UG', 'Empenhos', 'Realizado SCDP', 'Em andamento'], report.pcdps.map(row => [
    `${row.pcdp}\nUG ${row.ug}`, row.commitments.join('\n') || 'Não informado', formatMoney(row.realizedCents), formatMoney(row.inProgressCents),
  ]), { columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 58 }, 2: { halign: 'right', cellWidth: 42 }, 3: { halign: 'right', cellWidth: 42 } } });
  heading('Histórico de bilhetes');
  table(['PCDP / evento', 'Bilhete / situação', 'Trechos / viagem', 'Emitido', 'A devolver'], report.events.length ? report.events.map(row => [
    `${row.pcdp || 'Não informada'}\n${formatReportDate(row.eventDate || row.date)}`,
    `${row.ticket || 'Não informado'}\n${row.status || ''}`,
    `${row.route || 'Trechos não informados'}\n${formatReportDate(row.tripStart)} a ${formatReportDate(row.tripEnd)}`,
    formatMoney(row.issuedCents), formatMoney(row.toRefundCents),
  ]) : [['Sem eventos de bilhetes no recorte selecionado', '', '', '', '']], {
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle', textColor: [37, 52, 66] },
    columnStyles: { 0: { cellWidth: 31 }, 1: { cellWidth: 34 }, 2: { cellWidth: 57 }, 3: { halign: 'right', cellWidth: 29 }, 4: { halign: 'right', cellWidth: 29 } },
  });
  heading('Cobertura e critérios');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (const note of [`Cobertura de Teto: ${report.coverage.teto}. Cobertura de Bilhetes: ${report.coverage.bilhetes}.`, ...report.notes]) {
    const lines = doc.splitTextToSize(pdfText(note), 180);
    if (y + lines.length * 3.8 > 276) { doc.addPage(); y = 22; }
    doc.text(lines, 15, y + 3);
    y += lines.length * 3.8 + 4;
  }
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setDrawColor(215, 223, 231);
    doc.line(15, 281, 195, 281);
    doc.setTextColor(97, 113, 128);
    doc.setFontSize(8);
    doc.text(`SCDP | ${report.generatedAt} (Brasília)`, 15, 287);
    doc.text(`${page} / ${total}`, 195, 287, { align: 'right' });
  }
  const blob = doc.output('blob');
  if (download) downloadBlob(blob, fileName(report, 'pdf'));
  return blob;
}

export async function createDocxReport(report, { download = true } = {}) {
  assertReport(report);
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Header, Footer, PageNumber, Packer } = await import('docx');
  const navy = '122A42';
  const paragraph = (text, options = {}) => new Paragraph({ text: String(text ?? ''), spacing: { after: 100 }, ...options });
  const heading = text => paragraph(text, { heading: 'Heading2', spacing: { before: 240, after: 140 }, keepNext: true });
  const moneyParagraph = text => paragraph(text, { alignment: AlignmentType.RIGHT, spacing: { after: 0 } });
  const table = (heads, rows, numericColumns = []) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: 'D7DFE7' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D7DFE7' }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5EAF0' }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
    rows: [
      new TableRow({ tableHeader: true, children: heads.map(text => new TableCell({ shading: { fill: navy }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })], spacing: { after: 0 } })] })) }),
      ...rows.map((cells, index) => new TableRow({ children: cells.map((text, col) => new TableCell({ shading: { fill: index % 2 ? 'F4F7FA' : 'FFFFFF' }, margins: { top: 90, bottom: 90, left: 100, right: 100 }, children: String(text ?? '').split('\n').map(line => numericColumns.includes(col) ? moneyParagraph(line) : paragraph(line, { spacing: { after: 0 } })) })) })),
    ],
  });
  const document = new Document({
    creator: 'Painel SCDP',
    title: `SCDP - Relatório individual de ${report.name}`,
    description: 'Relatório individual com dados das bases Teto Orçamentário e Bilhetes.',
    styles: {
      default: { document: { run: { font: 'Arial', size: 20, color: '253442' }, paragraph: { spacing: { after: 100, line: 260 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 34, bold: true, color: navy }, paragraph: { spacing: { before: 120, after: 180 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 24, bold: true, color: navy }, paragraph: { keepNext: true, spacing: { before: 240, after: 120 } } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 850, right: 850, header: 450, footer: 450 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'SCDP / RELATÓRIO INDIVIDUAL', bold: true, color: navy, size: 18 })], spacing: { after: 100 } })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Painel SCDP | Página ', size: 16, color: '617180' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '617180' })] })] }) },
      children: [
        paragraph(report.name, { style: 'Title' }),
        paragraph(`Gerado em ${report.generatedAt} (Brasília)`),
        paragraph(`UGs: ${report.units.join(', ') || 'Não informadas'}`),
        ...report.filters.map(text => paragraph(text)),
        heading('Resumo individual'),
        table(['Indicador', 'Valor', 'Fonte'], reportMetrics(report), [1]),
        heading('PCDPs e empenhos'),
        table(['PCDP / UG', 'Empenhos', 'Realizado SCDP', 'Em andamento'], report.pcdps.map(row => [
          `${row.pcdp}\nUG ${row.ug}`, row.commitments.join('\n') || 'Não informado', formatMoney(row.realizedCents), formatMoney(row.inProgressCents),
        ]), [2, 3]),
        heading('Histórico de bilhetes'),
        table(['PCDP / evento', 'Bilhete / situação', 'Trechos / viagem', 'Emitido', 'A devolver'], report.events.length ? report.events.map(row => [
          `${row.pcdp || 'Não informada'}\n${formatReportDate(row.eventDate || row.date)}`,
          `${row.ticket || 'Não informado'}\n${row.status || ''}`,
          `${row.route || 'Trechos não informados'}\n${formatReportDate(row.tripStart)} a ${formatReportDate(row.tripEnd)}`,
          formatMoney(row.issuedCents), formatMoney(row.toRefundCents),
        ]) : [['Sem eventos no recorte selecionado', '', '', '', '']], [3, 4]),
        heading('Cobertura e critérios'),
        paragraph(`Cobertura de Teto: ${report.coverage.teto}. Cobertura de Bilhetes: ${report.coverage.bilhetes}.`),
        ...report.notes.map(text => paragraph(text, { spacing: { after: 130 } })),
      ],
    }],
  });
  const blob = await Packer.toBlob(document);
  if (download) downloadBlob(blob, fileName(report, 'docx'));
  return blob;
}
