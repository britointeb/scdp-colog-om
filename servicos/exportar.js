import {zipSync,strToU8} from 'fflate';
export const PANEL_TITLE='PAINEL DE GESTÃO DO SCDP DO COLOG OM';
export const CREDIT='Produzido por Cel BRITO.';
export const filename=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'').toLowerCase()||'grafico';
const xml=v=>String(v??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function formatCell(value,column={}){
  if(value==null||value==='')return '—';
  if(typeof value==='number'){
    if(column.type==='money')return value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    if(column.type==='percent')return value.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
    return value.toLocaleString('pt-BR',{maximumFractionDigits:2});
  }
  return String(value);
}
export function makeCsv(data){
  const cell=v=>{let s=String(v??'');if(typeof v!=='number'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\uFEFF'+[data.columns.map(c=>cell(c.label)).join(';'),...data.rows.map(r=>data.columns.map(c=>cell(r[c.key])).join(';'))].join('\r\n');
}
const letter=index=>{let s='',n=index+1;while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
export function makeXlsx(data,title='Dados do gráfico'){
  const last=letter(Math.max(0,data.columns.length-1));
  const cell=(value,ref,style=0)=>typeof value==='number'&&Number.isFinite(value)?`<c r="${ref}" s="${style}"><v>${value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const rows=[`<row r="1" ht="26" customHeight="1">${cell(title,'A1',1)}</row>`,`<row r="2">${cell(CREDIT,'A2',0)}</row>`,`<row r="3" ht="24" customHeight="1">${data.columns.map((c,i)=>cell(c.label,letter(i)+'3',2)).join('')}</row>`];
  data.rows.forEach((r,j)=>rows.push(`<row r="${j+4}">${data.columns.map((c,i)=>cell(r[c.key],letter(i)+(j+4),c.type==='money'?3:c.type==='percent'?4:0)).join('')}</row>`));
  const files={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0.00&quot;%&quot;"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml':`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${data.rows.length+3}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${data.columns.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${c.type==='money'?22:i===0?42:24}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A3:${last}${data.rows.length+3}"/>${data.columns.length>1?`<mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells>`:''}</worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name,value])=>[name,strToU8(value)])),{level:6});
}
export function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export async function makeChartPng(svg,title,{branding=true}={}){
  if(!svg)throw new Error('O gráfico ainda está sendo preparado.');
  const picture=new Image();picture.src=svg;await picture.decode();
  const width=Math.max(1000,picture.naturalWidth||1100),scale=2,chartHeight=Math.round(width*(picture.naturalHeight||400)/(picture.naturalWidth||1100));
  const extra=branding?112:0,canvas=document.createElement('canvas');canvas.width=width*scale;canvas.height=(chartHeight+extra)*scale;
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,chartHeight+extra);
  if(branding){ctx.fillStyle='#1e293b';ctx.font='bold 17px Arial';ctx.fillText(PANEL_TITLE,24,29);ctx.font='bold 21px Arial';const wrap=title.length>90?title.slice(0,87)+'…':title;ctx.fillText(wrap,24,60);ctx.fillStyle='#fbd24c';ctx.fillRect(24,77,width-48,4);ctx.fillStyle='#64748b';ctx.font='12px Arial';ctx.fillText(CREDIT,24,chartHeight+105);}
  ctx.drawImage(picture,0,branding?91:0,width,chartHeight);
  return canvas.toDataURL('image/png');
}
const pdfText=v=>String(v??'').replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/[→↔]/g,' -> ').replace(/[–—]/g,'-').replace(/•/g,' / ');
export async function makePdf(data,title,image){
  const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(pdfText(PANEL_TITLE),14,14);doc.setFontSize(11);doc.text(pdfText(title),14,23);
  let startY=31;
  if(image){const props=doc.getImageProperties(image),width=269,height=Math.min(113,width*props.height/props.width);doc.addImage(image,'PNG',14,28,width,height,undefined,'FAST');startY=height+34;}
  autoTable(doc,{startY,head:[data.columns.map(c=>pdfText(c.label))],body:data.rows.map(r=>data.columns.map(c=>pdfText(formatCell(r[c.key],c)))),styles:{font:'helvetica',fontSize:8,cellPadding:2,overflow:'linebreak',lineColor:[220,227,237],lineWidth:.1},headStyles:{fillColor:[30,41,59],textColor:255},alternateRowStyles:{fillColor:[246,248,252]},margin:{left:14,right:14,bottom:15},didDrawPage:()=>{doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text(CREDIT,14,203);doc.text(String(doc.getNumberOfPages()),280,203);}});
  return doc.output('blob');
}
