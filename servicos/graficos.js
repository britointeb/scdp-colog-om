import {formatCell} from './exportar.js';
const colors=['#2563eb','#fbd24c','#ed2429','#1e293b','#64748b','#0891b2','#8b5cf6'];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const compact=v=>Number(v||0).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1});
export function pieOption(data,key){
  const column=data.columns.find(c=>c.key===key)||data.columns.find(c=>c.type!=='text'),category=data.columns[0];
  const sorted=data.rows.map((row,index)=>({name:String(row[category.key]),value:Math.max(0,Number(row[column.key])||0),rowIndex:index})).sort((a,b)=>b.value-a.value),top=sorted.slice(0,12),remaining=sorted.slice(12);
  if(remaining.length)top.push({name:`Outros (${remaining.length})`,value:remaining.reduce((s,r)=>s+r.value,0),rowIndex:-1});
  return {color:colors,animationDuration:200,tooltip:{trigger:'item',confine:true,formatter:p=>`${escape(p.name)}<br/>${escape(column.label)}: ${formatCell(p.value,column)}<br/>${p.percent}%`},legend:{type:'scroll',bottom:0},series:[{name:column.label,type:'pie',radius:['25%','62%'],center:['50%','45%'],data:top,avoidLabelOverlap:true,label:{show:true,alignTo:'edge',edgeDistance:20,lineHeight:14,formatter:p=>`${p.name.length>32?p.name.slice(0,29)+'…':p.name}\n${formatCell(p.value,column)} (${p.percent}%)`,fontSize:10},labelLayout:{moveOverlap:'shiftY',hideOverlap:true},labelLine:{length:14,length2:12}}]};
}
export function stackedOption(data,{percent=false}={}){
  const category=data.columns[0],seriesColumns=data.columns.slice(1).filter(c=>c.type!=='text'),totals=data.rows.map(r=>seriesColumns.reduce((s,c)=>s+(Number(r[c.key])||0),0));
  const isSmall=(row,col,j)=>totals[j]>0&&Number(row[col.key])>0&&Number(row[col.key])/totals[j]<0.08;
  return {color:colors,animationDuration:200,tooltip:{trigger:'axis',confine:true,formatter:ps=>`<b>${escape(ps[0]?.axisValue)}</b><br/>`+ps.map(p=>{const col=seriesColumns[p.seriesIndex],raw=data.rows[p.dataIndex][col.key];return `${escape(p.seriesName)}: ${formatCell(raw,col)}${percent?' ('+Number(p.value).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%)':''}`;}).join('<br/>')},legend:{type:'scroll',bottom:0},grid:{left:20,right:55,top:35,bottom:65,containLabel:true},xAxis:{type:'category',data:data.rows.map(r=>r[category.key]),axisLabel:{rotate:data.rows.length>15?35:0}},yAxis:{type:'value',name:percent?'%':'Quantidade',max:percent?100:null,minInterval:percent?null:1},series:seriesColumns.map((c,i)=>({name:c.label,type:'bar',stack:'total',data:data.rows.map((r,j)=>percent?(totals[j]?Number(r[c.key]||0)/totals[j]*100:0):r[c.key]),barMaxWidth:70,label:{show:true,position:'inside',color:i===1?'#1e293b':'#fff',fontSize:10,rich:{outside:{color:'#1e293b',fontSize:10}},formatter:p=>{if(!p.value)return '';const value=percent?Number(p.value).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':compact(p.value);return isSmall(data.rows[p.dataIndex],c,p.dataIndex)?`{outside|${value}}`:value;}},labelLayout:p=>{
    const row=data.rows[p.dataIndex];if(!p.rect||!isSmall(row,c,p.dataIndex))return {};
    const above=seriesColumns.slice(i+1),amount=Number(row[c.key]),top=p.rect.y-p.rect.height*above.reduce((s,col)=>s+Number(row[col.key]||0),0)/amount;
    return {x:p.rect.x+p.rect.width+6,y:top+9+above.filter(col=>isSmall(row,col,p.dataIndex)).length*16,align:'left',verticalAlign:'middle',hideOverlap:false};
  }}))};
}
export function bubbleOption(data){
  const statuses=[...new Set(data.rows.map(r=>r.status))],months=[...new Set(data.rows.map(r=>r.month))].sort();
  return {color:colors,animationDuration:200,grid:{left:20,right:45,top:20,bottom:65,containLabel:true},tooltip:{trigger:'item',confine:true,formatter:p=>`${escape(p.data.month)}<br/>${escape(p.data.status)}<br/>Eventos: ${p.data.count}`},xAxis:{type:'category',data:months},yAxis:{type:'category',data:statuses,axisLabel:{width:250,overflow:'truncate',fontSize:10}},series:[{type:'scatter',data:data.rows.filter(r=>r.count>0).map(r=>({...r,value:[r.month,r.status,r.count],itemStyle:{color:colors[statuses.indexOf(r.status)%colors.length]}})),symbolSize:v=>Math.min(76,13+Math.sqrt(v[2])*4),label:{show:true,formatter:p=>String(p.data.count),color:'#fff',fontWeight:'bold',textBorderColor:'#1e293b',textBorderWidth:2}}]};
}
