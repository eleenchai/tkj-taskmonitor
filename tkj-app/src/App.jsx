import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { db, fromMember, toMember, fromProject, toProject, fromTask, toTask, fromUpdate, toUpdate, fromMsg, toMsg, fromDR, toDR } from './supabase.js'
import { uid, today, nowISO, fmtDate, fmtTime, fmtDT, fmtBytes, daysDiff, genRef, readFiles, FILE_ICON, hashPassword, MOODS, STATUS_META, PRIORITY_META, ACCEPT } from './helpers.js'
import TKJ_LOGO from './logo.png'

const LS = {
  get:(k)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch{return null}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
}

function useWindowWidth(){
  const [w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return w;
}

/* ﻗ½°ﻗ½° DATA MIGRATION ﻗ½°ﻗ½° */
const DATA_VERSION="v2";
const migrateTaskRefs=(tasks)=>tasks.map(t=>{
  // Old format: TKJ-PVB-2506-001 ﻗ│φ new format: PVB-0001
  if(t.ref&&/^TKJ-(.+)-\d{4}-(\d+)$/.test(t.ref)){
    const m=t.ref.match(/^TKJ-(.+)-\d{4}-(\d+)$/);
    if(m)return{...t,ref:`${m[1]}-${m[2].padStart(4,"0")}`};
  }
  // Old personal format: PERSONAL-m2-001
  if(t.ref&&/^PERSONAL-[^-]+-\d+$/.test(t.ref)&&!t.ref.startsWith("PERSONAL-1")){
    return{...t,ref:`PERSONAL-${Date.now()}-${Math.random().toString(36).slice(2,5)}`};
  }
  return t;
});

/* ﻗ½°ﻗ½° LOGO ﻗ½°ﻗ½° */

/* ﻗ½°ﻗ½° CONSTANTS ﻗ½°ﻗ½° */

/* ﻗ½°ﻗ½° HELPERS ﻗ½°ﻗ½° */
const fmtDatetime=(d,t)=>d?`${fmtDate(d)}`:"";


/* ﻗ½°ﻗ½° SEED DATA ﻗ½°ﻗ½° */
const SEED_MEMBERS=[
  {id:"m1",name:"Eleen",role:"admin",email:"eleen@tkj.com",active:true},
  {id:"m2",name:"Rajan",role:"member",email:"rajan@tkj.com",active:true},
  {id:"m3",name:"Sara",role:"member",email:"sara@tkj.com",active:true},
  {id:"m4",name:"Ahmad",role:"member",email:"ahmad@tkj.com",active:true},
];
const SEED_PROJECTS=[
  {id:"p1",code:"PVB",name:"Pavilion Tower B",active:true},
  {id:"p2",code:"ALI",name:"Ampang Link Infra",active:true},
  {id:"p3",code:"KLS",name:"KL Sentral Office",active:true},
];
const SEED_TASKS=[
  {id:"t1",ref:"PVB-0001",projectId:"p1",task:"Preliminary Cost Plan ﻗ°± Structural",preparedDate:"2025-05-15",dueDate:"2026-07-10",completedDate:"",status:"In Progress",priority:"High",assignorId:"m1",assigneeId:"m2",cc:["m3"],remarks:"Await structural drawings from consultant.",linkedTo:[],attachments:[],isPersonal:false,personalOwnerId:null,createdAt:"2025-05-15T08:00:00.000Z",createdBy:"m1"},
  {id:"t2",ref:"PVB-0002",projectId:"p1",task:"BOQ Preparation ﻗ°± Architectural",preparedDate:"2025-05-18",dueDate:"2026-08-20",completedDate:"",status:"Not Started",priority:"Medium",assignorId:"m1",assigneeId:"m3",cc:[],remarks:"",linkedTo:["t1"],attachments:[],isPersonal:false,personalOwnerId:null,createdAt:"2025-05-18T08:00:00.000Z",createdBy:"m1"},
  {id:"t3",ref:"ALI-0001",projectId:"p2",task:"Contractual Letter ﻗ°± EOT Claim",preparedDate:"2025-05-01",dueDate:"2025-05-28",completedDate:"",status:"Overdue",priority:"Critical",assignorId:"m1",assigneeId:"m2",cc:["m4"],remarks:"Pending approval from legal.",linkedTo:[],attachments:[],isPersonal:false,personalOwnerId:null,createdAt:"2025-05-01T08:00:00.000Z",createdBy:"m1"},
];

/* ﻗ½°ﻗ½° SMALL COMPONENTS ﻗ½°ﻗ½° */
function Badge({text,color,bg,small}){
  return<span style={{background:bg,color,borderRadius:4,padding:small?"2px 7px":"3px 10px",fontSize:small?10:11,fontWeight:700,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{text}</span>;
}
function DueChip({date,time}){
  const d=daysDiff(date);if(d===null)return<span style={{color:"#94a3b8",fontSize:12}}>ﻗ°½</span>;
  let color,bg,prefix;
  if(d<0){color="#991b1b";bg="#fee2e2";prefix=`${Math.abs(d)}d overdue`;}
  else if(d===0){color="#7c2d12";bg="#ffedd5";prefix=`Due today${time?` ﺁ٧ ${fmtTime(time)}`:""}`;}
  else if(d<=3){color="#92400e";bg="#fef3c7";prefix=`${d}d left`;}
  else if(d<=7){color="#1e40af";bg="#dbeafe";prefix=`${d}d left`;}
  else{color="#374151";bg="#f3f4f6";prefix=`${d}d left`;}
  return<div style={{display:"flex",flexDirection:"column",gap:2}}>
    <div style={{fontSize:11,color:"#64748b"}}>{fmtDate(date)}{time&&time!=="18:00"&&<span style={{fontSize:10,color:"#94a3b8",marginLeft:4}}>{fmtTime(time)}</span>}</div>
    <span style={{background:bg,color,borderRadius:3,padding:"1px 6px",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{prefix}</span>
  </div>;
}
function Avatar({name,size=28,color="#0f2557"}){
  const init=(name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return<div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:size*0.38,fontWeight:800,flexShrink:0}}>{init}</div>;
}
function Modal({children,onClose,wide,extraWide}){
  return<div style={{position:"fixed",inset:0,background:"rgba(10,20,50,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(3px)"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:12,width:extraWide?"min(1100px,98vw)":wide?"min(860px,97vw)":"min(680px,95vw)",maxHeight:"93vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(10,20,60,0.25)"}}>
      {children}
    </div>
  </div>;
}
function Sel({label,value,onChange,options,style}){
  const lbl={fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,display:"block"};
  const sel={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"9px 12px",fontSize:13,color:"#1e293b",background:"#f8fafc",outline:"none",boxSizing:"border-box",fontFamily:"inherit",...(style||{})};
  return<div><label style={lbl}>{label}</label><select style={sel} value={value} onChange={e=>onChange(e.target.value)}>{options}</select></div>;
}
function MemberPicker({label,selected=[],onChange,members,excludeIds=[]}){
  const available=members.filter(m=>m.active&&!excludeIds.includes(m.id));
  const toggle=(id)=>onChange(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  const lbl={fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,display:"block"};
  return<div><label style={lbl}>{label}</label>
    <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:10,border:"1.5px solid #e2e8f0",borderRadius:7,background:"#f8fafc",minHeight:44}}>
      {available.map(m=>{const on=selected.includes(m.id);return<button key={m.id} onClick={()=>toggle(m.id)}
        style={{padding:"4px 10px",borderRadius:5,border:`1.5px solid ${on?"#0f2557":"#e2e8f0"}`,background:on?"#0f2557":"#fff",color:on?"#fff":"#475569",fontSize:11,cursor:"pointer",fontWeight:on?700:400,display:"flex",alignItems:"center",gap:5}}>
        <Avatar name={m.name} size={16} color={on?"#c9a227":"#94a3b8"}/>{m.name}
      </button>;})}
    </div>
  </div>;
}

/* ﻗ½°ﻗ½° FILE READER UTIL ﻗ½°ﻗ½° */

/* ﻗ½°ﻗ½° INLINE FILE DISPLAY (auto-show images) ﻗ½°ﻗ½° */
function InlineFiles({files=[]}){
  if(!files.length)return null;
  return<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6}}>
    {files.map(f=>{
      const isImg=f.type&&f.type.startsWith("image/");
      return<div key={f.id}>
        {isImg
          ?<img src={f.data} alt={f.name} style={{maxWidth:"100%",maxHeight:220,borderRadius:7,border:"1px solid #e2e8f0",display:"block"}}/>
          :<a href={f.data} download={f.name} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,color:"#1e40af",fontWeight:600,textDecoration:"none"}}>
            <span style={{fontSize:14}}>{FILE_ICON(f.type)}</span>{f.name} <span style={{color:"#94a3b8"}}>({fmtBytes(f.size)})</span>
          </a>}
      </div>;
    })}
  </div>;
}

/* ﻗ½°ﻗ½° ATTACHMENT PANEL (full) ﻗ½°ﻗ½° */
function AttachmentPanel({attachments=[],onChange,readOnly=false}){
  const inputRef=useRef();
  const [dragging,setDragging]=useState(false);
  const processFiles=async(fileList)=>{
    const results=await readFiles(fileList);
    onChange([...attachments,...results]);
  };
  return<div>
    {!readOnly&&<div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
      onDrop={e=>{e.preventDefault();setDragging(false);processFiles(e.dataTransfer.files);}}
      onClick={()=>inputRef.current?.click()}
      style={{border:`2px dashed ${dragging?"#1e40af":"#cbd5e1"}`,borderRadius:8,padding:"14px",textAlign:"center",cursor:"pointer",background:dragging?"#eff6ff":"#f8fafc",marginBottom:attachments.length?10:0}}>
      <div style={{fontSize:18,marginBottom:3}}>ﹽ±└</div>
      <div style={{fontSize:12,fontWeight:700,color:"#475569"}}>Click or drag to attach</div>
      <div style={{fontSize:10,color:"#94a3b8"}}>Images, PDF, Word, Excel ﺁ٧ Max 10MB</div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} style={{display:"none"}} onChange={e=>processFiles(e.target.files)}/>
    </div>}
    {attachments.map(f=>{
      const isImg=f.type&&f.type.startsWith("image/");
      return<div key={f.id} style={{marginBottom:6}}>
        {isImg
          ?<div style={{position:"relative"}}>
            <img src={f.data} alt={f.name} style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:7,border:"1px solid #e2e8f0",display:"block"}}/>
            <div style={{position:"absolute",bottom:6,right:6,display:"flex",gap:5}}>
              <a href={f.data} download={f.name} style={{padding:"3px 8px",background:"rgba(0,0,0,0.6)",color:"#fff",borderRadius:4,fontSize:10,fontWeight:700,textDecoration:"none"}}>ﻗ،┼</a>
              {!readOnly&&<button onClick={()=>onChange(attachments.filter(x=>x.id!==f.id))} style={{padding:"3px 8px",background:"rgba(220,38,38,0.8)",color:"#fff",border:"none",borderRadius:4,fontSize:10,fontWeight:700,cursor:"pointer"}}>ﻗ¼</button>}
            </div>
          </div>
          :<div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#f8fafc",borderRadius:7,border:"1.5px solid #e2e8f0"}}>
            <div style={{width:30,height:30,borderRadius:5,background:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>{FILE_ICON(f.type)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{fmtBytes(f.size)}</div>
            </div>
            <a href={f.data} download={f.name} style={{padding:"3px 8px",background:"#eff6ff",border:"1px solid #bfdbfe",color:"#1e40af",fontSize:11,fontWeight:700,borderRadius:4,textDecoration:"none"}}>ﻗ،┼</a>
            {!readOnly&&<button onClick={()=>onChange(attachments.filter(x=>x.id!==f.id))} style={{padding:"3px 7px",background:"#fff0f0",border:"1px solid #fecaca",color:"#dc2626",fontSize:11,fontWeight:700,borderRadius:4,cursor:"pointer"}}>ﻗ¼</button>}
          </div>}
      </div>;
    })}
  </div>;
}

/* ﻗ½°ﻗ½° UPDATES TAB ﻗ½°ﻗ½° */
function UpdatesTab({task,updates,members,currentUser,onAddUpdate}){
  const [text,setText]=useState("");
  const [files,setFiles]=useState([]);
  const fileRef=useRef();
  const taskUpdates=updates.filter(u=>u.taskId===task.id).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  const getMember=(id)=>members.find(m=>m.id===id)||{name:"Unknown"};

  const addFiles=async(fileList)=>{const r=await readFiles(fileList);setFiles(f=>[...f,...r]);};
  const submit=()=>{
    if(!text.trim()&&!files.length)return;
    onAddUpdate({id:uid(),taskId:task.id,authorId:currentUser.id,text:text.trim(),attachments:files,timestamp:nowISO(),type:"comment"});
    setText(""); setFiles([]);
  };

  return<div>
    <div style={{maxHeight:340,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,marginBottom:14,paddingRight:2}}>
      {taskUpdates.length===0&&<div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",fontSize:13}}>No updates yet.</div>}
      {taskUpdates.map(u=>{const author=getMember(u.authorId);return<div key={u.id} style={{padding:"12px 14px",background:u.type==="system"?"#f0fdf4":"#f8fafc",borderRadius:9,border:`1px solid ${u.type==="system"?"#bbf7d0":"#e2e8f0"}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
          <Avatar name={author.name} size={30} color={author.role==="admin"?"#c9a227":"#0f2557"}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:800,color:"#0f2557"}}>{author.name}</div>
            <div style={{fontSize:10,color:"#94a3b8"}}>{fmtDT(u.timestamp)}</div>
          </div>
          {u.type==="system"&&<Badge text="System" color="#166534" bg="#dcfce7" small/>}
        </div>
        {u.text&&<div style={{fontSize:13,color:"#374151",lineHeight:1.6,paddingLeft:38}}>{u.text}</div>}
        {u.attachments&&u.attachments.length>0&&<div style={{paddingLeft:38}}><InlineFiles files={u.attachments}/></div>}
        <div style={{fontSize:10,color:"#94a3b8",marginTop:6,paddingLeft:38,fontStyle:"italic"}}>ﹽ½φ This record cannot be edited</div>
      </div>;})}
    </div>
    {/* Input */}
    <div style={{border:"1.5px solid #e2e8f0",borderRadius:9,overflow:"hidden",background:"#fff"}}>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Add an update, note or status changeﻗ° (cannot be edited after posting)" style={{width:"100%",padding:"10px 12px",border:"none",resize:"vertical",minHeight:72,fontSize:13,fontFamily:"inherit",color:"#1e293b",background:"#f8fafc",outline:"none"}}/>
      {files.length>0&&<div style={{padding:"0 12px 8px"}}><InlineFiles files={files}/></div>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"#f1f5f9",borderTop:"1px solid #e2e8f0"}}>
        <button onClick={()=>fileRef.current?.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          ﹽ±└ Attach
        </button>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
        <button onClick={submit} disabled={!text.trim()&&!files.length} style={{padding:"7px 20px",borderRadius:6,border:"none",background:(text.trim()||files.length)?"#0f2557":"#e2e8f0",color:(text.trim()||files.length)?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:(text.trim()||files.length)?"pointer":"default"}}>
          ﹽ±┐ Post Update (Permanent)
        </button>
      </div>
    </div>
  </div>;
}

/* ﻗ½°ﻗ½° MESSAGES TAB ﻗ½°ﻗ½° */
function MessagesTab({task,messages,members,currentUser,onSendMessage}){
  const [text,setText]=useState("");
  const [urgent,setUrgent]=useState(false);
  const [mentions,setMentions]=useState([]);
  const [mentioning,setMentioning]=useState(false);
  const [files,setFiles]=useState([]);
  const bottomRef=useRef();
  const fileRef=useRef();
  const taskMsgs=messages.filter(m=>m.taskId===task.id).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  const getMember=(id)=>members.find(m=>m.id===id)||{name:"Unknown"};
  const AVATAR_COLORS=["#0f2557","#c9a227","#0ea5e9","#8b5cf6","#16a34a","#dc2626"];
  const memberColor=(id)=>AVATAR_COLORS[members.findIndex(m=>m.id===id)%AVATAR_COLORS.length];

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[taskMsgs.length]);

  const handleText=(v)=>{setText(v);setMentioning(v.endsWith("@"));};
  const addMention=(m)=>{setText(prev=>prev.slice(0,-1)+`@${m.name} `);setMentions(prev=>[...new Set([...prev,m.id])]);setMentioning(false);};
  const addFiles=async(fileList)=>{const r=await readFiles(fileList);setFiles(f=>[...f,...r]);};
  const send=()=>{
    if(!text.trim()&&!files.length)return;
    onSendMessage({id:uid(),taskId:task.id,authorId:currentUser.id,text:text.trim(),attachments:files,timestamp:nowISO(),urgent,mentions});
    setText(""); setUrgent(false); setMentions([]); setFiles([]);
  };
  const handleKey=(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}};

  return<div>
    <div style={{maxHeight:320,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,padding:"4px 2px",marginBottom:10}}>
      {taskMsgs.length===0&&<div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",fontSize:13}}>No messages yet. Start the discussion!</div>}
      {taskMsgs.map(msg=>{
        const author=getMember(msg.authorId);
        const isMe=msg.authorId===currentUser.id;
        const mentionedMe=msg.mentions?.includes(currentUser.id);
        const aColor=memberColor(msg.authorId);
        return<div key={msg.id}>
          {msg.urgent&&<div className="urgent-pulse" style={{textAlign:"center",fontSize:11,fontWeight:700,color:"#dc2626",background:"#fee2e2",borderRadius:5,padding:"3px 0",marginBottom:4}}>ﹽﻸﺎ URGENT ﻗ°½ IMMEDIATE ATTENTION REQUIRED</div>}
          <div style={{display:"flex",gap:8,alignItems:"flex-start",flexDirection:isMe?"row-reverse":"row"}}>
            <Avatar name={author.name} size={32} color={aColor}/>
            <div style={{maxWidth:"75%"}}>
              {/* Always show name + time */}
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexDirection:isMe?"row-reverse":"row"}}>
                <span style={{fontSize:12,fontWeight:800,color:isMe?"#0f2557":aColor}}>{isMe?"You":author.name}</span>
                <span style={{fontSize:10,color:"#94a3b8"}}>{fmtDT(msg.timestamp)}</span>
                {msg.urgent&&<span style={{fontSize:10,color:"#dc2626",fontWeight:700}}>ﹽﻸﺎ URGENT</span>}
              </div>
              <div style={{background:isMe?"#0f2557":mentionedMe?"#fef9c3":"#f1f5f9",borderRadius:10,padding:"9px 12px",border:mentionedMe?"1.5px solid #fbbf24":"none"}}>
                {msg.text&&<div style={{fontSize:13,color:isMe?"#fff":"#1e293b",lineHeight:1.5,whiteSpace:"pre-wrap"}}>
                  {msg.text.split(" ").map((word,i)=>word.startsWith("@")?<span key={i} style={{color:isMe?"#93c5fd":"#1e40af",fontWeight:700}}>{word} </span>:<span key={i}>{word} </span>)}
                </div>}
                {msg.attachments&&msg.attachments.length>0&&<div style={{marginTop:msg.text?8:0}}><InlineFiles files={msg.attachments}/></div>}
              </div>
            </div>
          </div>
        </div>;
      })}
      <div ref={bottomRef}/>
    </div>
    {/* @mention dropdown */}
    {mentioning&&<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:7,padding:6,marginBottom:6,boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
      <div style={{fontSize:10,color:"#94a3b8",marginBottom:4,padding:"0 4px"}}>Tag a member:</div>
      {members.filter(m=>m.active&&m.id!==currentUser.id).map(m=><button key={m.id} onClick={()=>addMention(m)} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"7px 8px",background:"none",border:"none",cursor:"pointer",borderRadius:5,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background="#f0f4f8"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
        <Avatar name={m.name} size={22} color={memberColor(m.id)}/><span style={{fontSize:13,color:"#1e293b",fontWeight:600}}>{m.name}</span>
      </button>)}
    </div>}
    {/* Staged files preview */}
    {files.length>0&&<div style={{padding:"6px 10px",background:"#f8fafc",borderRadius:7,marginBottom:6,border:"1px solid #e2e8f0"}}><InlineFiles files={files}/></div>}
    {/* Input */}
    <div style={{border:"1.5px solid #e2e8f0",borderRadius:9,overflow:"hidden",background:"#fff"}}>
      <textarea className="msg-input" value={text} onChange={e=>handleText(e.target.value)} onKeyDown={handleKey} placeholder="Type a messageﻗ° @ to mention, Enter to send" style={{width:"100%",padding:"10px 12px",border:"none",resize:"none",height:58,fontSize:13,fontFamily:"inherit",color:"#1e293b",background:"#fff",outline:"none"}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:"#f8fafc",borderTop:"1px solid #e2e8f0"}}>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>fileRef.current?.click()} style={{padding:"5px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,fontWeight:600,cursor:"pointer"}}>ﹽ±└</button>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
          <button onClick={()=>setUrgent(u=>!u)} style={{padding:"5px 11px",borderRadius:5,border:`1.5px solid ${urgent?"#dc2626":"#e2e8f0"}`,background:urgent?"#fee2e2":"#fff",color:urgent?"#dc2626":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>
            ﹽﻸﺎ {urgent?"URGENT":"Urgent"}
          </button>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:10,color:"#94a3b8"}}>Enter to send</span>
          <button onClick={send} disabled={!text.trim()&&!files.length} style={{padding:"6px 18px",borderRadius:6,border:"none",background:(text.trim()||files.length)?"linear-gradient(135deg,#0f2557,#1e40af)":"#e2e8f0",color:(text.trim()||files.length)?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:(text.trim()||files.length)?"pointer":"default"}}>Send</button>
        </div>
      </div>
    </div>
  </div>;
}

/* ﻗ½°ﻗ½° TASK DETAIL MODAL ﻗ½°ﻗ½° */

/* ﻗ½°ﻗ½° DELETE REQUEST SECTION ﻗ½°ﻗ½° */
function DeleteSection({task,currentUser,isAdmin,deleteRequests,onDeleteAdmin,onRequestDelete}){
  const [showRequestForm,setShowRequestForm]=useState(false);
  const [reason,setReason]=useState("");
  const pending=deleteRequests.find(r=>r.taskId===task.id&&r.status==="pending");
  const allReqs=deleteRequests.filter(r=>r.taskId===task.id).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const isInvolved=task.assigneeId===currentUser.id||task.assignorId===currentUser.id;

  const submitRequest=()=>{
    if(!reason.trim()){alert("Please provide a reason for deletion.");return;}
    onRequestDelete(reason.trim());
    setReason(""); setShowRequestForm(false);
  };

  return<div style={{marginTop:18}}>
    {/* Pending banner */}
    {pending&&<div style={{padding:"10px 14px",background:"#fef3c7",borderRadius:8,border:"1.5px solid #fbbf24",marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:800,color:"#92400e",marginBottom:3}}>ﻗ┘٣ Delete Request Pending</div>
      <div style={{fontSize:12,color:"#92400e"}}>Reason: "{pending.reason}"</div>
      <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>Submitted {fmtDT(pending.timestamp)} ﺁ٧ Awaiting Admin approval</div>
    </div>}

    {/* Previous requests history */}
    {allReqs.filter(r=>r.status!=="pending").map(r=><div key={r.id} style={{padding:"8px 12px",background:r.status==="approved"?"#fee2e2":"#f0fdf4",borderRadius:7,border:`1px solid ${r.status==="approved"?"#fecaca":"#bbf7d0"}`,marginBottom:8,fontSize:11}}>
      <span style={{fontWeight:700,color:r.status==="approved"?"#991b1b":"#166534"}}>{r.status==="approved"?"ﻗ─ Delete Approved":"ﻗﻻ┐ Delete Rejected"}</span>
      <span style={{color:"#94a3b8",marginLeft:8}}>{fmtDT(r.reviewedAt)}</span>
      {r.reviewNote&&<div style={{color:"#475569",marginTop:2}}>Note: {r.reviewNote}</div>}
    </div>)}

    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button onClick={()=>setModal&&null} style={{display:"none"}}/>
      {/* Edit always available */}

      {/* Admin: direct delete (hard) */}
      {isAdmin&&<button onClick={()=>{if(window.confirm("Permanently delete? This is irreversible."))onDeleteAdmin();}} style={{padding:"9px 16px",borderRadius:7,border:"1.5px solid #dc2626",background:"#fff",color:"#dc2626",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        ﹽ«∞ Admin Delete
      </button>}

      {/* Assignee/Assignor: request delete */}
      {!isAdmin&&isInvolved&&!pending&&!task.deleted&&<button onClick={()=>setShowRequestForm(v=>!v)} style={{padding:"9px 16px",borderRadius:7,border:"1.5px solid #f97316",background:"#fff",color:"#f97316",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        ﹽ±┴ Request Deletion
      </button>}

      {!isAdmin&&!isInvolved&&!pending&&<div style={{padding:"9px 12px",background:"#f8fafc",borderRadius:7,border:"1.5px solid #e2e8f0",color:"#94a3b8",fontSize:11,display:"flex",alignItems:"center",gap:5}}>
        ﹽ½φ Only assignee/assignor can request deletion
      </div>}
    </div>

    {/* Request form */}
    {showRequestForm&&<div style={{marginTop:10,padding:"14px",background:"#fff7ed",borderRadius:8,border:"1.5px solid #fed7aa"}}>
      <div style={{fontSize:12,fontWeight:800,color:"#92400e",marginBottom:8}}>ﹽ±┴ Submit Delete Request</div>
      <div style={{fontSize:11,color:"#92400e",marginBottom:10}}>Your request will be sent to Admin for approval. The task remains active until approved. A full audit trail will be kept.</div>
      <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="State your reason for requesting deletion (e.g. duplicate task, created in error, superseded by new ref)..." style={{width:"100%",border:"1.5px solid #fed7aa",borderRadius:6,padding:"8px 10px",fontSize:12,fontFamily:"inherit",resize:"vertical",minHeight:72,outline:"none",background:"#fffbf5",boxSizing:"border-box"}}/>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <button onClick={submitRequest} style={{padding:"7px 18px",borderRadius:6,border:"none",background:"#f97316",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Submit Request</button>
        <button onClick={()=>{setShowRequestForm(false);setReason("");}} style={{padding:"7px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>}
  </div>;
}

function TaskDetailModal({task,tasks,members,projects,updates,messages,currentUser,isAdmin,deleteRequests,onClose,onEdit,onDeleteAdmin,onRequestDelete,onAddUpdate,onSendMessage,onAttachmentChange}){
  const [tab,setTab]=useState("info");
  const sm=STATUS_META[task.status]||STATUS_META["Not Started"];
  const pm=PRIORITY_META[task.priority]||PRIORITY_META["Medium"];
  const getMember=(id)=>members.find(m=>m.id===id);
  const assignee=getMember(task.assigneeId);const assignor=getMember(task.assignorId);
  const proj=projects.find(p=>p.id===task.projectId);
  const linked=tasks.filter(t=>task.linkedTo?.includes(t.id));
  const dependants=tasks.filter(t=>t.linkedTo?.includes(task.id));
  const ccMembers=(task.cc||[]).map(id=>getMember(id)).filter(Boolean);
  const taskUpdates=updates.filter(u=>u.taskId===task.id);
  const taskMsgs=messages.filter(m=>m.taskId===task.id);
  const urgentMsgs=taskMsgs.filter(m=>m.urgent).length;
  const TABS=[
    {id:"info",label:"Info"},
    {id:"updates",label:`Updates${taskUpdates.length?` (${taskUpdates.length})`:""}`},
    {id:"messages",label:`Chat${taskMsgs.length?` (${taskMsgs.length})`:""}${urgentMsgs?" ﹽﻸﺎ":""}`},
    {id:"attachments",label:`Files${task.attachments?.length?` (${task.attachments.length})`:""}`,},
  ];
  const row=(label,val)=><div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #f1f5f9",alignItems:"flex-start"}}>
    <span style={{fontSize:12,color:"#94a3b8",fontWeight:600,flexShrink:0,marginRight:16,minWidth:110}}>{label}</span>
    <span style={{fontSize:13,color:"#1e293b",fontWeight:500,textAlign:"right"}}>{val}</span>
  </div>;
  return<div style={{padding:26}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
      <div style={{flex:1,paddingRight:14}}>
        {task.isPersonal&&<span style={{fontSize:10,background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"2px 8px",fontWeight:700,marginBottom:5,display:"inline-block"}}>ﹽ∞¤ PERSONAL</span>}
        <div style={{fontSize:11,color:"#c9a227",fontWeight:800,letterSpacing:"0.1em",marginBottom:3}}>{task.ref}</div>
        <h2 style={{margin:0,fontSize:16,color:"#0f2557",fontWeight:800,lineHeight:1.3}}>{task.task}</h2>
        {proj&&<div style={{fontSize:12,color:"#64748b",marginTop:3}}>{proj.name}</div>}
      </div>
      <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8",flexShrink:0}}>ﻗ¼</button>
    </div>
    <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
      <Badge text={task.status} color={sm.color} bg={sm.bg}/><Badge text={pm.label} color={pm.color} bg={pm.color+"18"}/>
      {assignee&&<Badge text={`ﹽ∞¤ ${assignee.name}`} color="#475569" bg="#f1f5f9"/>}
      {urgentMsgs>0&&<Badge text={`ﹽﻸﺎ ${urgentMsgs} urgent`} color="#991b1b" bg="#fee2e2"/>}
    </div>
    <div style={{display:"flex",gap:0,borderBottom:"2px solid #f1f5f9",marginBottom:16}}>
      {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 14px",border:"none",borderBottom:tab===t.id?"2px solid #0f2557":"2px solid transparent",marginBottom:-2,background:"none",color:tab===t.id?"#0f2557":"#94a3b8",fontSize:12,fontWeight:tab===t.id?800:500,cursor:"pointer"}}>{t.label}</button>)}
    </div>
    {tab==="info"&&<div>
      {row("Ref",task.ref)}{row("Prepared",fmtDate(task.preparedDate))}{row("Due Date",<DueChip date={task.dueDate} time={task.dueTime}/>)}
      {row("Completed",task.completedDate?<span style={{color:"#166534",fontWeight:600}}>ﻗ─ {fmtDate(task.completedDate)}</span>:"ﻗ°½")}
      {row("Assignor",assignor?<div style={{display:"flex",alignItems:"center",gap:6}}><Avatar name={assignor.name} size={20}/>{assignor.name}</div>:"ﻗ°½")}
      {row("Assignee",assignee?<div style={{display:"flex",alignItems:"center",gap:6}}><Avatar name={assignee.name} size={20}/>{assignee.name}</div>:"ﻗ°½")}
      {ccMembers.length>0&&row("CC",<div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>{ccMembers.map(m=><Badge key={m.id} text={m.name} color="#475569" bg="#f1f5f9" small/>)}</div>)}
      {task.remarks&&row("Remarks",task.remarks)}
      {linked.length>0&&<div style={{marginTop:12}}><div style={{fontSize:11,color:"#94a3b8",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Depends On</div>
        {linked.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#f8fafc",borderRadius:6,marginBottom:5,border:"1px solid #e2e8f0"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:STATUS_META[t.status]?.dot||"#94a3b8",flexShrink:0}}/><span style={{fontSize:11,color:"#0f2557",fontWeight:600}}>{t.ref}</span>
          <span style={{fontSize:11,color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.task}</span><Badge text={t.status} color={STATUS_META[t.status]?.color} bg={STATUS_META[t.status]?.bg} small/>
        </div>)}
      </div>}
      {dependants.length>0&&<div style={{marginTop:10}}><div style={{fontSize:11,color:"#94a3b8",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Blocking</div>
        {dependants.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#fff7ed",borderRadius:6,marginBottom:5,border:"1px solid #fed7aa"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:STATUS_META[t.status]?.dot||"#94a3b8",flexShrink:0}}/><span style={{fontSize:11,color:"#0f2557",fontWeight:600}}>{t.ref}</span>
          <span style={{fontSize:11,color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.task}</span><Badge text={t.status} color={STATUS_META[t.status]?.color} bg={STATUS_META[t.status]?.bg} small/>
        </div>)}
      </div>}
      <DeleteSection task={task} currentUser={currentUser} isAdmin={isAdmin} deleteRequests={deleteRequests} onDeleteAdmin={onDeleteAdmin} onRequestDelete={onRequestDelete}/>
    </div>}
    {tab==="updates"&&<UpdatesTab task={task} updates={updates} members={members} currentUser={currentUser} onAddUpdate={onAddUpdate}/>}
    {tab==="messages"&&<MessagesTab task={task} messages={messages} members={members} currentUser={currentUser} onSendMessage={onSendMessage}/>}
    {tab==="attachments"&&<AttachmentPanel attachments={task.attachments||[]} onChange={onAttachmentChange}/>}
  </div>;
}

/* ﻗ½°ﻗ½° KPI VIEW ﻗ½°ﻗ½° */
function KPIView({tasks,members,projects,moods}){
  const [kpiBy,setKpiBy]=useState("project");
  const et=tasks.filter(t=>!t.isPersonal).map(t=>{
    if(t.status!=="Completed"&&t.status!=="On Hold"&&t.dueDate&&daysDiff(t.dueDate)<0)return{...t,status:"Overdue"};return t;
  });
  const calcStats=(taskList)=>{
    const total=taskList.length,completed=taskList.filter(t=>t.status==="Completed").length;
    const overdue=taskList.filter(t=>t.status==="Overdue").length,inProgress=taskList.filter(t=>t.status==="In Progress").length;
    const onTime=taskList.filter(t=>t.status==="Completed"&&t.dueDate&&t.completedDate&&t.completedDate<=t.dueDate).length;
    return{total,completed,overdue,inProgress,compRate:total?Math.round((completed/total)*100):0,overdueRate:total?Math.round((overdue/total)*100):0,onTimeRate:completed?Math.round((onTime/completed)*100):0};
  };
  const groups=kpiBy==="project"
    ?projects.filter(p=>p.active).map(p=>({id:p.id,label:p.name,tasks:et.filter(t=>t.projectId===p.id)}))
    :members.filter(m=>m.active).map(m=>({id:m.id,label:m.name,tasks:et.filter(t=>t.assigneeId===m.id)}));
  const overall=calcStats(et);
  const todayStr=today();
  const todayMoods=Object.entries(moods).filter(([k])=>k.startsWith(todayStr));

  return<div style={{padding:24}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
      <h2 style={{fontSize:17,fontWeight:800,color:"#0f2557",margin:0}}>ﹽ±├ KPI Analysis</h2>
      <div style={{display:"flex",background:"#f1f5f9",borderRadius:8,padding:3,gap:2}}>
        {[["project","By Project"],["assignee","By Assignee"]].map(([v,l])=><button key={v} onClick={()=>setKpiBy(v)} style={{padding:"6px 14px",borderRadius:6,border:"none",background:kpiBy===v?"#0f2557":"transparent",color:kpiBy===v?"#fff":"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>)}
      </div>
    </div>
    {/* Team mood today */}
    {todayMoods.length>0&&<div style={{background:"#fff",borderRadius:10,padding:"14px 18px",marginBottom:16,boxShadow:"0 2px 12px rgba(0,0,0,0.05)"}}>
      <div style={{fontSize:12,fontWeight:800,color:"#0f2557",marginBottom:10,letterSpacing:"0.04em"}}>TEAM MOOD TODAY</div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {todayMoods.map(([k,moodId])=>{
          const memberId=k.replace(todayStr+"_","");
          const member=members.find(m=>m.id===memberId);
          const mood=MOODS.find(m=>m.id===moodId);
          if(!member||!mood)return null;
          return<div key={k} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 12px",background:mood.color+"15",borderRadius:8,border:`1.5px solid ${mood.color}40`}}>
            <Avatar name={member.name} size={24} color={mood.color}/>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{member.name}</div>
              <div style={{fontSize:13}}>{mood.emoji} {mood.label}</div>
            </div>
          </div>;
        })}
      </div>
    </div>}
    {/* Overall */}
    <div style={{background:"linear-gradient(135deg,#0a1a42,#0f2557)",borderRadius:12,padding:"16px 18px",marginBottom:16}}>
      <div style={{fontSize:10,color:"#7ba3d4",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>Overall</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:10}}>
        {[[overall.total,"Total","#60a5fa"],[`${overall.compRate}%`,"Completion","#34d399"],[overall.overdue,"Overdue","#f87171"],[`${overall.onTimeRate}%`,"On-Time","#fbbf24"],[overall.inProgress,"In Progress","#818cf8"]].map(([n,l,c])=><div key={l} style={{textAlign:"center"}}>
          <div style={{fontSize:26,fontWeight:900,color:c,lineHeight:1}}>{n}</div>
          <div style={{fontSize:9,color:"#7ba3d4",marginTop:3,fontWeight:600}}>{l}</div>
        </div>)}
      </div>
    </div>
    {groups.filter(g=>g.tasks.length>0).map(g=>{
      const s=calcStats(g.tasks);
      return<div key={g.id} style={{background:"#fff",borderRadius:10,padding:"14px 16px",marginBottom:10,boxShadow:"0 2px 12px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {kpiBy==="assignee"&&<Avatar name={g.label} size={26}/>}
            <span style={{fontSize:14,fontWeight:700,color:"#0f2557"}}>{g.label}</span>
          </div>
          <div style={{display:"flex",gap:7}}>
            {s.overdue>0&&<Badge text={`ﻗﻸ  ${s.overdue} overdue`} color="#991b1b" bg="#fee2e2" small/>}
            <Badge text={`${s.compRate}% done`} color={s.compRate>=80?"#166534":s.compRate>=50?"#92400e":"#991b1b"} bg={s.compRate>=80?"#dcfce7":s.compRate>=50?"#fef3c7":"#fee2e2"} small/>
          </div>
        </div>
        <div style={{height:7,background:"#f1f5f9",borderRadius:4,overflow:"hidden",marginBottom:8}}>
          <div style={{height:"100%",display:"flex"}}>
            <div style={{width:`${(s.completed/Math.max(s.total,1))*100}%`,background:"#22c55e"}}/>
            <div style={{width:`${(s.inProgress/Math.max(s.total,1))*100}%`,background:"#3b82f6"}}/>
            <div style={{width:`${(s.overdue/Math.max(s.total,1))*100}%`,background:"#ef4444"}}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5}}>
          {[["Total",s.total,"#475569"],["Done",s.completed,"#166534"],["In Prog",s.inProgress,"#1e40af"],["Overdue",s.overdue,"#991b1b"],["On-Time",`${s.onTimeRate}%`,"#92400e"]].map(([l,v,c])=><div key={l} style={{textAlign:"center",padding:"5px 3px",background:"#f8fafc",borderRadius:5}}>
            <div style={{fontWeight:800,color:c,fontSize:13}}>{v}</div>
            <div style={{fontSize:9,color:"#94a3b8",marginTop:1}}>{l}</div>
          </div>)}
        </div>
      </div>;
    })}
  </div>;
}

/* ﻗ½°ﻗ½° ADMIN VIEW ﻗ½°ﻗ½° */
function AdminView({members,projects,tasks,updates=[],deleteRequests,currentUser,onUpdateMembers,onUpdateProjects,onReviewDeleteRequest}){
  const [tab,setTab]=useState("projects");
  const [editProj,setEditProj]=useState(null);
  const [editMember,setEditMember]=useState(null);
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"8px 12px",fontSize:13,color:"#1e293b",background:"#f8fafc",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const lbl={fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,display:"block"};
  const r2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:12};
  const saveProject=(p)=>{if(!p.name||!p.code){alert("Name and code required");return;}const exists=projects.find(x=>x.id!==p.id&&x.code.toLowerCase()===p.code.toLowerCase());if(exists){alert("Code exists");return;}onUpdateProjects(projects.find(x=>x.id===p.id)?projects.map(x=>x.id===p.id?p:x):[...projects,{...p,id:uid(),active:true}]);setEditProj(null);};
  const saveMember=(m)=>{if(!m.name){alert("Name required");return;}onUpdateMembers(members.find(x=>x.id===m.id)?members.map(x=>x.id===m.id?m:x):[...members,{...m,id:uid(),active:true}]);setEditMember(null);};
  const [reviewModal,setReviewModal]=useState(null);
  const [reviewNote,setReviewNote]=useState("");
  const pendingReqs=deleteRequests.filter(r=>r.status==="pending");
  const allReqs=[...deleteRequests].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));

  return<div style={{padding:26}}>
    <h2 style={{fontSize:17,fontWeight:800,color:"#0f2557",margin:"0 0 18px"}}>ﻗﻸﻷﻡ٨┘ Admin Settings</h2>
    <div style={{display:"flex",gap:0,borderBottom:"2px solid #f1f5f9",marginBottom:18}}>
      {[["projects","ﹽ±· Projects"],["members","ﹽ∞ﺄ Members"],["delreqs","ﹽ«∞ Delete Requests"],["audit","ﹽ±┴ Audit Trail"]].map(([id,l])=><button key={id} onClick={()=>setTab(id)} style={{padding:"8px 18px",border:"none",borderBottom:tab===id?"2px solid #0f2557":"2px solid transparent",marginBottom:-2,background:"none",color:tab===id?"#0f2557":"#94a3b8",fontSize:13,fontWeight:tab===id?800:500,cursor:"pointer"}}>{l}</button>)}
    </div>
    {tab==="projects"&&<div>
      <div style={{marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,color:"#64748b"}}>Admin-controlled project list.</span>
        <button onClick={()=>setEditProj({id:uid(),code:"",name:"",active:true})} style={{padding:"7px 14px",borderRadius:7,border:"none",background:"#0f2557",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ New Project</button>
      </div>
      {editProj&&<div style={{background:"#f8fafc",borderRadius:8,padding:14,marginBottom:12,border:"1.5px solid #e2e8f0"}}>
        <div style={r2}>
          <div><label style={lbl}>Code (e.g. PVB)</label><input style={inp} value={editProj.code} onChange={e=>setEditProj(p=>({...p,code:e.target.value.toUpperCase().slice(0,6)}))} placeholder="PVB"/></div>
          <div><label style={lbl}>Project Name</label><input style={inp} value={editProj.name} onChange={e=>setEditProj(p=>({...p,name:e.target.value}))} placeholder="Pavilion Tower B"/></div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button onClick={()=>saveProject(editProj)} style={{padding:"7px 16px",borderRadius:6,border:"none",background:"#0f2557",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Save</button>
          <button onClick={()=>setEditProj(null)} style={{padding:"7px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>}
      {projects.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#fff",borderRadius:7,marginBottom:6,border:"1.5px solid #e2e8f0"}}>
        <span style={{background:"#0f2557",color:"#c9a227",borderRadius:5,padding:"3px 8px",fontSize:11,fontWeight:800}}>{p.code}</span>
        <span style={{flex:1,fontSize:13,fontWeight:600,color:"#1e293b"}}>{p.name}</span>
        {!p.active&&<Badge text="Inactive" color="#94a3b8" bg="#f1f5f9" small/>}
        <button onClick={()=>setEditProj(p)} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,cursor:"pointer"}}>Edit</button>
        <button onClick={()=>onUpdateProjects(projects.map(x=>x.id===p.id?{...x,active:!x.active}:x))} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:p.active?"#dc2626":"#166534",fontSize:11,cursor:"pointer"}}>{p.active?"Deactivate":"Activate"}</button>
      </div>)}
    </div>}
    {tab==="members"&&<div>
      <div style={{marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,color:"#64748b"}}>Manage team members.</span>
        <button onClick={()=>setEditMember({id:uid(),name:"",role:"member",email:"",active:true})} style={{padding:"7px 14px",borderRadius:7,border:"none",background:"#0f2557",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Add Member</button>
      </div>
      {editMember&&<div style={{background:"#f8fafc",borderRadius:8,padding:14,marginBottom:12,border:"1.5px solid #e2e8f0"}}>
        <div style={r2}>
          <div><label style={lbl}>Full Name</label><input style={inp} value={editMember.name} onChange={e=>setEditMember(m=>({...m,name:e.target.value}))} placeholder="Full Name"/></div>
          <div><label style={lbl}>Email</label><input style={inp} value={editMember.email} onChange={e=>setEditMember(m=>({...m,email:e.target.value}))} placeholder="name@tkj.com"/></div>
        </div>
        <div style={{marginTop:10}}><label style={lbl}>Role</label>
          <select style={inp} value={editMember.role} onChange={e=>setEditMember(m=>({...m,role:e.target.value}))}><option value="member">Member</option><option value="admin">Admin</option></select>
        </div>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button onClick={()=>saveMember(editMember)} style={{padding:"7px 16px",borderRadius:6,border:"none",background:"#0f2557",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Save</button>
          <button onClick={()=>setEditMember(null)} style={{padding:"7px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>}
      {members.map(m=><div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#fff",borderRadius:7,marginBottom:6,border:"1.5px solid #e2e8f0"}}>
        <Avatar name={m.name} size={32} color={m.role==="admin"?"#c9a227":"#0f2557"}/>
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{m.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>{m.email}</div></div>
        <Badge text={m.role==="admin"?"Admin":"Member"} color={m.role==="admin"?"#92400e":"#1e40af"} bg={m.role==="admin"?"#fef3c7":"#dbeafe"} small/>
        {!m.active&&<Badge text="Inactive" color="#94a3b8" bg="#f1f5f9" small/>}
        {m.id!==currentUser.id&&<button onClick={()=>setEditMember(m)} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,cursor:"pointer"}}>Edit</button>}
        {m.id!==currentUser.id&&<button onClick={()=>onUpdateMembers(members.map(x=>x.id===m.id?{...x,active:!x.active}:x))} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:m.active?"#dc2626":"#166534",fontSize:11,cursor:"pointer"}}>{m.active?"Deactivate":"Activate"}</button>}
      </div>)}
    </div>}
    {tab==="delreqs"&&<div>
      {pendingReqs.length>0&&<div style={{background:"#fef3c7",borderRadius:8,padding:"10px 14px",marginBottom:14,border:"1.5px solid #fbbf24"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#92400e",marginBottom:2}}>ﻗ┘٣ {pendingReqs.length} Pending Delete Request{pendingReqs.length>1?"s":""} ﻗ°½ Action Required</div>
      </div>}
      {allReqs.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:13}}>No delete requests yet.</div>}
      {allReqs.map(r=>{
        const task=tasks.find(t=>t.id===r.taskId);
        const requester=members.find(m=>m.id===r.requestedBy);
        const reviewer=r.reviewedBy?members.find(m=>m.id===r.reviewedBy):null;
        return<div key={r.id} style={{background:"#fff",borderRadius:9,padding:"14px 16px",marginBottom:10,border:`1.5px solid ${r.status==="pending"?"#fbbf24":r.status==="approved"?"#fecaca":"#bbf7d0"}`}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#c9a227"}}>{task?.ref||r.taskId}</div>
              <div style={{fontSize:13,fontWeight:700,color:"#0f2557"}}>{task?.task||"(task deleted)"}</div>
            </div>
            <Badge text={r.status==="pending"?"ﻗ┘٣ Pending":r.status==="approved"?"ﻗ─ Approved":"ﻗﻻ┐ Rejected"} color={r.status==="pending"?"#92400e":r.status==="approved"?"#991b1b":"#166534"} bg={r.status==="pending"?"#fef3c7":r.status==="approved"?"#fee2e2":"#dcfce7"} small/>
          </div>
          <div style={{fontSize:12,color:"#475569",marginBottom:4}}><span style={{fontWeight:700}}>Requested by:</span> {requester?.name||"ﻗ°½"} ﺁ٧ {fmtDT(r.timestamp)}</div>
          <div style={{fontSize:12,color:"#475569",marginBottom:6,background:"#f8fafc",padding:"6px 10px",borderRadius:5}}><span style={{fontWeight:700}}>Reason:</span> "{r.reason}"</div>
          {reviewer&&<div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Reviewed by {reviewer.name} on {fmtDT(r.reviewedAt)}{r.reviewNote?` ﻗ°½ "${r.reviewNote}"`:""}</div>}
          {r.status==="pending"&&<div>
            {reviewModal===r.id&&<div style={{marginBottom:8}}>
              <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Add a note (optional)..." style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:6,padding:"7px 10px",fontSize:12,fontFamily:"inherit",resize:"vertical",minHeight:56,outline:"none",boxSizing:"border-box"}}/>
            </div>}
            <div style={{display:"flex",gap:8}}>
              {reviewModal!==r.id&&<button onClick={()=>{setReviewModal(r.id);setReviewNote("");}} style={{padding:"6px 14px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Review</button>}
              {reviewModal===r.id&&<>
                <button onClick={()=>{onReviewDeleteRequest(r.id,true,reviewNote);setReviewModal(null);}} style={{padding:"6px 16px",borderRadius:6,border:"none",background:"#dc2626",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>ﻗ─ Approve & Delete</button>
                <button onClick={()=>{onReviewDeleteRequest(r.id,false,reviewNote);setReviewModal(null);}} style={{padding:"6px 16px",borderRadius:6,border:"none",background:"#166534",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>ﻗﻻ┐ Reject Request</button>
                <button onClick={()=>setReviewModal(null)} style={{padding:"6px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Cancel</button>
              </>}
            </div>
          </div>}
        </div>;
      })}
    </div>}
    {tab==="audit"&&<div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Complete system audit trail ﻗ°½ all creates, updates, deletions and delete request decisions. Read-only.</div>
      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
        {[
          {label:"Total Events",n:updates.length,color:"#0f2557"},
          {label:"System Events",n:updates.filter(u=>u.type==="system").length,color:"#166534"},
          {label:"User Updates",n:updates.filter(u=>u.type==="comment").length,color:"#1e40af"},
          {label:"Deletion Events",n:updates.filter(u=>u.text&&u.text.includes("delete")).length,color:"#dc2626"},
        ].map(s=><div key={s.label} style={{background:"#fff",borderRadius:8,padding:"12px 14px",border:`2px solid ${s.color}20`,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
          <div style={{fontSize:24,fontWeight:900,color:s.color}}>{s.n}</div>
          <div style={{fontSize:10,color:"#64748b",marginTop:3,fontWeight:600}}>{s.label}</div>
        </div>)}
      </div>
      {/* Audit log */}
      <div style={{maxHeight:480,overflowY:"auto",display:"flex",flexDirection:"column",gap:7}}>
        {[...updates].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(u=>{
          const author=members.find(m=>m.id===u.authorId)||{name:"System"};
          const task=tasks.find(t=>t.id===u.taskId);
          const isDeletion=u.text&&(u.text.toLowerCase().includes("delete")||u.text.toLowerCase().includes("deleted"));
          const isApproval=u.text&&u.text.includes("APPROVED");
          const isRejection=u.text&&u.text.includes("REJECTED");
          const bgColor=isDeletion?"#fff5f5":isApproval?"#fff5f5":isRejection?"#f0fdf4":u.type==="system"?"#f0fdf4":"#f8fafc";
          const borderColor=isDeletion?"#fecaca":isApproval?"#fecaca":isRejection?"#bbf7d0":u.type==="system"?"#bbf7d0":"#e2e8f0";
          return<div key={u.id} style={{padding:"10px 14px",background:bgColor,borderRadius:8,border:`1px solid ${borderColor}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
              <Avatar name={author.name} size={24} color={u.type==="system"?"#166534":"#0f2557"}/>
              <span style={{fontSize:12,fontWeight:700,color:"#0f2557"}}>{author.name}</span>
              {u.type==="system"&&<Badge text="SYSTEM" color="#166534" bg="#dcfce7" small/>}
              {isDeletion&&<Badge text="DELETION" color="#991b1b" bg="#fee2e2" small/>}
              {isRejection&&<Badge text="REJECT" color="#166534" bg="#dcfce7" small/>}
              <span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{fmtDT(u.timestamp)}</span>
            </div>
            {task&&<div style={{fontSize:10,color:"#64748b",marginBottom:4,paddingLeft:32}}>Task: <span style={{fontWeight:700,color:"#0f2557"}}>{task.ref}</span> ﻗ°½ {task.task}</div>}
            <div style={{fontSize:12,color:"#374151",lineHeight:1.5,paddingLeft:32,whiteSpace:"pre-wrap"}}>{u.text}</div>
          </div>;
        })}
        {updates.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:13}}>No audit events yet.</div>}
      </div>
    </div>}
  </div>;
}

/* ﻗ½°ﻗ½° TASK FORM ﻗ½°ﻗ½° */
function TaskForm({initial,tasks,members,projects,currentUser,onSave,onCancel}){
  const DRAFT_KEY=`tkj_form_draft_${currentUser.id}`;
  const blank={id:uid(),projectId:"",task:"",preparedDate:today(),dueDate:"",dueTime:"18:00",completedDate:"",status:"Not Started",priority:"Medium",assignorId:currentUser.id,assigneeId:"",cc:[],remarks:"",linkedTo:[],attachments:[],isPersonal:false,personalOwnerId:null,createdAt:nowISO(),createdBy:currentUser.id};
  const [f,setF]=useState(()=>{
    if(initial)return{...blank,...initial,cc:initial?.cc||[],linkedTo:initial?.linkedTo||[],attachments:initial?.attachments||[]};
    // Recover autosaved draft if exists
    try{const saved=localStorage.getItem(DRAFT_KEY);if(saved){const d=JSON.parse(saved);if(d&&d._autoSaved)return{...blank,...d};}}catch{}
    return blank;
  });
  const [isPersonal,setIsPersonal]=useState(initial?.isPersonal||false);
  const [hasDraftRecovery,setHasDraftRecovery]=useState(()=>{try{const s=localStorage.getItem(DRAFT_KEY);return!!s&&!initial;}catch{return false;}});
  const upd=(k,v)=>{
    setF(p=>{
      const next={...p,[k]:v};
      // Auto-save to localStorage every keystroke (no attachments = too large)
      if(!initial)try{localStorage.setItem(DRAFT_KEY,JSON.stringify({...next,attachments:[],_autoSaved:true}));}catch{}
      return next;
    });
  };
  const clearDraft=()=>{try{localStorage.removeItem(DRAFT_KEY);}catch{}setHasDraftRecovery(false);};
  const discardDraft=()=>{setF(blank);clearDraft();};
  const activeProjects=projects.filter(p=>p.active);
  const lbl={fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,display:"block"};
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"9px 12px",fontSize:13,color:"#1e293b",background:"#f8fafc",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const r2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:16};
  const handleSave=(asDraft=false)=>{
    if(!f.task.trim()){alert("Task description required.");return;}
    if(!asDraft){
      if(!isPersonal&&!f.projectId){alert("Please select a project.");return;}
      if(!f.assigneeId){alert("Please select an assignee.");return;}
    }
    const finalTask={...f,isPersonal,personalOwnerId:isPersonal?currentUser.id:null,projectId:isPersonal?null:f.projectId,status:asDraft?"Draft":f.status};
    if(!initial){finalTask.ref=isPersonal?`PERSONAL-${Date.now()}`:asDraft?`DRAFT-${Date.now()}`:(f.projectId?genRef(projects,f.projectId,tasks):`DRAFT-${Date.now()}`);}
    clearDraft();
    onSave(finalTask);
  };
  return<div style={{padding:30}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
      <div>
        <h2 style={{margin:0,fontSize:18,color:"#0f2557",fontWeight:800}}>{initial?"Edit Task":"New Task"}</h2>
        <p style={{margin:"3px 0 0",fontSize:11,color:"#94a3b8"}}>TKJ Task Monitoring ﺁ٧ {currentUser.name}</p>
      </div>
      {hasDraftRecovery&&!initial&&<div style={{position:"absolute",top:0,left:0,right:0,background:"#fef3c7",padding:"8px 16px",borderRadius:"12px 12px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12}}>
        <span style={{color:"#92400e",fontWeight:700}}>ﹽ±┴ Unsaved draft recovered ﻗ°½ continue where you left off?</span>
        <div style={{display:"flex",gap:8}}>
          <button onClick={discardDraft} style={{padding:"3px 10px",borderRadius:4,border:"1px solid #fbbf24",background:"#fff",color:"#92400e",fontSize:11,cursor:"pointer"}}>Discard</button>
          <button onClick={clearDraft} style={{padding:"3px 10px",borderRadius:4,border:"none",background:"#92400e",color:"#fff",fontSize:11,cursor:"pointer"}}>Keep</button>
        </div>
      </div>}
      <button onClick={onCancel} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8"}}>ﻗ¼</button>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:18,padding:"10px 14px",background:"#f8fafc",borderRadius:8,border:"1.5px solid #e2e8f0"}}>
      <button onClick={()=>setIsPersonal(false)} style={{padding:"6px 16px",borderRadius:6,border:"none",background:!isPersonal?"#0f2557":"transparent",color:!isPersonal?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer"}}>ﹽ±· Project Task</button>
      <button onClick={()=>setIsPersonal(true)} style={{padding:"6px 16px",borderRadius:6,border:"none",background:isPersonal?"#8b5cf6":"transparent",color:isPersonal?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer"}}>ﹽ∞¤ Personal Task</button>
      {isPersonal&&<span style={{fontSize:11,color:"#8b5cf6",fontWeight:600,alignSelf:"center"}}>Only visible to you</span>}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:15}}>
      {!isPersonal&&<Sel label="Project" value={f.projectId} onChange={v=>upd("projectId",v)} options={[<option key="" value="">ﻗ°½ Select Project ﻗ°½</option>,...activeProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)]}/>}
      <div><label style={lbl}>Task / Document Description</label><input style={inp} value={f.task} onChange={e=>upd("task",e.target.value)} placeholder="e.g. BOQ Preparation ﻗ°± Civil Works"/></div>
      <div style={r2}>
        <div><label style={lbl}>Prepared Date</label><input type="date" style={inp} value={f.preparedDate} onChange={e=>upd("preparedDate",e.target.value)}/></div>
        <div>
          <label style={lbl}>Due Date</label>
          <div style={{display:"flex",gap:8}}>
            <input type="date" style={{...inp,flex:2}} value={f.dueDate} onChange={e=>upd("dueDate",e.target.value)}/>
            <div style={{flex:1,display:"flex",flexDirection:"column"}}>
              <input type="time" style={{...inp,fontSize:12}} value={f.dueTime||"18:00"} onChange={e=>upd("dueTime",e.target.value)}/>
              <span style={{fontSize:9,color:"#94a3b8",marginTop:2}}>Default 6:00 PM</span>
            </div>
          </div>
        </div>
      </div>
      <div style={r2}>
        <div><label style={lbl}>Completed Date</label><input type="date" style={inp} value={f.completedDate} onChange={e=>upd("completedDate",e.target.value)}/></div>
        <Sel label="Status" value={f.status} onChange={v=>upd("status",v)} options={Object.keys(STATUS_META).map(s=><option key={s}>{s}</option>)}/>
      </div>
      <div style={r2}>
        <Sel label="Priority" value={f.priority} onChange={v=>upd("priority",v)} options={Object.keys(PRIORITY_META).map(p=><option key={p}>{p}</option>)}/>
        <Sel label="Assignor" value={f.assignorId} onChange={v=>upd("assignorId",v)} options={members.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}/>
      </div>
      <Sel label="Assignee" value={f.assigneeId} onChange={v=>upd("assigneeId",v)} options={[<option key="" value="">ﻗ°½ Select Assignee ﻗ°½</option>,...members.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.name}{m.role==="admin"?" (Admin)":""}</option>)]}/>
      {!isPersonal&&<MemberPicker label="CC (Copy To)" selected={f.cc} onChange={v=>upd("cc",v)} members={members} excludeIds={[f.assigneeId].filter(Boolean)}/>}
      <div><label style={lbl}>Remarks / Notes</label><textarea style={{...inp,resize:"vertical",minHeight:56}} value={f.remarks} onChange={e=>upd("remarks",e.target.value)}/></div>
      <div><label style={lbl}>Attachments</label><AttachmentPanel attachments={f.attachments} onChange={v=>upd("attachments",v)}/></div>
      {tasks.filter(t=>t.id!==f.id&&!t.isPersonal).length>0&&<div>
        <label style={lbl}>Linked Tasks</label>
        <div style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:10,display:"flex",flexWrap:"wrap",gap:6,background:"#f8fafc"}}>
          {tasks.filter(t=>t.id!==f.id&&!t.isPersonal).map(t=>{const on=f.linkedTo.includes(t.id);return<button key={t.id} onClick={()=>upd("linkedTo",on?f.linkedTo.filter(x=>x!==t.id):[...f.linkedTo,t.id])}
            style={{padding:"4px 9px",borderRadius:5,border:`1.5px solid ${on?"#0f2557":"#e2e8f0"}`,background:on?"#0f2557":"#fff",color:on?"#fff":"#475569",fontSize:11,cursor:"pointer",fontWeight:on?700:400}}>
            {t.ref} ﻗ°± {t.task.slice(0,18)}{t.task.length>18?"ﻗ°":""}
          </button>;})}
        </div>
      </div>}
    </div>
    <div style={{display:"flex",gap:12,marginTop:22,justifyContent:"flex-end"}}>
      <button onClick={onCancel} style={{padding:"10px 22px",borderRadius:7,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
      {!initial&&<button onClick={()=>handleSave(true)} style={{padding:"10px 22px",borderRadius:7,border:"1.5px solid #8b5cf6",background:"#fff",color:"#8b5cf6",fontSize:13,fontWeight:700,cursor:"pointer"}}>
        ﹽφﺹ Save Draft
      </button>}
      <button onClick={()=>handleSave(false)} style={{padding:"10px 26px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#0f2557,#1e40af)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 14px rgba(15,37,87,0.3)"}}>
        {initial?"Update Task":"Add Task"}
      </button>
    </div>
  </div>;
}

/* ﻗ½°ﻗ½° NOTIFICATION PANEL ﻗ½°ﻗ½° */
function NotifPanel({notifs,members,tasks,projects,onClose,onOpenTask}){
  const getMember=(id)=>members.find(m=>m.id===id)||{name:"?"};
  const getTask=(id)=>tasks.find(t=>t.id===id);
  return<div className="notif-panel" style={{position:"absolute",top:"100%",right:0,width:340,background:"#fff",borderRadius:10,boxShadow:"0 8px 32px rgba(10,20,60,0.18)",border:"1.5px solid #e2e8f0",zIndex:500,overflow:"hidden",marginTop:4}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #f1f5f9",background:"#0f2557"}}>
      <span style={{fontSize:13,fontWeight:800,color:"#fff"}}>ﹽ½½ Notifications</span>
      <button onClick={onClose} style={{background:"none",border:"none",color:"#7ba3d4",fontSize:16,cursor:"pointer"}}>ﻗ¼</button>
    </div>
    <div style={{maxHeight:380,overflowY:"auto"}}>
      {notifs.length===0&&<div style={{padding:"28px 0",textAlign:"center",color:"#94a3b8",fontSize:13}}>All caught up! No new notifications.</div>}
      {notifs.slice(0,20).map(n=>{
        const author=getMember(n.authorId);
        const task=getTask(n.taskId);
        const proj=task?projects.find(p=>p.id===task?.projectId):null;
        return<div key={n.id} onClick={()=>{onOpenTask(n.taskId,n.type==="message"?"messages":"updates");onClose();}}
          style={{padding:"11px 14px",borderBottom:"1px solid #f8fafc",cursor:"pointer",background:n.urgent?"#fff5f5":"#fff"}}
          onMouseEnter={e=>e.currentTarget.style.background=n.urgent?"#fee2e2":"#f8fafc"}
          onMouseLeave={e=>e.currentTarget.style.background=n.urgent?"#fff5f5":"#fff"}>
          <div style={{display:"flex",gap:9,alignItems:"flex-start"}}>
            <Avatar name={author.name} size={28}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>
                {n.urgent&&"ﹽﻸﺎ "}<span style={{color:"#0f2557"}}>{author.name}</span>
                {n.type==="message"?" sent a message":" posted an update"}
              </div>
              {task&&<div style={{fontSize:11,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.task}</div>}
              {proj&&<div style={{fontSize:10,color:"#94a3b8"}}>{proj.name}</div>}
              <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{fmtDT(n.timestamp)}</div>
            </div>
            {n.urgent&&<span style={{fontSize:16}}>ﹽﻸﺎ</span>}
          </div>
        </div>;
      })}
    </div>
    {notifs.length>0&&<div style={{padding:"10px 16px",borderTop:"1px solid #f1f5f9",textAlign:"center"}}>
      <span style={{fontSize:11,color:"#94a3b8"}}>{notifs.length} notification{notifs.length>1?"s":""}</span>
    </div>}
  </div>;
}


/* ﻗ½°ﻗ½° RESPONSIVE TASK TABLE ﻗ½°ﻗ½° */
function ResponsiveTaskTable({filtered,enriched,messages,notifications,members,projects,getMember,getProject,STATUS_META,PRIORITY_META,fmtDate,DueChip,Badge,Avatar,clearFilters,activeFiltersCount,onOpenTask}){
  const [isMobile,setIsMobile]=useState(window.innerWidth<768);
  useEffect(()=>{
    const h=()=>setIsMobile(window.innerWidth<768);
    window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);
  },[]);

  // ﻗ½°ﻗ½° MOBILE CARD VIEW ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°
  if(isMobile){
    if(filtered.length===0)return<div style={{padding:"40px 0",textAlign:"center",color:"#94a3b8"}}>
      <div style={{fontSize:32,marginBottom:8}}>ﹽ±┴</div>
      <div style={{fontSize:13,fontWeight:600}}>No tasks found</div>
      {activeFiltersCount>0&&<button onClick={clearFilters} style={{marginTop:10,padding:"6px 14px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,cursor:"pointer"}}>Clear Filters</button>}
    </div>;

    return<div style={{display:"flex",flexDirection:"column",gap:8}}>
      {filtered.map(t=>{
        const sm=STATUS_META[t.status]||STATUS_META["Not Started"];
        const pm=PRIORITY_META[t.priority]||PRIORITY_META["Medium"];
        const assignee=getMember(t.assigneeId);
        const assignor=getMember(t.assignorId);
        const proj=getProject(t.projectId);
        const msgCount=messages.filter(m=>m.taskId===t.id).length;
        const urgentMsg=messages.filter(m=>m.taskId===t.id&&m.urgent).length;
        const fileCount=t.attachments?.length||0;
        const hasNotif=notifications.some(n=>n.taskId===t.id);
        const hasLinks=t.linkedTo?.length>0||enriched.some(x=>x.linkedTo?.includes(t.id));
        return<div key={t.id} onClick={()=>onOpenTask(t)}
          style={{background:"#fff",borderRadius:10,padding:"12px 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",border:`1.5px solid ${hasNotif?"#fbbf24":"#e2e8f0"}`,cursor:"pointer",borderLeft:`4px solid ${sm.dot}`}}>
          {/* Row 1: Ref + Status + Priority */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
            <span style={{fontSize:11,fontWeight:800,color:"#c9a227"}}>{t.ref}</span>
            <Badge text={t.status} color={sm.color} bg={sm.bg} small/>
            <span style={{fontSize:10,fontWeight:700,color:pm.color,marginLeft:"auto"}}>{pm.label}</span>
            {urgentMsg>0&&<span style={{fontSize:11}}>ﹽﻸﺎ</span>}
          </div>
          {/* Row 2: Task name ﻗ°½ FULL TEXT WRAPPED */}
          <div style={{fontSize:13,fontWeight:700,color:"#0f2557",lineHeight:1.4,marginBottom:6,wordBreak:"break-word"}}>
            {hasLinks&&<span style={{fontSize:11,marginRight:4}}>ﹽ½«</span>}{t.task}
          </div>
          {/* Row 3: Project */}
          {proj&&<div style={{fontSize:11,color:"#64748b",marginBottom:6}}>ﹽ±· {proj.name}</div>}
          {/* Row 4: Assignor ﻗ│φ Assignee */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            {assignor&&<div style={{display:"flex",alignItems:"center",gap:4}}>
              <Avatar name={assignor.name} size={18} color="#94a3b8"/>
              <span style={{fontSize:10,color:"#94a3b8"}}>{assignor.name}</span>
              <span style={{fontSize:10,color:"#cbd5e1"}}>ﻗ│φ</span>
            </div>}
            {assignee&&<div style={{display:"flex",alignItems:"center",gap:4}}>
              <Avatar name={assignee.name} size={20} color="#0f2557"/>
              <span style={{fontSize:11,fontWeight:600,color:"#1e293b"}}>{assignee.name}</span>
            </div>}
          </div>
          {/* Row 5: Due + Completed */}
          <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:6,flexWrap:"wrap"}}>
            <div style={{display:"flex",flexDirection:"column"}}>
              <span style={{fontSize:9,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Due</span>
              <DueChip date={t.dueDate} time={t.dueTime}/>
            </div>
            {t.completedDate&&<div style={{display:"flex",flexDirection:"column"}}>
              <span style={{fontSize:9,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Completed</span>
              <span style={{fontSize:10,color:"#166534",fontWeight:600}}>ﻗ─ {fmtDate(t.completedDate)}</span>
            </div>}
          </div>
          {/* Row 6: Chat + Files badges */}
          {(msgCount>0||fileCount>0)&&<div style={{display:"flex",gap:8}}>
            {msgCount>0&&<span style={{fontSize:11,color:urgentMsg?"#dc2626":"#3b82f6",fontWeight:700}}>ﹽφ، {msgCount}</span>}
            {fileCount>0&&<span style={{fontSize:11,color:"#0ea5e9",fontWeight:700}}>ﹽ±└ {fileCount}</span>}
          </div>}
        </div>;
      })}
    </div>;
  }

  // ﻗ½°ﻗ½° DESKTOP TABLE VIEW (with resizable columns) ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°ﻗ½°
  const COL_NAMES=["Ref","Project","Task / Doc","Assignee","Due Date","Completed","Status","Priority","ﹽφ،","ﹽ±└"];
  const COL_MIN=[60,70,150,70,90,90,75,50,30,30];
  const COL_DEF=[100,130,240,110,110,120,88,58,36,36];
  const [widths,setWidths]=useState(()=>{try{const s=localStorage.getItem("tkj_col_widths");return s?JSON.parse(s):COL_DEF;}catch{return COL_DEF;}});
  const resizing=useRef(null);
  const saveWidths=(w)=>{try{localStorage.setItem("tkj_col_widths",JSON.stringify(w));}catch{}};
  const startResize=(e,idx)=>{
    e.preventDefault();e.stopPropagation();
    const startX=e.touches?e.touches[0].clientX:e.clientX;
    resizing.current={idx,startX,startW:widths[idx]};
    const onMove=(ev)=>{
      if(!resizing.current)return;
      const x=ev.touches?ev.touches[0].clientX:ev.clientX;
      setWidths(prev=>{const n=[...prev];n[resizing.current.idx]=Math.max(COL_MIN[resizing.current.idx],resizing.current.startW+(x-resizing.current.startX));return n;});
    };
    const onEnd=()=>{
      if(resizing.current){setWidths(prev=>{saveWidths(prev);return prev;});}
      resizing.current=null;
      window.removeEventListener("mousemove",onMove);window.removeEventListener("touchmove",onMove);
      window.removeEventListener("mouseup",onEnd);window.removeEventListener("touchend",onEnd);
    };
    window.addEventListener("mousemove",onMove);window.addEventListener("touchmove",onMove,{passive:false});
    window.addEventListener("mouseup",onEnd);window.addEventListener("touchend",onEnd);
  };
  const resetWidths=()=>{setWidths(COL_DEF);saveWidths(COL_DEF);};
  const totalW=widths.reduce((a,b)=>a+b,0)+widths.length*8+28;
  const gridTemplate=widths.map(w=>`${w}px`).join(" ");

  return<div style={{background:"#fff",borderRadius:10,boxShadow:"0 2px 12px rgba(0,0,0,0.06)",overflow:"hidden"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",padding:"4px 14px",background:"#f8fafc",borderBottom:"1px solid #f1f5f9"}}>
      <span style={{fontSize:9,color:"#94a3b8",marginRight:6}}>Drag column edges to resize</span>
      <button onClick={resetWidths} style={{fontSize:9,color:"#3b82f6",background:"none",border:"1px solid #bfdbfe",cursor:"pointer",padding:"2px 7px",borderRadius:3}}>Reset</button>
    </div>
    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
      <div style={{minWidth:totalW}}>
        <div style={{display:"grid",gridTemplateColumns:gridTemplate,columnGap:8,background:"#0f2557",padding:"8px 14px",userSelect:"none"}}>
          {COL_NAMES.map((h,i)=><div key={h} style={{position:"relative",display:"flex",alignItems:"center",overflow:"hidden"}}>
            <span style={{fontSize:9,fontWeight:800,color:"#7ba3d4",letterSpacing:"0.06em",textTransform:"uppercase",overflow:"hidden",whiteSpace:"nowrap",flex:1}}>{h}</span>
            {i<COL_NAMES.length-1&&<div onMouseDown={e=>startResize(e,i)} onTouchStart={e=>startResize(e,i)}
              style={{position:"absolute",right:-4,top:0,bottom:0,width:9,cursor:"col-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:2,height:"50%",background:"rgba(255,255,255,0.25)",borderRadius:1}}/>
            </div>}
          </div>)}
        </div>
        {filtered.length===0&&<div style={{padding:"48px 0",textAlign:"center",color:"#94a3b8"}}>
          <div style={{fontSize:32,marginBottom:8}}>ﹽ±┴</div><div style={{fontSize:13,fontWeight:600}}>No tasks found</div>
        </div>}
        {filtered.map((t,i)=>{
          const sm=STATUS_META[t.status]||STATUS_META["Not Started"];const pm=PRIORITY_META[t.priority]||PRIORITY_META["Medium"];
          const assignee=getMember(t.assigneeId);const proj=getProject(t.projectId);
          const hasLinks=t.linkedTo?.length>0||enriched.some(x=>x.linkedTo?.includes(t.id));
          const msgCount=messages.filter(m=>m.taskId===t.id).length;const urgentMsg=messages.filter(m=>m.taskId===t.id&&m.urgent).length;
          const fileCount=t.attachments?.length||0;const myNotifs=notifications.filter(n=>n.taskId===t.id).length;
          return<div key={t.id} onClick={()=>onOpenTask(t)}
            style={{display:"grid",gridTemplateColumns:gridTemplate,columnGap:8,padding:"10px 14px",background:i%2===0?"#fff":"#f8fafc",borderBottom:"1px solid #f1f5f9",cursor:"pointer",alignItems:"start",borderLeft:myNotifs?"3px solid #f59e0b":"3px solid transparent"}}
            onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"}
            onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#f8fafc"}>
            <div style={{overflow:"hidden"}}><div style={{fontSize:10,fontWeight:700,color:"#c9a227",wordBreak:"break-all"}}>{t.ref}</div></div>
            <div style={{overflow:"hidden"}}><div style={{fontSize:10,color:"#475569",wordBreak:"break-word",lineHeight:1.3}}>{t.isPersonal?"ﹽ∞¤ Personal":proj?.name||"ﻗ°½"}</div></div>
            <div style={{overflow:"hidden"}}>
              <div style={{display:"flex",gap:3,alignItems:"flex-start"}}>
                {hasLinks&&<span style={{fontSize:9,flexShrink:0,marginTop:1}}>ﹽ½«</span>}
                <div><div style={{fontSize:11,color:"#1e293b",fontWeight:600,wordBreak:"break-word",lineHeight:1.3}}>{t.task}</div>
                  {getMember(t.assignorId)&&<div style={{fontSize:9,color:"#94a3b8",marginTop:1}}>by {getMember(t.assignorId)?.name}</div>}
                </div>
              </div>
            </div>
            <div style={{overflow:"hidden"}}>
              {assignee&&<div style={{display:"flex",alignItems:"center",gap:3}}><Avatar name={assignee.name} size={16}/><span style={{fontSize:10,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{assignee.name}</span></div>}
            </div>
            <div style={{overflow:"hidden"}}><DueChip date={t.dueDate} time={t.dueTime}/></div>
            <div style={{overflow:"hidden"}}>{t.completedDate?<span style={{fontSize:10,color:"#166534",fontWeight:600,wordBreak:"break-word"}}>ﻗ─ {fmtDate(t.completedDate)}</span>:<span style={{color:"#d1d5db",fontSize:10}}>ﻗ°½</span>}</div>
            <div style={{overflow:"hidden"}}><Badge text={t.status} color={sm.color} bg={sm.bg} small/></div>
            <div><span style={{fontSize:10,fontWeight:700,color:pm.color}}>{pm.label}</span></div>
            <div style={{textAlign:"center"}}>{msgCount>0?<span style={{fontSize:11,fontWeight:700,color:urgentMsg?"#dc2626":"#3b82f6"}}>{urgentMsg?"ﹽﻸﺎ":""}{msgCount}</span>:<span style={{color:"#e2e8f0",fontSize:10}}>ﻗ°½</span>}</div>
            <div style={{textAlign:"center"}}>{fileCount>0?<span style={{fontSize:11,color:"#0ea5e9",fontWeight:700}}>ﹽ±└{fileCount}</span>:<span style={{color:"#e2e8f0",fontSize:10}}>ﻗ°½</span>}</div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

/* ﻗ½°ﻗ½° MAIN APP ﻗ½°ﻗ½° */

/* ﻗ½°ﻗ½° CONFIG SCREEN ﻗ½°ﻗ½° */
function ConfigScreen({onConnected}) {
  const [url,setUrl]=useState(LS.get("sb_url")||"");
  const [key,setKey]=useState(LS.get("sb_key")||"");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const connect=async()=>{
    if(!url.trim()||!key.trim()){setErr("Please enter both values.");return;}
    setLoading(true);setErr("");
    try{
      const {createClient}=await import('@supabase/supabase-js');const testDb=createClient(url.trim(),key.trim());
      const {error}=await testDb.from("members").select("id").limit(1);
      if(error)throw new Error(error.message);
      LS.set("sb_url",url.trim());LS.set("sb_key",key.trim());
      onConnected();
    }catch(e){setErr("Connection failed: "+e.message);}
    setLoading(false);
  };
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"11px 14px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#f8fafc",boxSizing:"border-box",color:"#1e293b"};
  return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:"#fff",borderRadius:16,padding:36,width:"min(480px,95vw)",boxShadow:"0 32px 100px rgba(0,0,0,0.4)"}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <img src={TKJ_LOGO} alt="TKJ" style={{height:70,objectFit:"contain",marginBottom:14}}/>
        <h2 style={{margin:0,fontSize:20,color:"#0f2557",fontWeight:800}}>ﻗ»·ﻡ٨┘ Cloud Database Setup</h2>
        <p style={{margin:"6px 0 0",fontSize:13,color:"#64748b"}}>Connect Supabase for real-time team sync</p>
      </div>
      <div style={{background:"#f0f9ff",borderRadius:8,padding:"12px 14px",marginBottom:20,border:"1px solid #bae6fd"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#0369a1",marginBottom:4}}>ﹽ±┴ Where to find these:</div>
        <div style={{fontSize:11,color:"#0369a1",lineHeight:1.8}}>
          1. Go to <strong>supabase.com</strong> ﻗ│φ your project<br/>
          2. Click <strong>Project Settings</strong> (bottom-left gear icon)<br/>
          3. Click <strong>API</strong> tab<br/>
          4. Copy <strong>Project URL</strong> and <strong>anon public</strong> key
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",display:"block",marginBottom:5}}>Supabase Project URL</label>
          <input style={inp} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://xxxxxxxxxxxx.supabase.co"/>
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",display:"block",marginBottom:5}}>Anon / Public Key</label>
          <input style={{...inp,fontFamily:"monospace",fontSize:11}} value={key} onChange={e=>setKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."/>
        </div>
        {err&&<div style={{padding:"10px 14px",background:"#fee2e2",borderRadius:7,color:"#991b1b",fontSize:12,fontWeight:600}}>ﻗﻸ ﻡ٨┘ {err}</div>}
        <button onClick={connect} disabled={loading} style={{padding:"12px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#0f2557,#1e40af)",color:"#fff",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",opacity:loading?0.7:1}}>
          {loading?"ﻗ┘٣ Connectingﻗ°":"ﹽ½┐ Connect to Database"}
        </button>
      </div>
      <p style={{textAlign:"center",fontSize:10,color:"#cbd5e1",marginTop:20}}>TKJ Project Management Sdn Bhd (1676211-U)</p>
    </div>
  </div>;
}

/* ﻗ½°ﻗ½° PASSWORD MODAL ﻗ½°ﻗ½° */
function PasswordModal({member,onSuccess,onBack}) {
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [show,setShow]=useState(false);
  const submit=async()=>{
    if(!pw.trim()){setErr("Please enter your password.");return;}
    setLoading(true);setErr("");
    const hash=await hashPassword(pw);
    if(hash===member.passwordHash){onSuccess();}
    else{setErr("Incorrect password. Please try again.");setPw("");}
    setLoading(false);
  };
  return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:"#fff",borderRadius:16,padding:36,width:"min(380px,95vw)",boxShadow:"0 32px 100px rgba(0,0,0,0.4)"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <img src={TKJ_LOGO} alt="TKJ" style={{height:56,objectFit:"contain",marginBottom:12}}/>
        <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#c9a227,#f0c040)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:20,color:"#0a1a42",marginBottom:8}}>
          {member.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
        </div>
        <h3 style={{margin:"8px 0 4px",fontSize:18,color:"#0f2557",fontWeight:800}}>Welcome, {member.name}</h3>
        <p style={{margin:0,fontSize:12,color:"#64748b"}}>Enter your password to continue</p>
      </div>
      <div style={{position:"relative",marginBottom:12}}>
        <input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Password" autoFocus
          style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"11px 44px 11px 14px",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f8fafc",boxSizing:"border-box"}}/>
        <button onClick={()=>setShow(v=>!v)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16}}>
          {show?"ﹽﻷ┤":"ﹽ∞·ﻡ٨┘"}
        </button>
      </div>
      {err&&<div style={{padding:"8px 12px",background:"#fee2e2",borderRadius:6,color:"#991b1b",fontSize:12,fontWeight:600,marginBottom:12}}>ﻗﻸ ﻡ٨┘ {err}</div>}
      <button onClick={submit} disabled={loading} style={{width:"100%",padding:"11px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#0f2557,#1e40af)",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:10}}>
        {loading?"ﻗ┘٣ Verifyingﻗ°":"ﹽ½± Login"}
      </button>
      <button onClick={onBack} style={{width:"100%",padding:"8px",borderRadius:7,border:"1px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:12,cursor:"pointer"}}>
        ﻗ│β Back to member list
      </button>
      <p style={{textAlign:"center",fontSize:10,color:"#94a3b8",marginTop:14}}>Forgotten password? Contact your Admin to reset.</p>
    </div>
  </div>;
}

/* ﻗ½°ﻗ½° SET PASSWORD MODAL (Admin only) ﻗ½°ﻗ½° */
function SetPasswordModal({member,onSave,onClose}) {
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [show,setShow]=useState(false);
  const save=async()=>{
    if(pw.length<6){setErr("Minimum 6 characters.");return;}
    if(pw!==pw2){setErr("Passwords do not match.");return;}
    setLoading(true);
    const hash=await hashPassword(pw);
    await onSave(member.id,hash);
    setLoading(false);onClose();
  };
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#f8fafc",boxSizing:"border-box"};
  return <div style={{position:"fixed",inset:0,background:"rgba(10,20,50,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:12,padding:28,width:"min(380px,95vw)",boxShadow:"0 24px 80px rgba(0,0,0,0.3)"}}>
      <h3 style={{margin:"0 0 6px",fontSize:16,color:"#0f2557",fontWeight:800}}>ﹽ½∞ Set Password ﻗ°½ {member.name}</h3>
      <p style={{fontSize:12,color:"#64748b",marginBottom:18}}>Only Admins can set or reset passwords. Member cannot change their own password.</p>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{position:"relative"}}>
          <label style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",display:"block",marginBottom:4}}>New Password (min 6 chars)</label>
          <input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} style={{...inp,paddingRight:40}}/>
          <button onClick={()=>setShow(v=>!v)} style={{position:"absolute",right:10,bottom:8,background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:14}}>{show?"ﹽﻷ┤":"ﹽ∞·ﻡ٨┘"}</button>
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",display:"block",marginBottom:4}}>Confirm Password</label>
          <input type={show?"text":"password"} value={pw2} onChange={e=>setPw2(e.target.value)} style={inp}/>
        </div>
        {err&&<div style={{padding:"8px 12px",background:"#fee2e2",borderRadius:6,color:"#991b1b",fontSize:12}}>ﻗﻸ ﻡ٨┘ {err}</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"9px",borderRadius:7,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:13,cursor:"pointer"}}>Cancel</button>
          <button onClick={save} disabled={loading} style={{flex:2,padding:"9px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#0f2557,#1e40af)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {loading?"Savingﻗ°":"ﻗ─ Save Password"}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

/* ﻗ½°ﻗ½° MAIN CLOUD APP ﻗ½°ﻗ½° */
function App() {
  const [dbReady,setDbReady]=useState(false);
  const [currentUserId,setCurrentUserId]=useState(()=>LS.get("tkj_session_user"));
  const [passwordTarget,setPasswordTarget]=useState(null);
  const [tasks,setTasks]=useState([]);
  const [members,setMembers]=useState([]);
  const [projects,setProjects]=useState([]);
  const [updates,setUpdates]=useState([]);
  const [messages,setMessages]=useState([]);
  const [deleteRequests,setDeleteRequests]=useState([]);
  const [moods,setMoods]=useState({});
  const [loaded,setLoaded]=useState(false);
  const [view,setView]=useState("list");
  const [modal,setModal]=useState(null);
  const [selected,setSelected]=useState(null);
  const [selectedTab,setSelectedTab]=useState("info");
  const [showPersonal,setShowPersonal]=useState(false);
  const [showNotifs,setShowNotifs]=useState(false);
  const [pwModal,setPwModal]=useState(null);
  const [notifSeen,setNotifSeen]=useState(()=>LS.get("tkj_notif_seen")||{});
  const [filters,setFilters]=useState({project:"",status:"",priority:"",assignee:"",search:"",dueDateFrom:"",dueDateTo:"",preparedFrom:"",preparedTo:"",completedFrom:"",completedTo:"",showDueToday:false,showDueWeek:false});
  const [sortKey,setSortKey]=useState(()=>LS.get("tkj_sort_key")||"dueDate");
  const [sortDir,setSortDir]=useState(()=>LS.get("tkj_sort_dir")||"asc");
  const bellRef=useRef();
  const headerW=useWindowWidth();
  const narrow=headerW<640;
  const updF=(k,v)=>setFilters(p=>({...p,[k]:v}));
  const setSort=(k,d)=>{setSortKey(k);setSortDir(d);LS.set("tkj_sort_key",k);LS.set("tkj_sort_dir",d);};

  /* Init DB */
  useEffect(()=>{
    const url=LS.get("sb_url");const key=LS.get("sb_key");
    if(url&&key){initDB(url,key);setDbReady(true);}
  },[]);

  /* Load all data */
  const loadAll=useCallback(async()=>{
    const db=db;if(!db)return;
    const [mr,pr,tr,ur,msgr,drr]=await Promise.all([
      db.from("members").select("*"),
      db.from("projects").select("*"),
      db.from("tasks").select("*"),
      db.from("task_updates").select("*").order("timestamp",{ascending:true}),
      db.from("task_messages").select("*").order("timestamp",{ascending:true}),
      db.from("delete_requests").select("*"),
    ]);
    if(mr.data)setMembers(mr.data.map(fromMember));
    if(pr.data)setProjects(pr.data.map(fromProject));
    if(tr.data)setTasks(tr.data.map(fromTask));
    if(ur.data)setUpdates(ur.data.map(fromUpdate));
    if(msgr.data)setMessages(msgr.data.map(fromMessage));
    if(drr.data)setDeleteRequests(drr.data.map(fromDR));
    setLoaded(true);
  },[]);

  const loadMoods=useCallback(async()=>{
    const db=db;if(!db)return;
    const todayStr=new Date().toISOString().split("T")[0];
    const {data}=await db.from("moods").select("*").eq("mood_date",todayStr);
    if(data){
      const map={};
      data.forEach(r=>{map[`${todayStr}_${r.member_id}`]=r.mood_id;});
      setMoods(map);
    }
  },[]);

  useEffect(()=>{if(dbReady){loadAll();loadMoods();}},[dbReady]);

  /* Realtime subscriptions */
  useEffect(()=>{
    if(!dbReady)return;
    const db=db;
    const ch=db.channel("tkj-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"task_updates"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"task_messages"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"delete_requests"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"members"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"projects"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"moods"},()=>loadMoods())
      .subscribe();
    return()=>db.removeChannel(ch);
  },[dbReady,loadAll,loadMoods]);

  const currentUser=members.find(m=>m.id===currentUserId);
  const isAdmin=currentUser?.role==="admin";
  const myMoodObj=currentUser?MOODS.find(m=>m.id===moods[`${today()}_${currentUser.id}`]):null;

  const login=(member)=>{
    setCurrentUserId(member.id);
    LS.set("tkj_session_user",member.id);
    if(!member.passwordHash){
      // No password set yet ﻗ°½ let admin in directly, show warning
      if(member.role==="admin"){setPasswordTarget("mood");}
      else{alert("Your account has no password set. Please ask your Admin to set one.");setCurrentUserId(null);}
      return;
    }
    setPasswordTarget(member);
  };
  const logout=()=>{setCurrentUserId(null);setPasswordTarget(null);LS.set("tkj_session_user",null);};

  /* Data mutations */
  const saveTask=async(t)=>{
    const db=db;const row=toTask(t);
    if(tasks.find(x=>x.id===t.id)){await db.from("tasks").update(row).eq("id",t.id);}
    else{
      await db.from("tasks").insert(row);
      const assigneeName=members.find(m=>m.id===t.assigneeId)?.name||"ﻗ°½";
      await db.from("task_updates").insert(toUpdate({id:uid(),taskId:t.id,authorId:currentUserId||"",
        text:`Task created by ${currentUser?.name||"ﻗ°½"}. Assigned to ${assigneeName}. Priority: ${t.priority}. Due: ${fmtDate(t.dueDate)}.`,
        attachments:[],timestamp:nowISO(),type:"system"}));
    }
    setModal(null);setSelected(null);
  };
  const deleteTask=async(id)=>{
    if(!isAdmin){alert("Only Admin can delete.");return;}
    if(!confirm("Permanently delete this task?"))return;
    await testDb.from("task_updates").insert(toUpdate({id:uid(),taskId:id,authorId:currentUserId,
      text:`Task deleted by Admin (${currentUser?.name}) on ${fmtDT(nowISO())}.`,
      attachments:[],timestamp:nowISO(),type:"system"}));
    await testDb.from("tasks").update({deleted:true,deleted_at:nowISO(),deleted_by:currentUserId}).eq("id",id);
    setModal(null);setSelected(null);
  };
  const addUpdate=async(u)=>{await testDb.from("task_updates").insert(toUpdate(u));};
  const sendMessage=async(m)=>{await testDb.from("task_messages").insert(toMessage(m));};
  const updateAttachments=async(taskId,attachments)=>{
    await testDb.from("tasks").update({attachments}).eq("id",taskId);
    setTasks(p=>p.map(t=>t.id===taskId?{...t,attachments}:t));
    setSelected(prev=>prev?.id===taskId?{...prev,attachments}:prev);
  };
  const submitDeleteRequest=async(taskId,reason)=>{
    const existing=deleteRequests.find(r=>r.taskId===taskId&&r.status==="pending");
    if(existing){alert("A delete request is already pending.");return;}
    const req={id:uid(),taskId,requestedBy:currentUserId,reason,timestamp:nowISO(),status:"pending",reviewedBy:null,reviewedAt:null,reviewNote:""};
    await testDb.from("delete_requests").insert(toDR(req));
    await addUpdate({id:uid(),taskId,authorId:currentUserId,
      text:`Delete request by ${currentUser?.name}. Reason: "${reason}". Awaiting Admin approval.`,
      attachments:[],timestamp:nowISO(),type:"system"});
  };
  const reviewDeleteRequest=async(reqId,approved,reviewNote)=>{
    const req=deleteRequests.find(r=>r.id===reqId);if(!req)return;
    const requester=members.find(m=>m.id===req.requestedBy);
    await testDb.from("delete_requests").update({status:approved?"approved":"rejected",reviewed_by:currentUserId,reviewed_at:nowISO(),review_note:reviewNote}).eq("id",reqId);
    if(approved){
      await testDb.from("tasks").update({deleted:true,deleted_at:nowISO(),deleted_by:req.requestedBy,deleted_approved_by:currentUserId}).eq("id",req.taskId);
      await addUpdate({id:uid(),taskId:req.taskId,authorId:currentUserId,
        text:`ﻗ─ DELETE APPROVED by Admin (${currentUser?.name}). Requested by ${requester?.name||"ﻗ°½"}. Reason: "${req.reason}". Note: "${reviewNote||"None"}".`,
        attachments:[],timestamp:nowISO(),type:"system"});
    }else{
      await addUpdate({id:uid(),taskId:req.taskId,authorId:currentUserId,
        text:`ﻗﻻ┐ DELETE REJECTED by Admin (${currentUser?.name}). Note: "${reviewNote||"None"}".`,
        attachments:[],timestamp:nowISO(),type:"system"});
    }
    if(approved){setModal(null);setSelected(null);}
  };
  const updateMember=async(m)=>{
    const db=db;const row=toMember(m);
    if(members.find(x=>x.id===m.id)){await db.from("members").update(row).eq("id",m.id);}
    else{await db.from("members").insert({...row,id:m.id});}
  };
  const updateProject=async(p)=>{
    const db=db;
    if(projects.find(x=>x.id===p.id)){await db.from("projects").update(toProject(p)).eq("id",p.id);}
    else{await db.from("projects").insert({...toProject(p),id:p.id});}
  };
  const setMemberPassword=async(memberId,hash)=>{
    await testDb.from("members").update({password_hash:hash}).eq("id",memberId);
  };
  const saveMood=async(memberId,moodId)=>{
    const todayStr=new Date().toISOString().split("T")[0];
    await testDb.from("moods").upsert({member_id:memberId,mood_date:todayStr,mood_id:moodId},{onConflict:"member_id,mood_date"});
    setMoods(p=>({...p,[`${todayStr}_${memberId}`]:moodId}));
  };
  const markNotifsRead=()=>{
    const seen={...notifSeen,[currentUserId]:nowISO()};
    setNotifSeen(seen);LS.set("tkj_notif_seen",seen);
  };

  /* Derived state */
  const enriched=useMemo(()=>tasks.map(t=>{
    if(t.status!=="Completed"&&t.status!=="On Hold"&&t.dueDate&&daysDiff(t.dueDate)<0)return{...t,status:"Overdue"};
    return t;
  }),[tasks]);

  const visibleTasks=useMemo(()=>{
    if(showPersonal)return enriched.filter(t=>t.isPersonal&&t.personalOwnerId===currentUserId&&!t.deleted);
    return enriched.filter(t=>!t.isPersonal&&!t.deleted&&(t.status!=="Draft"||(t.createdBy===currentUserId||t.assignorId===currentUserId)));
  },[enriched,showPersonal,currentUserId]);

  const filtered=useMemo(()=>{
    let res=visibleTasks;
    if(filters.search)res=res.filter(t=>[t.task,t.ref,t.remarks].join(" ").toLowerCase().includes(filters.search.toLowerCase()));
    if(filters.project)res=res.filter(t=>t.projectId===filters.project);
    if(filters.status)res=res.filter(t=>t.status===filters.status);
    if(filters.priority)res=res.filter(t=>t.priority===filters.priority);
    if(filters.assignee)res=res.filter(t=>t.assigneeId===filters.assignee);
    if(filters.dueDateFrom)res=res.filter(t=>t.dueDate>=filters.dueDateFrom);
    if(filters.dueDateTo)res=res.filter(t=>t.dueDate<=filters.dueDateTo);
    if(filters.preparedFrom)res=res.filter(t=>t.preparedDate>=filters.preparedFrom);
    if(filters.preparedTo)res=res.filter(t=>t.preparedDate<=filters.preparedTo);
    if(filters.completedFrom)res=res.filter(t=>t.completedDate>=filters.completedFrom);
    if(filters.completedTo)res=res.filter(t=>t.completedDate<=filters.completedTo);
    if(filters.showDueToday)res=res.filter(t=>t.dueDate&&daysDiff(t.dueDate)===0);
    if(filters.showDueWeek)res=res.filter(t=>{const d=daysDiff(t.dueDate);return d!==null&&d>=0&&d<=7;});
    const sv=(t,k)=>{
      if(k==="dueDate")return(t.dueDate||"9999")+(t.dueTime||"18:00");
      if(k==="createdAt")return t.createdAt||"";
      if(k==="priority"){const p={"Critical":0,"High":1,"Medium":2,"Low":3};return p[t.priority]??9;}
      if(k==="project")return t.projectId||"";if(k==="status")return t.status||"";
      if(k==="ref")return t.ref||"";return t.dueDate||"9999";
    };
    return res.sort((a,b)=>{const va=sv(a,sortKey),vb=sv(b,sortKey);const cmp=typeof va==="number"?va-vb:String(va).localeCompare(String(vb));return sortDir==="asc"?cmp:-cmp;});
  },[visibleTasks,filters,sortKey,sortDir]);

  const notifications=useMemo(()=>{
    if(!currentUserId)return[];
    const seenTs=notifSeen[currentUserId]||"1970-01-01T00:00:00.000Z";
    const myTaskIds=new Set(tasks.filter(t=>t.assigneeId===currentUserId||t.assignorId===currentUserId||(t.cc||[]).includes(currentUserId)).map(t=>t.id));
    const nm=messages.filter(m=>m.taskId&&myTaskIds.has(m.taskId)&&m.authorId!==currentUserId&&m.timestamp>seenTs).map(m=>({...m,type:"message"}));
    const nu=updates.filter(u=>u.taskId&&myTaskIds.has(u.taskId)&&u.authorId!==currentUserId&&u.type!=="system"&&u.timestamp>seenTs).map(u=>({...u,type:"update"}));
    return[...nm,...nu].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  },[messages,updates,tasks,currentUserId,notifSeen]);

  const urgentNotifs=notifications.filter(n=>n.urgent).length;
  const pendingDeleteNotifs=isAdmin?deleteRequests.filter(r=>r.status==="pending").length:0;
  const getMember=id=>members.find(m=>m.id===id);
  const getProject=id=>projects.find(p=>p.id===id);
  const activeFiltersCount=Object.entries(filters).filter(([k,v])=>k!=="search"&&v&&v!==false).length;
  const clearFilters=()=>setFilters({project:"",status:"",priority:"",assignee:"",search:"",dueDateFrom:"",dueDateTo:"",preparedFrom:"",preparedTo:"",completedFrom:"",completedTo:"",showDueToday:false,showDueWeek:false});
  const openTask=(taskId,tab="info")=>{const t=enriched.find(x=>x.id===taskId);if(t){setSelected(t);setSelectedTab(tab);setModal("detail");}};
  const selStyle={border:"1.5px solid #e2e8f0",borderRadius:6,padding:"7px 10px",fontSize:12,color:"#1e293b",background:"#fff",outline:"none",cursor:"pointer"};
  const dateStyle={border:"1.5px solid #e2e8f0",borderRadius:6,padding:"7px 10px",fontSize:12,color:"#1e293b",background:"#fff",outline:"none"};

  /* ﻗ½°ﻗ½° SCREENS ﻗ½°ﻗ½° */
  if(!dbReady)return <ConfigScreen onConnected={()=>setDbReady(true)}/>;

  if(!loaded)return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
    <img src={TKJ_LOGO} alt="TKJ" style={{height:60,objectFit:"contain"}}/>
    <div style={{color:"#7ba3d4",fontSize:14}}>Loading TKJ Task Monitoringﻗ°</div>
    <div style={{width:180,height:4,background:"rgba(255,255,255,0.1)",borderRadius:2,overflow:"hidden"}}>
      <div style={{width:"60%",height:"100%",background:"#c9a227",borderRadius:2,animation:"pulse 1.5s infinite"}}/>
    </div>
  </div>;

  /* Mood picker */
  if(passwordTarget==="mood"){
    const user=currentUser;
    return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:16,padding:36,width:"min(480px,95vw)",boxShadow:"0 32px 100px rgba(0,0,0,0.4)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <img src={TKJ_LOGO} alt="TKJ" style={{height:60,objectFit:"contain",marginBottom:10}}/>
          <h2 style={{fontSize:18,color:"#0f2557",fontWeight:800,margin:"0 0 4px"}}>Good day, {user?.name}! ﹽ∞┴</h2>
          <p style={{fontSize:13,color:"#64748b",margin:0}}>How are you feeling today?</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          {MOODS.map(m=><button key={m.id} onClick={async()=>{await saveMood(user.id,m.id);setPasswordTarget(null);}} className="mood-btn"
            style={{padding:"14px 8px",borderRadius:10,border:`2px solid ${moods[`${today()}_${user.id}`]===m.id?m.color:"#e2e8f0"}`,background:moods[`${today()}_${user.id}`]===m.id?m.color+"15":"#f8fafc",cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
            <span style={{fontSize:26}}>{m.emoji}</span>
            <span style={{fontSize:10,fontWeight:700,color:"#475569"}}>{m.label}</span>
          </button>)}
        </div>
        <button onClick={()=>setPasswordTarget(null)} style={{width:"100%",padding:"9px",borderRadius:7,border:"1.5px solid #e2e8f0",background:"#fff",color:"#94a3b8",fontSize:12,cursor:"pointer"}}>Skip</button>
      </div>
    </div>;
  }

  /* Password screen */
  if(passwordTarget&&passwordTarget!=="mood"){
    return <PasswordModal member={passwordTarget} onSuccess={()=>setPasswordTarget("mood")} onBack={()=>{setPasswordTarget(null);setCurrentUserId(null);LS.set("tkj_session_user",null);}}/>;
  }

  /* Login screen */
  if(!currentUser){
    return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:16,padding:40,width:"min(420px,95vw)",boxShadow:"0 32px 100px rgba(0,0,0,0.4)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src={TKJ_LOGO} alt="TKJ" style={{height:80,objectFit:"contain",marginBottom:16}}/>
          <h2 style={{margin:0,fontSize:18,color:"#0f2557",fontWeight:800}}>Task Monitoring</h2>
          <div style={{fontSize:12,color:"#0f2557",fontWeight:700,marginTop:4}}>TKJ Project Management Sdn Bhd <span style={{fontSize:10,color:"#94a3b8"}}>(1676211-U)</span></div>
          <p style={{margin:"4px 0 0",fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Managing Complexity. Delivering Results.</p>
          <p style={{margin:"12px 0 0",fontSize:13,color:"#64748b"}}>Select your name to continue</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {members.filter(m=>m.active).map(m=>{
            const todayMood=moods[`${today()}_${m.id}`];const moodObj=todayMood?MOODS.find(x=>x.id===todayMood):null;
            return <button key={m.id} onClick={()=>login(m)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",textAlign:"left"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#eff6ff";e.currentTarget.style.borderColor="#0f2557";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#f8fafc";e.currentTarget.style.borderColor="#e2e8f0";}}>
              <Avatar name={m.name} size={38} color={m.role==="admin"?"#c9a227":"#0f2557"}/>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#0f2557"}}>{m.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>{m.role==="admin"?"Admin":"Member"} ﺁ٧ {m.email}</div></div>
              {moodObj&&<span style={{fontSize:22}}>{moodObj.emoji}</span>}
              <span style={{color:"#94a3b8",fontSize:16}}>ﹽ½φ</span>
            </button>;
          })}
        </div>
        <div style={{textAlign:"center",marginTop:16}}>
          <div style={{fontSize:10,color:"#94a3b8"}}>ﻗ»·ﻡ٨┘ Real-time cloud sync active</div>
        </div>
        <button onClick={()=>{LS.set("sb_url",null);LS.set("sb_key",null);window.location.reload();}} style={{width:"100%",marginTop:10,padding:"6px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",color:"#94a3b8",fontSize:10,cursor:"pointer"}}>ﻗﻸﻷﻡ٨┘ Change Database Settings</button>
      </div>
    </div>;
  }

  /* ﻗ½°ﻗ½° MAIN UI ﻗ½°ﻗ½° */
  return <div style={{fontFamily:"'Century Gothic','Trebuchet MS',Tahoma,sans-serif",background:"#f0f4f8",minHeight:"100vh"}}>
    {pwModal&&<SetPasswordModal member={pwModal} onSave={setMemberPassword} onClose={()=>setPwModal(null)}/>}

    {/* HEADER */}
    <div style={{background:"linear-gradient(135deg,#0a1a42 0%,#0f2557 60%,#1a3a7c 100%)",boxShadow:"0 4px 24px rgba(10,26,66,0.4)",position:"sticky",top:0,zIndex:200}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px 5px"}}>
        <img src={TKJ_LOGO} alt="TKJ" style={{height:40,objectFit:"contain",flexShrink:0,filter:"brightness(1.05)"}}/>
        <div style={{borderLeft:"1px solid rgba(255,255,255,0.2)",paddingLeft:12}}>
          <div style={{color:"#c9a227",fontSize:11,fontWeight:900,letterSpacing:"0.12em",textTransform:"uppercase",lineHeight:1.2,whiteSpace:"nowrap"}}>Task Monitoring</div>
          <div style={{color:"#e2e8f0",fontSize:9,fontWeight:600,marginTop:2,whiteSpace:"nowrap"}}>
            TKJ Project Management Sdn Bhd
            <span style={{color:"#94a3b8",fontWeight:400,fontSize:8,marginLeft:6,paddingLeft:6,borderLeft:"1px solid #334155"}}>(1676211-U)</span>
          </div>
          <div style={{color:"#64748b",fontSize:8,fontStyle:"italic",whiteSpace:"nowrap",marginTop:1}}>Managing Complexity. Delivering Results.</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:narrow?3:5,padding:"4px 14px 8px",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
        {[{id:"list",icon:"ﹽ±┴",label:"Tasks"},{id:"kpi",icon:"ﹽ±├",label:"KPI"},...(isAdmin?[{id:"admin",icon:"ﻗﻸﻷﻡ٨┘",label:"Admin"}]:[])].map(n=>(
          <button key={n.id} onClick={()=>setView(n.id)} style={{display:"flex",alignItems:"center",gap:narrow?0:5,padding:narrow?"6px 10px":"6px 14px",borderRadius:6,border:"none",background:view===n.id?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.05)",color:view===n.id?"#fff":"#7ba3d4",fontSize:narrow?18:12,fontWeight:600,cursor:"pointer",position:"relative"}}>
            <span>{n.icon}</span>{!narrow&&<span>{n.label}{n.id==="admin"&&pendingDeleteNotifs>0?" ﹽ½٤":""}</span>}
            {narrow&&n.id==="admin"&&pendingDeleteNotifs>0&&<span style={{position:"absolute",top:2,right:2,fontSize:8}}>ﹽ½٤</span>}
          </button>
        ))}
        <div ref={bellRef} style={{position:"relative"}}>
          <button onClick={()=>{setShowNotifs(v=>!v);if(!showNotifs)markNotifsRead();}} className={urgentNotifs?"bell-shake":""} style={{position:"relative",padding:"5px 8px",border:"none",background:"transparent",cursor:"pointer",color:notifications.length?"#fbbf24":"#7ba3d4",fontSize:18}}>
            ﹽ½½{(notifications.length+pendingDeleteNotifs)>0&&<span style={{position:"absolute",top:1,right:1,background:urgentNotifs?"#dc2626":pendingDeleteNotifs?"#f97316":"#f59e0b",color:"#fff",borderRadius:"50%",width:15,height:15,fontSize:8,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>{(notifications.length+pendingDeleteNotifs)>9?"9+":(notifications.length+pendingDeleteNotifs)}</span>}
          </button>
          {showNotifs&&<NotifPanel notifs={notifications} members={members} tasks={enriched} projects={projects} onClose={()=>setShowNotifs(false)} onOpenTask={(id,tab)=>{openTask(id,tab);setView("list");}}/>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:narrow?0:6,padding:narrow?"4px 6px":"4px 10px",background:"rgba(255,255,255,0.08)",borderRadius:7,cursor:"pointer"}} onClick={logout}>
          <Avatar name={currentUser.name} size={narrow?22:24} color="#c9a227"/>
          {!narrow&&<div><div style={{color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>{currentUser.name}{myMoodObj&&<span style={{fontSize:11}}>{myMoodObj.emoji}</span>}</div><div style={{color:"#7ba3d4",fontSize:8}}>{isAdmin?"Admin":"Member"} ﺁ٧ Logout</div></div>}
          {narrow&&myMoodObj&&<span style={{fontSize:10,marginLeft:2}}>{myMoodObj.emoji}</span>}
        </div>
        <button onClick={()=>{setSelected(null);setModal("form");}} style={{padding:narrow?"6px 10px":"7px 14px",borderRadius:7,border:"1.5px solid #c9a227",background:"rgba(201,162,39,0.1)",color:"#c9a227",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>
          {narrow?"ﻡﺱ┴":"+ New Task"}
        </button>
      </div>
    </div>

    {view==="kpi"&&<KPIView tasks={enriched} members={members} projects={projects} moods={moods}/>}
    {view==="admin"&&isAdmin&&<AdminView
      members={members} projects={projects} tasks={enriched} updates={updates}
      deleteRequests={deleteRequests} currentUser={currentUser}
      onUpdateMembers={async(arr)=>{for(const m of arr)await updateMember(m);}}
      onUpdateProjects={async(arr)=>{for(const p of arr)await updateProject(p);}}
      onReviewDeleteRequest={reviewDeleteRequest}
      onSetPassword={(m)=>setPwModal(m)}
    />}

    {view==="list"&&<div style={{padding:"14px 18px"}}>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <button onClick={()=>setShowPersonal(false)} style={{padding:"6px 14px",borderRadius:6,border:`1.5px solid ${!showPersonal?"#0f2557":"#e2e8f0"}`,background:!showPersonal?"#0f2557":"#fff",color:!showPersonal?"#fff":"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}>ﹽ±· Project Tasks</button>
        <button onClick={()=>setShowPersonal(true)} style={{padding:"6px 14px",borderRadius:6,border:`1.5px solid ${showPersonal?"#8b5cf6":"#e2e8f0"}`,background:showPersonal?"#8b5cf6":"#fff",color:showPersonal?"#fff":"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}>ﹽ∞¤ My Personal</button>
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:"12px 14px",marginBottom:14,boxShadow:"0 2px 12px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{position:"relative",flex:"1 1 200px"}}>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",fontSize:13}}>ﹽ½┌</span>
            <input value={filters.search} onChange={e=>updF("search",e.target.value)} placeholder="Search tasks, refﻗ°" style={{...selStyle,paddingLeft:28,width:"100%",boxSizing:"border-box"}}/>
          </div>
          {!showPersonal&&<select value={filters.project} onChange={e=>updF("project",e.target.value)} style={selStyle}><option value="">All Projects</option>{projects.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <select value={filters.status} onChange={e=>updF("status",e.target.value)} style={selStyle}><option value="">All Status</option>{Object.keys(STATUS_META).map(s=><option key={s}>{s}</option>)}</select>
          <select value={filters.priority} onChange={e=>updF("priority",e.target.value)} style={selStyle}><option value="">All Priority</option>{Object.keys(PRIORITY_META).map(p=><option key={p}>{p}</option>)}</select>
          {!showPersonal&&<select value={filters.assignee} onChange={e=>updF("assignee",e.target.value)} style={selStyle}><option value="">All Assignee</option>{members.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>}
          {activeFiltersCount>0&&<button onClick={clearFilters} style={{padding:"7px 12px",borderRadius:6,border:"1.5px solid #fecaca",background:"#fff",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>ﻗ¼ Clear</button>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
          {[["Due","dueDateFrom","dueDateTo"],["Prepared","preparedFrom","preparedTo"],["Completed","completedFrom","completedTo"]].map(([l,f1,f2])=><div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:10,color:"#64748b",fontWeight:700,whiteSpace:"nowrap"}}>{l}:</span>
            <input type="date" value={filters[f1]} onChange={e=>updF(f1,e.target.value)} style={dateStyle}/>
            <span style={{fontSize:10,color:"#94a3b8"}}>ﻗ°±</span>
            <input type="date" value={filters[f2]} onChange={e=>updF(f2,e.target.value)} style={dateStyle}/>
          </div>)}
          {[["showDueToday","Due Today"],["showDueWeek","Due This Week"]].map(([k,l])=><button key={k} onClick={()=>updF(k,!filters[k])} style={{padding:"4px 10px",borderRadius:5,border:`1.5px solid ${filters[k]?"#0f2557":"#e2e8f0"}`,background:filters[k]?"#0f2557":"#fff",color:filters[k]?"#fff":"#64748b",fontSize:11,fontWeight:600,cursor:"pointer"}}>{l}</button>)}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
        <span style={{fontSize:12,color:"#64748b",fontWeight:600}}>{filtered.length} task{filtered.length!==1?"s":""}</span>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
          <span style={{fontSize:10,color:"#94a3b8"}}>Sort:</span>
          {[{k:"dueDate",l:"Due Date"},{k:"createdAt",l:"Created"},{k:"priority",l:"Priority"},{k:"project",l:"Project"},{k:"status",l:"Status"},{k:"ref",l:"Ref"}].map(s=>{
            const isActive=sortKey===s.k;
            return <div key={s.k} style={{display:"flex",borderRadius:5,overflow:"hidden",border:`1px solid ${isActive?"#0f2557":"#e2e8f0"}`}}>
              <button onClick={()=>setSort(s.k,"asc")} style={{padding:"3px 7px",border:"none",borderRight:`1px solid ${isActive?"#1e3a7c":"#e2e8f0"}`,background:isActive&&sortDir==="asc"?"#0f2557":isActive?"#e8eef8":"#fff",color:isActive&&sortDir==="asc"?"#fff":"#64748b",fontSize:9,fontWeight:isActive&&sortDir==="asc"?700:400,cursor:"pointer"}}>{s.l} ﻗ│∞</button>
              <button onClick={()=>setSort(s.k,"desc")} style={{padding:"3px 7px",border:"none",background:isActive&&sortDir==="desc"?"#0f2557":isActive?"#e8eef8":"#fff",color:isActive&&sortDir==="desc"?"#fff":"#64748b",fontSize:9,fontWeight:isActive&&sortDir==="desc"?700:400,cursor:"pointer"}}>ﻗ│±</button>
            </div>;
          })}
        </div>
      </div>
      <ResponsiveTaskTable
        filtered={filtered} enriched={enriched} messages={messages}
        notifications={notifications} members={members} projects={projects}
        getMember={getMember} getProject={getProject}
        STATUS_META={STATUS_META} PRIORITY_META={PRIORITY_META}
        fmtDate={fmtDate} DueChip={DueChip} Badge={Badge} Avatar={Avatar}
        clearFilters={clearFilters} activeFiltersCount={activeFiltersCount}
        onOpenTask={(t)=>{setSelected(t);setSelectedTab("info");setModal("detail");}}
      />
    </div>}

    {modal==="form"&&<Modal onClose={()=>setModal(null)} wide><TaskForm initial={null} tasks={tasks} members={members} projects={projects} currentUser={currentUser} onSave={saveTask} onCancel={()=>setModal(null)}/></Modal>}
    {modal==="edit"&&selected&&<Modal onClose={()=>setModal(null)} wide><TaskForm initial={enriched.find(t=>t.id===selected.id)||selected} tasks={tasks} members={members} projects={projects} currentUser={currentUser} onSave={saveTask} onCancel={()=>setModal(null)}/></Modal>}
    {modal==="detail"&&selected&&<Modal onClose={()=>setModal(null)} extraWide>
      <TaskDetailModal
        task={enriched.find(t=>t.id===selected.id)||selected}
        tasks={enriched} members={members} projects={projects}
        updates={updates} messages={messages} currentUser={currentUser}
        onClose={()=>setModal(null)} onEdit={()=>setModal("edit")}
        isAdmin={isAdmin} deleteRequests={deleteRequests}
        onDeleteAdmin={()=>deleteTask(selected.id)}
        onRequestDelete={(reason)=>submitDeleteRequest(selected.id,reason)}
        onAddUpdate={addUpdate} onSendMessage={sendMessage}
        onAttachmentChange={(a)=>updateAttachments(selected.id,a)}
      />
    </Modal>}

    <div style={{textAlign:"center",padding:"14px 0 22px",fontSize:10,color:"#94a3b8"}}>
      TKJ Project Management Sdn Bhd (1676211-U) ﺁ٧ {new Date().toLocaleDateString("en-MY",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})} ﺁ٧ {currentUser.name} {myMoodObj?myMoodObj.emoji:""} ﺁ٧ ﻗ»·ﻡ٨┘ Cloud Sync
    </div>
  </div>;
}

export default App

