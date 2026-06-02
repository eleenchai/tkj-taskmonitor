export const uid = () => Math.random().toString(36).slice(2,9)
export const today = () => new Date().toISOString().split('T')[0]
export const nowISO = () => new Date().toISOString()
export const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}) : '—'
export const fmtTime = t => { if(!t)return''; const[h,m]=t.split(':'); const hr=parseInt(h); return `${hr%12||12}:${m} ${hr>=12?'PM':'AM'}` }
export const fmtDT = iso => { if(!iso)return'—'; const d=new Date(iso); return d.toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-MY',{hour:'2-digit',minute:'2-digit'}) }
export const fmtBytes = b => b<1024?`${b}B`:b<1048576?`${(b/1024).toFixed(1)}KB`:`${(b/1048576).toFixed(1)}MB`
export const daysDiff = d => { if(!d)return null; return Math.ceil((new Date(d)-new Date(today()))/86400000) }
export const genRef = (projects,projectId,tasks) => {
  const proj=projects.find(p=>p.id===projectId); const code=proj?proj.code:'GEN'
  const existing=tasks.filter(t=>t.ref&&t.ref.startsWith(`${code}-`)&&!t.isPersonal)
  const nums=existing.map(t=>{const m=t.ref.match(/(\d+)$/);return m?parseInt(m[1]):0})
  return `${code}-${String((nums.length?Math.max(...nums):0)+1).padStart(4,'0')}`
}
export const readFiles = async (fileList,maxMB=10) => {
  const results=[]
  for(const file of Array.from(fileList)){
    if(file.size>maxMB*1024*1024){alert(`"${file.name}" exceeds ${maxMB}MB`);continue}
    const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})
    results.push({id:uid(),name:file.name,type:file.type,size:file.size,data,uploadedAt:new Date().toLocaleDateString('en-MY')})
  }
  return results
}
export const FILE_ICON = t => {
  if(!t)return'📎'; if(t.startsWith('image/'))return'🖼️'; if(t.includes('pdf'))return'📄'
  if(t.includes('word')||t.includes('document'))return'📝'
  if(t.includes('sheet')||t.includes('excel')||t.includes('csv'))return'📊'
  if(t.includes('presentation')||t.includes('powerpoint'))return'📑'; return'📎'
}
export const SALT = 'TKJ_SALT_v1'
export const hashPassword = async pw => {
  const data=new TextEncoder().encode(pw+SALT)
  const buf=await crypto.subtle.digest('SHA-256',data)
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
}
export const MOODS = [
  {id:'happy',emoji:'😊',label:'Happy',color:'#22c55e'},
  {id:'motivated',emoji:'💪',label:'Motivated',color:'#3b82f6'},
  {id:'tired',emoji:'😴',label:'Tired',color:'#a78bfa'},
  {id:'moody',emoji:'😤',label:'Moody',color:'#f59e0b'},
  {id:'sad',emoji:'😢',label:'Sad',color:'#64748b'},
  {id:'stress',emoji:'😰',label:'Stressed',color:'#f97316'},
  {id:'panic',emoji:'😱',label:'Panicking',color:'#ef4444'},
  {id:'quiet',emoji:'🤐',label:'Need Quiet',color:'#8b5cf6'},
]
export const STATUS_META = {
  'Draft':{color:'#6d28d9',bg:'#ede9fe',dot:'#8b5cf6'},
  'Not Started':{color:'#94a3b8',bg:'#f1f5f9',dot:'#94a3b8'},
  'In Progress':{color:'#1e40af',bg:'#dbeafe',dot:'#3b82f6'},
  'Completed':{color:'#166534',bg:'#dcfce7',dot:'#22c55e'},
  'On Hold':{color:'#92400e',bg:'#fef3c7',dot:'#f59e0b'},
  'Overdue':{color:'#991b1b',bg:'#fee2e2',dot:'#ef4444'},
}
export const PRIORITY_META = {
  'Critical':{color:'#dc2626',label:'CRIT'},
  'High':{color:'#ea580c',label:'HIGH'},
  'Medium':{color:'#ca8a04',label:'MED'},
  'Low':{color:'#16a34a',label:'LOW'},
}
export const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv'
