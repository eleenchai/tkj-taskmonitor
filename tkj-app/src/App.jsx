// TKJ Task Monitor v2.1 - 20260605-0106
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

/* ── DATA MIGRATION ── */
const migrateTaskRefs=(tasks)=>tasks.map(t=>{
  if(t.ref&&/^TKJ-(.+)-\d{4}-(\d+)$/.test(t.ref)){
    const m=t.ref.match(/^TKJ-(.+)-\d{4}-(\d+)$/);
    if(m)return{...t,ref:`${m[1]}-${m[2].padStart(4,"0")}`};
  }
  if(t.ref&&/^PERSONAL-[^-]+-\d+$/.test(t.ref)&&!t.ref.startsWith("PERSONAL-1")){
    return{...t,ref:`PERSONAL-${Date.now()}-${Math.random().toString(36).slice(2,5)}`};
  }
  return t;
});

/* ── HELPERS ── */
const fmtDatetime=(d,t)=>d?`${fmtDate(d)}`:"";

/* ── DEFAULT TASK TYPES ── */

/* ── SMALL COMPONENTS ── */
function Badge({text,color,bg,small}){
  return<span style={{background:bg,color,borderRadius:4,padding:small?"2px 7px":"3px 10px",fontSize:small?10:11,fontWeight:700,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{text}</span>;
}
function DueChip({date,time}){
  const d=daysDiff(date);if(d===null)return<span style={{color:"#94a3b8",fontSize:12}}>–</span>;
  let color,bg,prefix;
  if(d<0){color="#991b1b";bg="#fee2e2";prefix=`${Math.abs(d)}d overdue`;}
  else if(d===0){color="#7c2d12";bg="#ffedd5";prefix=`Due today${time?` · ${fmtTime(time)}`:""}`;}
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

/* ── LIGHTBOX VIEWER ── */
function Lightbox({src,name,onClose}){
  return<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{position:"absolute",top:16,right:16,display:"flex",gap:10}}>
      <a href={src} download={name} onClick={e=>e.stopPropagation()}
        style={{padding:"7px 14px",background:"rgba(255,255,255,0.15)",color:"#fff",borderRadius:7,fontSize:12,fontWeight:700,textDecoration:"none",border:"1px solid rgba(255,255,255,0.3)"}}>
        ⬇ Save
      </a>
      <button onClick={onClose} style={{padding:"7px 14px",background:"rgba(255,255,255,0.15)",color:"#fff",border:"1px solid rgba(255,255,255,0.3)",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer"}}>✕ Close</button>
    </div>
    <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:10,textAlign:"center"}}>{name} · Pinch or scroll to zoom · Tap outside to close</div>
    <img src={src} alt={name} onClick={e=>e.stopPropagation()}
      style={{maxWidth:"100%",maxHeight:"85vh",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,0.6)",cursor:"zoom-in"}}/>
  </div>;
}

/* ── INLINE FILE DISPLAY ── */
function InlineFiles({files=[]}){
  const [lightbox,setLightbox]=useState(null);
  if(!files.length)return null;
  return<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:8}}>
    {lightbox&&<Lightbox src={lightbox.src} name={lightbox.name} onClose={()=>setLightbox(null)}/>}
    {files.map(f=>{
      const isImg=f.type&&f.type.startsWith("image/");
      const isPdf=f.type==="application/pdf";
      return<div key={f.id}>
        {isImg
          ?<div style={{cursor:"zoom-in"}} onClick={()=>setLightbox({src:f.data,name:f.name})}>
            <img src={f.data} alt={f.name} style={{maxWidth:"100%",borderRadius:7,border:"2px solid #e2e8f0",display:"block",objectFit:"contain"}}/>
            <div style={{fontSize:10,color:"#64748b",marginTop:3,textAlign:"center"}}>🔍 Tap to enlarge · {f.name}</div>
          </div>
          :<a href={f.data} target="_blank" rel="noopener noreferrer" download={!isPdf?f.name:undefined}
            style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 12px",background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:7,fontSize:11,color:"#1e40af",fontWeight:600,textDecoration:"none"}}>
            <span style={{fontSize:16}}>{FILE_ICON(f.type)}</span>
            <div style={{minWidth:0}}>
              <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:220}}>{f.name}</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>{fmtBytes(f.size)} · {isPdf?"tap to view PDF":"tap to open"}</div>
            </div>
          </a>}
      </div>;
    })}
  </div>;
}

/* ── ATTACHMENT PANEL ── */
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
      <div style={{fontSize:18,marginBottom:3}}>📎</div>
      <div style={{fontSize:12,fontWeight:700,color:"#475569"}}>Click or drag to attach</div>
      <div style={{fontSize:10,color:"#94a3b8"}}>Images, PDF, Word, Excel · Max 10MB</div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} style={{display:"none"}} onChange={e=>processFiles(e.target.files)}/>
    </div>}
    {attachments.map(f=>{
      const isImg=f.type&&f.type.startsWith("image/");
      return<div key={f.id} style={{marginBottom:6}}>
        {isImg
          ?<div>
            <div style={{cursor:"zoom-in",position:"relative"}} onClick={()=>setLightbox&&setLightbox({src:f.data,name:f.name})}>
              <img src={f.data} alt={f.name} style={{width:"100%",borderRadius:7,border:"1px solid #e2e8f0",display:"block",objectFit:"contain"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4,padding:"0 2px"}}>
              <span style={{fontSize:10,color:"#64748b"}}>🔍 {f.name}</span>
              <div style={{display:"flex",gap:6}}>
                <a href={f.data} download={f.name} style={{padding:"3px 10px",background:"#eff6ff",border:"1px solid #bfdbfe",color:"#1e40af",borderRadius:4,fontSize:10,fontWeight:700,textDecoration:"none"}}>⬇ Save</a>
                {!readOnly&&<button onClick={()=>onChange(attachments.filter(x=>x.id!==f.id))} style={{padding:"3px 8px",background:"#fff0f0",border:"1px solid #fecaca",color:"#dc2626",fontSize:10,fontWeight:700,borderRadius:4,cursor:"pointer"}}>✕</button>}
              </div>
            </div>
          </div>
          :<div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#f8fafc",borderRadius:7,border:"1.5px solid #e2e8f0"}}>
            <div style={{width:30,height:30,borderRadius:5,background:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>{FILE_ICON(f.type)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{fmtBytes(f.size)}</div>
            </div>
            <a href={f.data} download={f.name} style={{padding:"3px 8px",background:"#eff6ff",border:"1px solid #bfdbfe",color:"#1e40af",fontSize:11,fontWeight:700,borderRadius:4,textDecoration:"none"}}>⬇</a>
            {!readOnly&&<button onClick={()=>onChange(attachments.filter(x=>x.id!==f.id))} style={{padding:"3px 7px",background:"#fff0f0",border:"1px solid #fecaca",color:"#dc2626",fontSize:11,fontWeight:700,borderRadius:4,cursor:"pointer"}}>✕</button>}
          </div>}
      </div>;
    })}
  </div>;
}

/* ── LINK RENDERER — auto-detect URLs ── */
function RenderText({text}){
  if(!text)return null;
  const urlRegex=/(https?:\/\/[^\s]+)/g;
  const parts=text.split(urlRegex);
  return<span>{parts.map((p,i)=>urlRegex.test(p)
    ?<a key={i} href={p} target="_blank" rel="noopener noreferrer"
       style={{color:"#1e40af",textDecoration:"underline",wordBreak:"break-all"}}>{p}</a>
    :<span key={i}>{p}</span>
  )}</span>;
}

/* ── UPDATES TAB ── */
function UpdatesTab({task,updates,members,currentUser,isAdmin,isAssignor,isAssignee,onAddUpdate,onApproveUpdate,onRejectUpdate,onDeleteUpdate}){
  const [text,setText]=useState("");
  const [files,setFiles]=useState([]);
  const [supersedeTarget,setSupersedeTarget]=useState(null); // update being superseded
  const [suggestMode,setSuggestMode]=useState(false); // non-privileged suggest mode
  const [expandedRef,setExpandedRef]=useState(null); // which update's ref chain is expanded
  const [lightboxItem,setLightboxItem]=useState(null); // lightbox for update images
  const fileRef=useRef();
  const updateRefs=useRef({}); // refs for scrolling to specific updates

  const canPostDirect=isAdmin||isAssignor||isAssignee;
  const taskUpdates=updates
    .filter(u=>u.taskId===task.id)
    .filter(u=>{
      // Briefing audit logs: Admin only
      if(u.type==="briefing_audit") return isAdmin;
      // Pending suggestions: only show to author + privileged users
      if(u.type==="suggestion"&&u.suggestionStatus==="pending"){
        return u.authorId===currentUser.id||canPostDirect;
      }
      return true;
    })
    .sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));

  const getMember=(id)=>members.find(m=>m.id===id)||{name:"Unknown"};
  const addFiles=async(fileList)=>{const r=await readFiles(fileList);setFiles(f=>[...f,...r]);};
  const removeFile=(id)=>setFiles(f=>f.filter(x=>x.id!==id));
  const canPost=text.trim().length>0;

  const scrollToUpdate=(id)=>{
    const el=updateRefs.current[id];
    if(el)el.scrollIntoView({behavior:"smooth",block:"center"});
    setExpandedRef(id);
    setTimeout(()=>setExpandedRef(null),3000);
  };

  const submit=()=>{
    if(!text.trim()){alert("Please describe this update before posting.");return;}
    const now=nowISO();
    if(!canPostDirect||suggestMode){
      // Submit as suggestion pending approval
      onAddUpdate({
        id:uid(),taskId:task.id,authorId:currentUser.id,
        text:text.trim(),attachments:files,timestamp:now,
        type:"suggestion",suggestionStatus:"pending",
        supersedesId:supersedeTarget?.id||null,
        approvedBy:null,approvedAt:null,
      });
    } else {
      // Direct post
      const newId=uid();
      onAddUpdate({
        id:newId,taskId:task.id,authorId:currentUser.id,
        text:text.trim(),attachments:files,timestamp:now,
        type:"comment",
        supersedesId:supersedeTarget?.id||null,
        supersededById:null,approvedBy:null,approvedAt:null,
      });
      // Mark the superseded update
      if(supersedeTarget){
        onAddUpdate({
          ...supersedeTarget,
          supersededById:newId,
          supersededAt:now,
          supersededBy:currentUser.id,
          _updateExisting:true,
        });
      }
    }
    setText("");setFiles([]);setSupersedeTarget(null);setSuggestMode(false);
  };

  const handleApprove=(suggestion)=>{
    const now=nowISO();
    const newId=uid();
    // Post approved update
    onAddUpdate({
      id:newId,taskId:task.id,authorId:suggestion.authorId,
      text:suggestion.text,attachments:suggestion.attachments||[],
      timestamp:now,type:"comment",
      supersedesId:suggestion.supersedesId||null,
      supersededById:null,
      approvedBy:currentUser.id,approvedAt:now,
    });
    // Mark superseded if linked
    if(suggestion.supersedesId){
      const orig=taskUpdates.find(u=>u.id===suggestion.supersedesId);
      if(orig){
        onAddUpdate({...orig,supersededById:newId,supersededAt:now,supersededBy:suggestion.authorId,_updateExisting:true});
      }
    }
    // Remove suggestion
    onApproveUpdate(suggestion.id);
  };

  const handleReject=(suggestion)=>{
    if(!window.confirm("Reject this suggestion?"))return;
    onRejectUpdate(suggestion.id);
  };
  return<div>
    {lightboxItem&&<Lightbox src={lightboxItem.src} name={lightboxItem.name} onClose={()=>setLightboxItem(null)}/>}
    {/* ── UPDATE LIST ── */}
    <div style={{maxHeight:420,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,marginBottom:14,paddingRight:2}}>
      {taskUpdates.length===0&&<div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",fontSize:13}}>No updates yet.</div>}
      {taskUpdates.map(u=>{
        const author=getMember(u.authorId);
        const approver=u.approvedBy?getMember(u.approvedBy):null;
        const supersededByUpdate=u.supersededById?taskUpdates.find(x=>x.id===u.supersededById):null;
        const supersedes=u.supersedesId?taskUpdates.find(x=>x.id===u.supersedesId):null;
        const isSuperseded=!!u.supersededById;
        const isSuggestion=u.type==="suggestion";
        const isPending=isSuggestion&&u.suggestionStatus==="pending";
        const isHighlighted=expandedRef===u.id;

        let bgColor="#f8fafc",borderColor="#e2e8f0";
        if(u.type==="system"){bgColor="#f0fdf4";borderColor="#bbf7d0";}
        if(isSuperseded){bgColor="#fafafa";borderColor="#e2e8f0";}
        if(isPending){bgColor="#fffbf5";borderColor="#fbbf24";}
        if(isHighlighted){bgColor="#eff6ff";borderColor="#3b82f6";}

        return<div key={u.id} ref={el=>updateRefs.current[u.id]=el}
          style={{padding:"12px 14px",background:bgColor,borderRadius:9,border:`1.5px solid ${borderColor}`,opacity:isSuperseded?0.65:1,transition:"all 0.3s"}}>

          {/* ── SUPERSEDED BANNER ── */}
          {isSuperseded&&supersededByUpdate&&<div style={{marginBottom:8,padding:"5px 10px",background:"#fef3c7",borderRadius:6,border:"1px solid #fbbf24",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
            <span style={{fontSize:10,fontWeight:700,color:"#92400e"}}>⚠️ UPDATED — refer to newer update</span>
            <button onClick={()=>scrollToUpdate(supersededByUpdate.id)} style={{fontSize:10,color:"#1e40af",background:"#dbeafe",border:"none",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontWeight:700}}>
              → View Update by {getMember(supersededByUpdate.authorId)?.name} · {fmtDT(supersededByUpdate.timestamp)}
            </button>
          </div>}

          {/* ── SUPERSEDES REFERENCE ── */}
          {supersedes&&<div style={{marginBottom:8,padding:"5px 10px",background:"#f0f9ff",borderRadius:6,border:"1px solid #bfdbfe",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
            <span style={{fontSize:10,color:"#1e40af",fontWeight:700}}>↩️ Supersedes earlier update:</span>
            <button onClick={()=>scrollToUpdate(supersedes.id)} style={{fontSize:10,color:"#1e40af",background:"#dbeafe",border:"none",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontWeight:700}}>
              → {getMember(supersedes.authorId)?.name} · {fmtDT(supersedes.timestamp)}
            </button>
          </div>}

          {/* ── PENDING SUGGESTION BANNER ── */}
          {isPending&&<div style={{marginBottom:8,padding:"6px 10px",background:"#fef3c7",borderRadius:6,border:"1px solid #fbbf24"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#92400e",marginBottom:canPostDirect?6:0}}>
              ⏳ Suggested Update — Pending Approval
              {u.authorId===currentUser.id&&" (your suggestion)"}
            </div>
            {canPostDirect&&<div style={{display:"flex",gap:6}}>
              <button onClick={()=>handleApprove(u)} style={{padding:"4px 12px",borderRadius:5,border:"none",background:"#166534",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✅ Approve & Post</button>
              <button onClick={()=>handleReject(u)} style={{padding:"4px 10px",borderRadius:5,border:"1px solid #dc2626",background:"#fff",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>❌ Reject</button>
            </div>}
          </div>}

          {/* ── APPROVED BY BANNER ── */}
          {u.approvedBy&&approver&&<div style={{marginBottom:8,padding:"4px 10px",background:"#f0fdf4",borderRadius:6,border:"1px solid #bbf7d0"}}>
            <span style={{fontSize:10,color:"#166534",fontWeight:700}}>✅ Approved by {approver.name} · {fmtDT(u.approvedAt)}</span>
          </div>}

          {/* ── HEADER ── */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
            <Avatar name={author.name} size={30} color={author.role==="admin"?"#c9a227":"#0f2557"}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:"#0f2557"}}>
                {author.name}
                {u.approvedBy&&approver&&<span style={{fontSize:10,fontWeight:400,color:"#64748b",marginLeft:6}}>written by · approved by {approver.name}</span>}
              </div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{fmtDT(u.timestamp)}</div>
            </div>
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              {u.type==="system"&&<Badge text="System" color="#166534" bg="#dcfce7" small/>}
              {isSuperseded&&<Badge text="Outdated" color="#92400e" bg="#fef3c7" small/>}
              {isPending&&<Badge text="Pending" color="#92400e" bg="#fef3c7" small/>}
            </div>
          </div>

          {/* ── TEXT with clickable links ── */}
          {u.text&&<div style={{fontSize:13,color:isSuperseded?"#94a3b8":"#374151",lineHeight:1.6,paddingLeft:38,marginBottom:8,textDecoration:isSuperseded?"none":"none"}}>
            <RenderText text={u.text}/>
          </div>}

          {/* ── ATTACHMENTS ── */}
          {u.attachments&&u.attachments.length>0&&<div style={{paddingLeft:38}}>
            {u.attachments.map(f=>{
              const isImg=f.type&&f.type.startsWith("image/");
              return<div key={f.id} style={{marginBottom:6}}>
                {isImg
                  ?<div>
                    <img src={f.data} alt={f.name}
                      onClick={()=>setLightboxItem({src:f.data,name:f.name})}
                      style={{width:"100%",borderRadius:7,border:"1px solid #e2e8f0",display:"block",objectFit:"contain",cursor:"zoom-in"}}/>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:3}}>
                      <span style={{fontSize:10,color:"#64748b"}}>🔍 Tap to enlarge · {f.name}</span>
                      <a href={f.data} download={f.name} style={{fontSize:10,color:"#1e40af",fontWeight:700,textDecoration:"none"}}>⬇ Save</a>
                    </div>
                  </div>
                  :<a href={f.data} download={f.name} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"6px 11px",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:7,fontSize:11,color:"#1e40af",fontWeight:600,textDecoration:"none"}}>
                    <span style={{fontSize:15}}>{FILE_ICON(f.type)}</span>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{f.name}</span>
                    <span style={{color:"#94a3b8",fontSize:10,flexShrink:0}}>({fmtBytes(f.size)})</span>
                    <span style={{color:"#1e40af",fontSize:10,flexShrink:0}}>⬇</span>
                  </a>}
              </div>;
            })}
          </div>}

          {/* ── FOOTER: supersede button + lock + admin delete ── */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8,paddingLeft:38,flexWrap:"wrap",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>🔒 This record cannot be edited</span>
              {isAdmin&&u.type!=="system"&&<button
                onClick={()=>{if(window.confirm("Permanently delete this update record? This cannot be undone."))onDeleteUpdate(u.id);}}
                style={{fontSize:9,color:"#dc2626",fontWeight:700,background:"#fff0f0",border:"1px solid #fecaca",borderRadius:4,padding:"2px 7px",cursor:"pointer"}}>
                🗑 Delete
              </button>}
            </div>
            <div style={{display:"flex",gap:6}}>
              {!isSuperseded&&!isPending&&u.type!=="system"&&canPostDirect&&<button
                onClick={()=>{setSupersedeTarget(u);setSuggestMode(false);setText("");setFiles([]);setTimeout(()=>document.getElementById("update-textarea")?.focus(),100);}}
                style={{fontSize:10,color:"#f97316",fontWeight:700,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:5,padding:"3px 9px",cursor:"pointer"}}>
                ↩️ Supersede This
              </button>}
              {!isSuperseded&&!isPending&&u.type!=="system"&&!canPostDirect&&<button
                onClick={()=>{setSupersedeTarget(u);setSuggestMode(true);setText("");setFiles([]);setTimeout(()=>document.getElementById("update-textarea")?.focus(),100);}}
                style={{fontSize:10,color:"#8b5cf6",fontWeight:700,background:"#ede9fe",border:"1px solid #c4b5fd",borderRadius:5,padding:"3px 9px",cursor:"pointer"}}>
                💡 Suggest Update
              </button>}
            </div>
          </div>
        </div>;
      })}
    </div>

    {/* ── SUPERSEDE TARGET INDICATOR ── */}
    {supersedeTarget&&<div style={{background:"#fff7ed",border:"1.5px solid #f97316",borderRadius:8,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div>
        <div style={{fontSize:11,fontWeight:700,color:"#f97316"}}>↩️ {suggestMode?"Suggesting update to supersede:":"Superseding update from:"} {getMember(supersedeTarget.authorId)?.name} · {fmtDT(supersedeTarget.timestamp)}</div>
        <div style={{fontSize:11,color:"#92400e",marginTop:2,fontStyle:"italic"}}>"{supersedeTarget.text?.slice(0,60)}{supersedeTarget.text?.length>60?"…":""}"</div>
      </div>
      <button onClick={()=>{setSupersedeTarget(null);setSuggestMode(false);}} style={{background:"none",border:"none",color:"#f97316",fontSize:16,cursor:"pointer",flexShrink:0}}>✕</button>
    </div>}

    {/* ── SUGGEST MODE HEADER ── */}
    {!canPostDirect&&!suggestMode&&!supersedeTarget&&<div style={{background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:7,padding:"7px 12px",marginBottom:8,fontSize:11,color:"#7c3aed"}}>
      💡 You can suggest an update — it will be reviewed by Admin/Assignor/Assignee before posting.
    </div>}

    {/* ── STAGED FILES ── */}
    {files.length>0&&<div style={{background:"#f0f9ff",border:"1.5px solid #bfdbfe",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:700,color:"#1e40af",marginBottom:6}}>📎 Files staged — add a description below:</div>
      {files.map(f=><div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #dbeafe"}}>
        <span style={{fontSize:14}}>{FILE_ICON(f.type)}</span>
        <span style={{fontSize:12,color:"#1e293b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
        <span style={{fontSize:10,color:"#94a3b8"}}>{fmtBytes(f.size)}</span>
        <button onClick={()=>removeFile(f.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
      </div>)}
    </div>}

    {/* ── INPUT BOX ── */}
    <div style={{border:`1.5px solid ${suggestMode?"#c4b5fd":"#e2e8f0"}`,borderRadius:9,overflow:"hidden",background:"#fff"}}>
      <textarea id="update-textarea" value={text} onChange={e=>setText(e.target.value)}
        placeholder={
          suggestMode?"💡 Write your suggested update — it will be sent for approval before posting…"
          :supersedeTarget?"↩️ Write the updated information that supersedes the above…"
          :!canPostDirect?"💡 Write your suggested update — it will be sent for approval…"
          :"Add an update, note or status change… (Cannot be edited after posting)"}
        style={{width:"100%",padding:"10px 12px",border:"none",resize:"vertical",minHeight:80,fontSize:13,fontFamily:"inherit",color:"#1e293b",background:suggestMode?"#faf5ff":files.length>0&&!text.trim()?"#fffbf5":"#f8fafc",outline:"none"}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"#f1f5f9",borderTop:"1px solid #e2e8f0",flexWrap:"wrap",gap:6}}>
        <button onClick={()=>fileRef.current?.click()} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          📎 Attach File
        </button>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {(suggestMode||!canPostDirect)&&<button onClick={()=>{setSuggestMode(false);setSupersedeTarget(null);}} style={{padding:"7px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,cursor:"pointer"}}>Cancel</button>}
          <button onClick={submit} disabled={!canPost} style={{padding:"7px 20px",borderRadius:6,border:"none",
            background:!canPost?"#e2e8f0":(suggestMode||!canPostDirect)?"#7c3aed":"#0f2557",
            color:canPost?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:canPost?"pointer":"default"}}>
            {(suggestMode||!canPostDirect)?"💡 Submit for Approval":"📌 Post Update (Permanent)"}
          </button>
        </div>
      </div>
    </div>
    <div style={{fontSize:10,color:"#94a3b8",marginTop:6,textAlign:"center"}}>
      {canPostDirect?"Files must always have a description — this keeps the audit trail meaningful."
      :"Your suggestion will only be visible to you and approvers until approved."}
    </div>
  </div>;
}

/* ── MESSAGES TAB ── */
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
    setText("");setUrgent(false);setMentions([]);setFiles([]);
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
          {msg.urgent&&<div style={{textAlign:"center",fontSize:11,fontWeight:700,color:"#dc2626",background:"#fee2e2",borderRadius:5,padding:"3px 0",marginBottom:4}}>🚨 URGENT – IMMEDIATE ATTENTION REQUIRED</div>}
          <div style={{display:"flex",gap:8,alignItems:"flex-start",flexDirection:isMe?"row-reverse":"row"}}>
            <Avatar name={author.name} size={32} color={aColor}/>
            <div style={{maxWidth:"75%"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexDirection:isMe?"row-reverse":"row"}}>
                <span style={{fontSize:12,fontWeight:800,color:isMe?"#0f2557":aColor}}>{isMe?"You":author.name}</span>
                <span style={{fontSize:10,color:"#94a3b8"}}>{fmtDT(msg.timestamp)}</span>
                {msg.urgent&&<span style={{fontSize:10,color:"#dc2626",fontWeight:700}}>🚨 URGENT</span>}
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
    {mentioning&&<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:7,padding:6,marginBottom:6,boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
      <div style={{fontSize:10,color:"#94a3b8",marginBottom:4,padding:"0 4px"}}>Tag a member:</div>
      {members.filter(m=>m.active&&m.id!==currentUser.id).map(m=><button key={m.id} onClick={()=>addMention(m)} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"7px 8px",background:"none",border:"none",cursor:"pointer",borderRadius:5,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background="#f0f4f8"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
        <Avatar name={m.name} size={22} color={memberColor(m.id)}/><span style={{fontSize:13,color:"#1e293b",fontWeight:600}}>{m.name}</span>
      </button>)}
    </div>}
    {files.length>0&&<div style={{padding:"6px 10px",background:"#f8fafc",borderRadius:7,marginBottom:6,border:"1px solid #e2e8f0"}}><InlineFiles files={files}/></div>}
    <div style={{border:"1.5px solid #e2e8f0",borderRadius:9,overflow:"hidden",background:"#fff"}}>
      <textarea value={text} onChange={e=>handleText(e.target.value)} onKeyDown={handleKey} placeholder="Type a message… @ to mention, Enter to send" style={{width:"100%",padding:"10px 12px",border:"none",resize:"none",height:58,fontSize:13,fontFamily:"inherit",color:"#1e293b",background:"#fff",outline:"none"}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:"#f8fafc",borderTop:"1px solid #e2e8f0"}}>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>fileRef.current?.click()} style={{padding:"5px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,fontWeight:600,cursor:"pointer"}}>📎</button>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
          <button onClick={()=>setUrgent(u=>!u)} style={{padding:"5px 11px",borderRadius:5,border:`1.5px solid ${urgent?"#dc2626":"#e2e8f0"}`,background:urgent?"#fee2e2":"#fff",color:urgent?"#dc2626":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer"}}>
            🚨 {urgent?"URGENT":"Urgent"}
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

/* ── DELETE SECTION ── */
function DeleteSection({task,currentUser,isAdmin,deleteRequests,onDeleteAdmin,onRequestDelete}){
  const [showRequestForm,setShowRequestForm]=useState(false);
  const [reason,setReason]=useState("");
  const pending=deleteRequests.find(r=>r.taskId===task.id&&r.status==="pending");
  const allReqs=deleteRequests.filter(r=>r.taskId===task.id).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const isInvolved=task.assigneeId===currentUser.id||task.assignorId===currentUser.id;
  const submitRequest=()=>{
    if(!reason.trim()){alert("Please provide a reason for deletion.");return;}
    onRequestDelete(reason.trim());
    setReason("");setShowRequestForm(false);
  };
  return<div style={{marginTop:18}}>
    {pending&&<div style={{padding:"10px 14px",background:"#fef3c7",borderRadius:8,border:"1.5px solid #fbbf24",marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:800,color:"#92400e",marginBottom:3}}>⏳ Delete Request Pending</div>
      <div style={{fontSize:12,color:"#92400e"}}>Reason: "{pending.reason}"</div>
      <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>Submitted {fmtDT(pending.timestamp)} · Awaiting Admin approval</div>
    </div>}
    {allReqs.filter(r=>r.status!=="pending").map(r=><div key={r.id} style={{padding:"8px 12px",background:r.status==="approved"?"#fee2e2":"#f0fdf4",borderRadius:7,border:`1px solid ${r.status==="approved"?"#fecaca":"#bbf7d0"}`,marginBottom:8,fontSize:11}}>
      <span style={{fontWeight:700,color:r.status==="approved"?"#991b1b":"#166534"}}>{r.status==="approved"?"✅ Delete Approved":"❌ Delete Rejected"}</span>
      <span style={{color:"#94a3b8",marginLeft:8}}>{fmtDT(r.reviewedAt)}</span>
      {r.reviewNote&&<div style={{color:"#475569",marginTop:2}}>Note: {r.reviewNote}</div>}
    </div>)}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {isAdmin&&<button onClick={()=>{if(window.confirm("Permanently delete? This is irreversible."))onDeleteAdmin();}} style={{padding:"9px 16px",borderRadius:7,border:"1.5px solid #dc2626",background:"#fff",color:"#dc2626",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        🗑 Admin Delete
      </button>}
      {!isAdmin&&isInvolved&&!pending&&!task.deleted&&<button onClick={()=>setShowRequestForm(v=>!v)} style={{padding:"9px 16px",borderRadius:7,border:"1.5px solid #f97316",background:"#fff",color:"#f97316",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        📋 Request Deletion
      </button>}
      {!isAdmin&&!isInvolved&&!pending&&<div style={{padding:"9px 12px",background:"#f8fafc",borderRadius:7,border:"1.5px solid #e2e8f0",color:"#94a3b8",fontSize:11,display:"flex",alignItems:"center",gap:5}}>
        🔒 Only assignee/assignor can request deletion
      </div>}
    </div>
    {showRequestForm&&<div style={{marginTop:10,padding:"14px",background:"#fff7ed",borderRadius:8,border:"1.5px solid #fed7aa"}}>
      <div style={{fontSize:12,fontWeight:800,color:"#92400e",marginBottom:8}}>📋 Submit Delete Request</div>
      <div style={{fontSize:11,color:"#92400e",marginBottom:10}}>Your request will be sent to Admin for approval. The task remains active until approved.</div>
      <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="State your reason for requesting deletion…" style={{width:"100%",border:"1.5px solid #fed7aa",borderRadius:6,padding:"8px 10px",fontSize:12,fontFamily:"inherit",resize:"vertical",minHeight:72,outline:"none",background:"#fffbf5",boxSizing:"border-box"}}/>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <button onClick={submitRequest} style={{padding:"7px 18px",borderRadius:6,border:"none",background:"#f97316",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Submit Request</button>
        <button onClick={()=>{setShowRequestForm(false);setReason("");}} style={{padding:"7px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>}
  </div>;
}

/* ── TASK DETAIL MODAL ── */
function TaskDetailModal({task,tasks,members,projects,taskTypes,companies,updates,messages,currentUser,isAdmin,deleteRequests,onClose,onEdit,onDeleteAdmin,onRequestDelete,onAddUpdate,onSendMessage,onAttachmentChange,onSaveTask,onOpenLinked,onApproveUpdate,onRejectUpdate,onDeleteUpdate}){
  const [tab,setTab]=useState("info");
  const [editingDueDate,setEditingDueDate]=useState(false);
  const [newDueDate,setNewDueDate]=useState(task.dueDate||"");
  const [newDueTime,setNewDueTime]=useState(task.dueTime||"18:00");
  const [savingDue,setSavingDue]=useState(false);
  const [completing,setCompleting]=useState(false);
  const [undoingComplete,setUndoingComplete]=useState(false);
  const [infoLightbox,setInfoLightbox]=useState(null);

  const sm=STATUS_META[task.status]||STATUS_META["Not Started"];
  const pm=PRIORITY_META[task.priority]||PRIORITY_META["Medium"];
  const getMember=(id)=>members.find(m=>m.id===id);
  const assignee=getMember(task.assigneeId);const assignor=getMember(task.assignorId);
  const proj=projects.find(p=>p.id===task.projectId);
  const linked=tasks.filter(t=>task.linkedTo?.includes(t.id));
  const dependants=tasks.filter(t=>t.linkedTo?.includes(task.id));
  const ccMembers=(task.cc||[]).map(id=>getMember(id)).filter(Boolean);
  const taskUpdates=updates.filter(u=>u.taskId===task.id).filter(u=>u.type!=="briefing_audit"||isAdmin);
  const taskMsgs=messages.filter(m=>m.taskId===task.id);
  const urgentMsgs=taskMsgs.filter(m=>m.urgent).length;

  const isAssignee=task.assigneeId===currentUser.id;
  const isAssignor=task.assignorId===currentUser.id;
  const canComplete=isAssignee||isAssignor||isAdmin;
  const canEditDue=isAssignor||isAdmin;
  const isCompleted=task.status==="Completed"||!!task.completedDate;

  const handleMarkComplete=async()=>{
    if(!window.confirm("Mark this task as Completed?"))return;
    setCompleting(true);
    await onSaveTask({...task,status:"Completed",completedDate:today()});
    await onAddUpdate({id:uid(),taskId:task.id,authorId:currentUser.id,
      text:`✅ Task marked as Completed by ${currentUser.name} on ${fmtDate(today())}.`,
      attachments:[],timestamp:nowISO(),type:"system"});
    setCompleting(false);
  };

  const handleUndoComplete=async()=>{
    if(!window.confirm("Undo completion and revert to In Progress?"))return;
    setUndoingComplete(true);
    await onSaveTask({...task,status:"In Progress",completedDate:""});
    await onAddUpdate({id:uid(),taskId:task.id,authorId:currentUser.id,
      text:`↩️ Completion undone by ${currentUser.name}. Status reverted to In Progress.`,
      attachments:[],timestamp:nowISO(),type:"system"});
    setUndoingComplete(false);
  };

  const handleSaveDueDate=async()=>{
    if(!newDueDate){alert("Please select a due date.");return;}
    setSavingDue(true);
    const old=task.dueDate?fmtDate(task.dueDate):"(none)";
    await onSaveTask({...task,dueDate:newDueDate,dueTime:newDueTime});
    await onAddUpdate({id:uid(),taskId:task.id,authorId:currentUser.id,
      text:`📅 Due date updated by ${currentUser.name}: ${old} → ${fmtDate(newDueDate)} ${newDueTime}.`,
      attachments:[],timestamp:nowISO(),type:"system"});
    setSavingDue(false);
    setEditingDueDate(false);
  };

  const TABS=[
    {id:"info",label:"Info"},
    {id:"updates",label:`Updates${taskUpdates.length?` (${taskUpdates.length})`:""}`},
    {id:"messages",label:`Chat${taskMsgs.length?` (${taskMsgs.length})`:""}${urgentMsgs?" 🚨":""}`},
  ];
  const row=(label,val)=><div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #f1f5f9",alignItems:"flex-start"}}>
    <span style={{fontSize:12,color:"#94a3b8",fontWeight:600,flexShrink:0,marginRight:16,minWidth:110}}>{label}</span>
    <span style={{fontSize:13,color:"#1e293b",fontWeight:500,textAlign:"right"}}>{val}</span>
  </div>;

  return<div style={{padding:26}}>
    {infoLightbox&&<Lightbox src={infoLightbox.src} name={infoLightbox.name} onClose={()=>setInfoLightbox(null)}/>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
      <div style={{flex:1,paddingRight:14}}>
        {task.isPersonal&&<span style={{fontSize:10,background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"2px 8px",fontWeight:700,marginBottom:5,display:"inline-block"}}>👤 PERSONAL</span>}
        <div style={{fontSize:11,color:"#c9a227",fontWeight:800,letterSpacing:"0.1em",marginBottom:3}}>{task.ref}</div>
        <h2 style={{margin:0,fontSize:16,color:"#0f2557",fontWeight:800,lineHeight:1.3}}>{task.task}</h2>
        {proj&&<div style={{fontSize:12,color:"#64748b",marginTop:3}}>{proj.name}</div>}
      </div>
      <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8",flexShrink:0}}>✕</button>
    </div>

    {/* ── QUICK ACTION BUTTONS ── */}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      {canComplete&&!isCompleted&&<button onClick={handleMarkComplete} disabled={completing} style={{padding:"8px 16px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#166534,#16a34a)",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,opacity:completing?0.7:1}}>
        {completing?"Saving…":"✅ Mark Complete"}
      </button>}
      {canComplete&&isCompleted&&(isAdmin||isAssignor)&&<button onClick={handleUndoComplete} disabled={undoingComplete} style={{padding:"8px 16px",borderRadius:7,border:"1.5px solid #64748b",background:"#fff",color:"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,opacity:undoingComplete?0.7:1}}>
        {undoingComplete?"Saving…":"↩️ Undo Complete"}
      </button>}
      {canEditDue&&!editingDueDate&&<button onClick={()=>{setEditingDueDate(true);setNewDueDate(task.dueDate||"");setNewDueTime(task.dueTime||"18:00");}} style={{padding:"8px 16px",borderRadius:7,border:"1.5px solid #1e40af",background:"#fff",color:"#1e40af",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
        📅 Edit Due Date
      </button>}
      {(isAdmin||isAssignor)&&<button onClick={onEdit} style={{padding:"8px 16px",borderRadius:7,border:"1.5px solid #0f2557",background:"#fff",color:"#0f2557",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        ✏️ Edit Task
      </button>}
    </div>

    {/* ── INLINE DUE DATE EDITOR ── */}
    {editingDueDate&&<div style={{background:"#eff6ff",borderRadius:9,padding:"14px",marginBottom:14,border:"1.5px solid #bfdbfe"}}>
      <div style={{fontSize:12,fontWeight:800,color:"#1e40af",marginBottom:10}}>📅 Update Due Date</div>
      <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,marginBottom:4}}>DATE</div>
          <input type="date" value={newDueDate} onChange={e=>setNewDueDate(e.target.value)} style={{border:"1.5px solid #bfdbfe",borderRadius:6,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff"}}/>
        </div>
        <div>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,marginBottom:4}}>TIME</div>
          <input type="time" value={newDueTime} onChange={e=>setNewDueTime(e.target.value)} style={{border:"1.5px solid #bfdbfe",borderRadius:6,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff"}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={handleSaveDueDate} disabled={savingDue} style={{padding:"8px 18px",borderRadius:6,border:"none",background:"#1e40af",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",opacity:savingDue?0.7:1}}>
            {savingDue?"Saving…":"Save"}
          </button>
          <button onClick={()=>setEditingDueDate(false)} style={{padding:"8px 12px",borderRadius:6,border:"1.5px solid #bfdbfe",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
    </div>}

    <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
      <Badge text={task.status} color={sm.color} bg={sm.bg}/><Badge text={pm.label} color={pm.color} bg={pm.color+"18"}/>
      {assignee&&<Badge text={`👤 ${assignee.name}`} color="#475569" bg="#f1f5f9"/>}
      {urgentMsgs>0&&<Badge text={`🚨 ${urgentMsgs} urgent`} color="#991b1b" bg="#fee2e2"/>}
    </div>
    <div style={{display:"flex",gap:0,borderBottom:"2px solid #f1f5f9",marginBottom:16}}>
      {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 14px",border:"none",borderBottom:tab===t.id?"2px solid #0f2557":"2px solid transparent",marginBottom:-2,background:"none",color:tab===t.id?"#0f2557":"#94a3b8",fontSize:12,fontWeight:tab===t.id?800:500,cursor:"pointer"}}>{t.label}</button>)}
    </div>
    {tab==="info"&&<div>
      {row("Ref",task.ref)}{task.taskType&&row("Type",<span style={{background:"#eff6ff",color:"#1e40af",borderRadius:5,padding:"2px 10px",fontSize:12,fontWeight:700}}>{task.taskType}</span>)}{row("Prepared",fmtDate(task.preparedDate))}{row("Due Date",<DueChip date={task.dueDate} time={task.dueTime}/>)}
      {row("Completed",task.completedDate?<span style={{color:"#166534",fontWeight:600}}>✅ {fmtDate(task.completedDate)}</span>:"–")}
      {row("Assignor",assignor?<div style={{display:"flex",alignItems:"center",gap:6}}><Avatar name={assignor.name} size={20}/>{assignor.name}</div>:"–")}
      {row("Assignee",assignee?<div style={{display:"flex",alignItems:"center",gap:6}}><Avatar name={assignee.name} size={20}/>{assignee.name}</div>:"–")}
      {ccMembers.length>0&&row("CC",<div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>{ccMembers.map(m=><Badge key={m.id} text={m.name} color="#475569" bg="#f1f5f9" small/>)}</div>)}
      {task.taskTypeId&&row("Task Type",<span style={{padding:"2px 10px",background:"#eff6ff",color:"#1e40af",borderRadius:5,fontSize:12,fontWeight:700}}>{taskTypes?.find(tt=>tt.id===task.taskTypeId)?.name||"–"}</span>)}
      {task.companyId&&row("Company",<span style={{padding:"2px 10px",background:"#f0fdf4",color:"#166534",borderRadius:5,fontSize:12,fontWeight:700}}>{(()=>{const co=companies?.find(c=>c.id===task.companyId);return co?`${co.code} — ${co.name}`:"–";})()}</span>)}
      {task.remarks&&row("Remarks",task.remarks)}
      {(()=>{
        // Collect all updates that have attachments for this task
        const updatesWithFiles=updates.filter(u=>u.taskId===task.id&&u.attachments&&u.attachments.length>0).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
        if(!updatesWithFiles.length)return null;
        return<div style={{padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
          <div style={{fontSize:12,color:"#94a3b8",fontWeight:600,marginBottom:10}}>📎 Attachments ({updatesWithFiles.reduce((n,u)=>n+u.attachments.length,0)} file{updatesWithFiles.reduce((n,u)=>n+u.attachments.length,0)!==1?"s":""})</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {updatesWithFiles.map(u=>{
              const author=members.find(m=>m.id===u.authorId)||{name:"?"};
              return<div key={u.id} style={{background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",overflow:"hidden"}}>
                {/* Context header — what is this file for */}
                <div style={{padding:"7px 12px",background:"#f1f5f9",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"flex-start",gap:8}}>
                  <Avatar name={author.name} size={20} color="#0f2557"/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#0f2557"}}>{author.name} · <span style={{fontWeight:400,color:"#94a3b8"}}>{fmtDT(u.timestamp)}</span></div>
                    {u.type!=="system"&&u.text&&<div style={{fontSize:12,color:"#374151",marginTop:2,fontStyle:"italic"}}>"{u.text}"</div>}
                  </div>
                </div>
                {/* Files */}
                <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:6}}>
                  {u.attachments.map(f=>{
                    const isImg=f.type&&f.type.startsWith("image/");
                    return<div key={f.id}>
                      {isImg
                        ?<div>
                          <img src={f.data} alt={f.name}
                            onClick={()=>setInfoLightbox({src:f.data,name:f.name})}
                            style={{width:"100%",borderRadius:6,border:"1px solid #e2e8f0",display:"block",objectFit:"contain",cursor:"zoom-in"}}/>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:3}}>
                            <span style={{fontSize:10,color:"#64748b"}}>🔍 Tap to enlarge · {f.name}</span>
                            <a href={f.data} download={f.name} style={{fontSize:10,color:"#1e40af",fontWeight:700,textDecoration:"none"}}>⬇ Save</a>
                          </div>
                        </div>
                        :<a href={f.data} download={f.name} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#fff",border:"1px solid #e2e8f0",borderRadius:6,textDecoration:"none"}}>
                          <span style={{fontSize:18}}>{FILE_ICON(f.type)}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:600,color:"#1e40af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                            <div style={{fontSize:10,color:"#94a3b8"}}>{fmtBytes(f.size)}</div>
                          </div>
                          <span style={{fontSize:11,color:"#1e40af",fontWeight:700,flexShrink:0}}>⬇ Save</span>
                        </a>}
                    </div>;
                  })}
                </div>
              </div>;
            })}
          </div>
          <div style={{marginTop:8,fontSize:10,color:"#94a3b8",textAlign:"center"}}>To add files, go to the Updates tab and attach with a description.</div>
        </div>;
      })()}
      {linked.length>0&&<div style={{marginTop:12}}>
        <div style={{fontSize:11,color:"#94a3b8",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>
          Depends On <span style={{fontSize:9,color:"#94a3b8",fontWeight:400,textTransform:"none"}}>(tap to open)</span>
        </div>
        {linked.map(lt=>{
          const isBlocked=lt.status!=="Completed"&&lt.status!=="On Hold";
          return<div key={lt.id}
            onClick={()=>{onClose();setTimeout(()=>onOpenLinked(lt.id),80);}}
            style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:isBlocked?"#fff7ed":"#f0fdf4",borderRadius:8,marginBottom:6,border:`1.5px solid ${isBlocked?"#fed7aa":"#bbf7d0"}`,cursor:"pointer",transition:"box-shadow 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.1)";e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:STATUS_META[lt.status]?.dot||"#94a3b8",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:"#0f2557",fontWeight:800}}>{lt.ref}</span>
                <Badge text={lt.status} color={STATUS_META[lt.status]?.color} bg={STATUS_META[lt.status]?.bg} small/>
              </div>
              <div style={{fontSize:11,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{lt.task}</div>
            </div>
            {isBlocked&&<div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
              <span style={{fontSize:9,color:"#f97316",fontWeight:700,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:4,padding:"1px 5px"}}>⚠ Blocking</span>
              <span style={{fontSize:9,color:"#94a3b8"}}>tap to nudge →</span>
            </div>}
            {!isBlocked&&<span style={{fontSize:11,color:"#166534",flexShrink:0}}>✅</span>}
          </div>;
        })}
      </div>}
      {dependants.length>0&&<div style={{marginTop:10}}>
        <div style={{fontSize:11,color:"#94a3b8",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>
          Blocking <span style={{fontSize:9,color:"#94a3b8",fontWeight:400,textTransform:"none"}}>(tap to open)</span>
        </div>
        {dependants.map(dt=>{
          const isBlocked=dt.status!=="Completed"&&dt.status!=="On Hold";
          return<div key={dt.id}
            onClick={()=>{onClose();setTimeout(()=>onOpenLinked(dt.id),80);}}
            style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:isBlocked?"#fff5f5":"#f0fdf4",borderRadius:8,marginBottom:6,border:`1.5px solid ${isBlocked?"#fecaca":"#bbf7d0"}`,cursor:"pointer",transition:"box-shadow 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.1)";e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:STATUS_META[dt.status]?.dot||"#94a3b8",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:"#0f2557",fontWeight:800}}>{dt.ref}</span>
                <Badge text={dt.status} color={STATUS_META[dt.status]?.color} bg={STATUS_META[dt.status]?.bg} small/>
              </div>
              <div style={{fontSize:11,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{dt.task}</div>
            </div>
            {isBlocked&&<div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
              <span style={{fontSize:9,color:"#dc2626",fontWeight:700,background:"#fff5f5",border:"1px solid #fecaca",borderRadius:4,padding:"1px 5px"}}>🔴 Not Done</span>
              <span style={{fontSize:9,color:"#94a3b8"}}>tap to check →</span>
            </div>}
            {!isBlocked&&<span style={{fontSize:11,color:"#166534",flexShrink:0}}>✅</span>}
          </div>;
        })}
      </div>}
      <DeleteSection task={task} currentUser={currentUser} isAdmin={isAdmin} deleteRequests={deleteRequests} onDeleteAdmin={onDeleteAdmin} onRequestDelete={onRequestDelete}/>
    </div>}
    {tab==="updates"&&<UpdatesTab task={task} updates={updates} members={members} currentUser={currentUser} isAdmin={isAdmin} isAssignor={isAssignor} isAssignee={isAssignee} onAddUpdate={onAddUpdate} onApproveUpdate={onApproveUpdate} onRejectUpdate={onRejectUpdate} onDeleteUpdate={onDeleteUpdate}/>}
    {tab==="messages"&&<MessagesTab task={task} messages={messages} members={members} currentUser={currentUser} onSendMessage={onSendMessage}/>}

  </div>;
}

/* ── KPI VIEW ── */
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
      <h2 style={{fontSize:17,fontWeight:800,color:"#0f2557",margin:0}}>📊 KPI Analysis</h2>
      <div style={{display:"flex",background:"#f1f5f9",borderRadius:8,padding:3,gap:2}}>
        {[["project","By Project"],["assignee","By Assignee"]].map(([v,l])=><button key={v} onClick={()=>setKpiBy(v)} style={{padding:"6px 14px",borderRadius:6,border:"none",background:kpiBy===v?"#0f2557":"transparent",color:kpiBy===v?"#fff":"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>)}
      </div>
    </div>
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
            <div><div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{member.name}</div><div style={{fontSize:13}}>{mood.emoji} {mood.label}</div></div>
          </div>;
        })}
      </div>
    </div>}
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
            {s.overdue>0&&<Badge text={`⚠ ${s.overdue} overdue`} color="#991b1b" bg="#fee2e2" small/>}
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

/* ── TASK TYPES ADMIN ── */
function TaskTypesAdmin({taskTypes=[],onSave}){
  const [editItem,setEditItem]=useState(null);
  const [newName,setNewName]=useState("");
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"8px 12px",fontSize:13,color:"#1e293b",background:"#f8fafc",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};

  // Always sort A-Z — no manual reorder
  const sorted=[...taskTypes].sort((a,b)=>a.name.localeCompare(b.name));

  const addType=()=>{
    if(!newName.trim()){alert("Please enter a type name.");return;}
    if(taskTypes.find(t=>t.name.toLowerCase()===newName.trim().toLowerCase())){alert("This type already exists.");return;}
    // Add and auto-sort A-Z
    const updated=[...taskTypes,{id:uid(),name:newName.trim(),active:true}]
      .sort((a,b)=>a.name.localeCompare(b.name));
    onSave(updated);
    setNewName("");
  };

  const toggleActive=(id)=>{
    onSave(taskTypes.map(t=>t.id===id?{...t,active:!t.active}:t));
  };

  const saveEdit=(id,name)=>{
    if(!name.trim()){alert("Name cannot be empty.");return;}
    if(taskTypes.find(t=>t.id!==id&&t.name.toLowerCase()===name.trim().toLowerCase())){alert("This type already exists.");return;}
    // Edit and re-sort A-Z
    const updated=taskTypes.map(t=>t.id===id?{...t,name:name.trim()}:t)
      .sort((a,b)=>a.name.localeCompare(b.name));
    onSave(updated);
    setEditItem(null);
  };

  return<div>
    <div style={{marginBottom:14}}>
      <div style={{fontSize:13,color:"#64748b"}}>Admin-controlled task type categories.</div>
      <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
        Always sorted A–Z automatically. Add or rename — list reorders itself. 😊
      </div>
    </div>

    {/* Add new */}
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <input style={{...inp,flex:1}} value={newName} onChange={e=>setNewName(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&addType()}
        placeholder="New type name e.g. Inspection, Handover…"/>
      <button onClick={addType} style={{padding:"8px 18px",borderRadius:7,border:"none",background:"#0f2557",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>+ Add</button>
    </div>

    {/* List — auto A-Z, no reorder buttons */}
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {sorted.map((t,idx)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#fff",borderRadius:7,border:`1.5px solid ${t.active?"#e2e8f0":"#f1f5f9"}`,opacity:t.active?1:0.55}}>
        {/* A-Z index badge */}
        <span style={{fontSize:10,color:"#94a3b8",fontWeight:700,minWidth:18,textAlign:"center"}}>{idx+1}</span>
        {/* Name / edit inline */}
        {editItem===t.id
          ?<input autoFocus defaultValue={t.name}
              onBlur={e=>saveEdit(t.id,e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")saveEdit(t.id,e.target.value);if(e.key==="Escape")setEditItem(null);}}
              style={{...inp,flex:1,padding:"5px 8px",fontSize:12}}/>
          :<div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:13,fontWeight:600,color:t.active?"#1e293b":"#94a3b8"}}>{t.name}</span>
            {!t.active&&<Badge text="Inactive" color="#94a3b8" bg="#f1f5f9" small/>}
          </div>
        }
        {/* Actions */}
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          {editItem!==t.id&&<button onClick={()=>setEditItem(t.id)}
            style={{padding:"3px 9px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,cursor:"pointer"}}>
            ✏️ Rename
          </button>}
          <button onClick={()=>toggleActive(t.id)}
            style={{padding:"3px 9px",borderRadius:5,border:`1.5px solid ${t.active?"#fecaca":"#bbf7d0"}`,background:"#fff",color:t.active?"#dc2626":"#166534",fontSize:11,cursor:"pointer"}}>
            {t.active?"Disable":"Enable"}
          </button>
        </div>
      </div>)}
    </div>
    <div style={{marginTop:10,fontSize:10,color:"#94a3b8",textAlign:"center"}}>
      {sorted.filter(t=>t.active).length} active types · Click ✏️ Rename to edit · Disabled types hidden from forms
    </div>
  </div>;
}

/* ── TASK TYPES MANAGER ── */
function TaskTypesManager({taskTypes,tasks,onSave,onDelete}){
  const [editItem,setEditItem]=useState(null);
  const [newName,setNewName]=useState("");
  const [saving,setSaving]=useState(false);
  const sorted=[...(taskTypes||[])].sort((a,b)=>a.name.localeCompare(b.name));
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"8px 12px",fontSize:13,color:"#1e293b",background:"#f8fafc",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};

  const handleAdd=async()=>{
    if(!newName.trim()){alert("Please enter a type name.");return;}
    const exists=(taskTypes||[]).find(tt=>tt.name.toLowerCase()===newName.trim().toLowerCase());
    if(exists){alert("This type already exists.");return;}
    setSaving(true);
    await onSave({id:"tt_"+Date.now(),name:newName.trim(),active:true});
    setNewName("");setSaving(false);
  };

  const handleEdit=async(tt)=>{
    if(!editItem?.name?.trim()){alert("Name cannot be empty.");return;}
    setSaving(true);
    await onSave({...tt,name:editItem.name.trim()});
    setEditItem(null);setSaving(false);
  };

  const handleDelete=async(tt)=>{
    const linked=tasks.filter(t=>t.taskTypeId===tt.id&&t.status!=="Completed"&&t.status!=="On Hold"&&!t.deleted);
    if(linked.length>0){
      alert(`Cannot delete "${tt.name}" — ${linked.length} incomplete task(s) linked. Reassign them first.`);
      return;
    }
    if(!window.confirm(`Delete task type "${tt.name}"? This cannot be undone.`))return;
    await onDelete(tt.id);
  };

  return<div>
    <div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:13,color:"#64748b"}}>Manage task types. Always sorted A–Z. Cannot delete if tasks are linked.</span>
    </div>
    {/* Add new */}
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <input style={{...inp,flex:1}} value={newName} onChange={e=>setNewName(e.target.value)}
        placeholder="New type name (e.g. Tender)" onKeyDown={e=>e.key==="Enter"&&handleAdd()}/>
      <button onClick={handleAdd} disabled={saving||!newName.trim()} style={{padding:"8px 18px",borderRadius:7,border:"none",background:"#0f2557",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
        + Add Type
      </button>
    </div>
    {/* List */}
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {sorted.map(tt=>{
        const linkedCount=tasks.filter(t=>t.taskTypeId===tt.id&&!t.deleted).length;
        const incompleteCount=tasks.filter(t=>t.taskTypeId===tt.id&&t.status!=="Completed"&&t.status!=="On Hold"&&!t.deleted).length;
        const isEditing=editItem?.id===tt.id;
        return<div key={tt.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#fff",borderRadius:8,border:"1.5px solid #e2e8f0"}}>
          {isEditing
            ?<input style={{...inp,flex:1}} value={editItem.name} onChange={e=>setEditItem(x=>({...x,name:e.target.value}))}
               onKeyDown={e=>e.key==="Enter"&&handleEdit(tt)} autoFocus/>
            :<div style={{flex:1}}>
              <span style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{tt.name}</span>
              <span style={{fontSize:10,color:"#94a3b8",marginLeft:10}}>
                {linkedCount>0?`${linkedCount} task${linkedCount!==1?"s":""} linked`:"No tasks linked"}
                {incompleteCount>0&&<span style={{color:"#f97316",marginLeft:6}}>· {incompleteCount} incomplete</span>}
              </span>
            </div>}
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {isEditing
              ?<><button onClick={()=>handleEdit(tt)} disabled={saving} style={{padding:"4px 12px",borderRadius:5,border:"none",background:"#0f2557",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Save</button>
                <button onClick={()=>setEditItem(null)} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,cursor:"pointer"}}>Cancel</button></>
              :<><button onClick={()=>setEditItem({...tt})} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,cursor:"pointer"}}>Edit</button>
                <button onClick={()=>handleDelete(tt)} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #fecaca",background:"#fff",color:"#dc2626",fontSize:11,cursor:"pointer"}}
                  title={incompleteCount>0?"Cannot delete — incomplete tasks linked":""}>
                  {incompleteCount>0?"🔒":"🗑"}
                </button></>}
          </div>
        </div>;
      })}
      {sorted.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:13}}>No task types yet. Add one above.</div>}
    </div>
  </div>;
}

/* ── COMPANIES MANAGER ── */
function CompaniesManager({companies=[],tasks=[],onSave,onDelete}){
  const [editItem,setEditItem]=useState(null);
  const [newCode,setNewCode]=useState("");
  const [newName,setNewName]=useState("");
  const [saving,setSaving]=useState(false);
  const sorted=[...companies].sort((a,b)=>a.name.localeCompare(b.name));
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"8px 12px",fontSize:13,color:"#1e293b",background:"#f8fafc",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};

  const handleAdd=async()=>{
    if(!newCode.trim()||!newName.trim()){alert("Please enter both code and company name.");return;}
    if(companies.find(c=>c.code.toUpperCase()===newCode.trim().toUpperCase())){alert("This code already exists.");return;}
    if(companies.find(c=>c.name.toLowerCase()===newName.trim().toLowerCase())){alert("This company already exists.");return;}
    setSaving(true);
    await onSave({id:"co_"+Date.now(),code:newCode.trim().toUpperCase(),name:newName.trim(),active:true});
    setNewCode("");setNewName("");setSaving(false);
  };

  const handleSaveEdit=async()=>{
    if(!editItem?.code?.trim()||!editItem?.name?.trim()){alert("Code and name required.");return;}
    setSaving(true);
    await onSave(editItem);
    setEditItem(null);setSaving(false);
  };

  const handleDelete=async(co)=>{
    const linked=tasks.filter(t=>t.companyId===co.id&&t.status!=="Completed"&&!t.deleted);
    if(linked.length>0){
      alert(`Cannot delete "${co.name}" — ${linked.length} active task(s) linked. Reassign first.`);return;
    }
    if(!window.confirm(`Delete "${co.name}"? Cannot be undone.`))return;
    await onDelete(co.id);
  };

  return<div>
    <div style={{marginBottom:14}}>
      <div style={{fontSize:13,color:"#64748b"}}>Manage related companies. Each task can be linked to a company.</div>
      <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Short code shows in task list · Full name in task detail · Cannot delete if active tasks linked</div>
    </div>
    {/* Add new */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      <input style={{...inp,width:80,flex:"0 0 80px"}} value={newCode} onChange={e=>setNewCode(e.target.value.toUpperCase().slice(0,6))} placeholder="Code" maxLength={6}/>
      <input style={{...inp,flex:1,minWidth:200}} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Full company name e.g. TKJ Project Management Sdn Bhd" onKeyDown={e=>e.key==="Enter"&&handleAdd()}/>
      <button onClick={handleAdd} disabled={saving||!newCode.trim()||!newName.trim()} style={{padding:"8px 18px",borderRadius:7,border:"none",background:"#0f2557",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>+ Add</button>
    </div>
    {/* List */}
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {sorted.map(co=>{
        const linkedCount=tasks.filter(t=>t.companyId===co.id&&!t.deleted).length;
        const incompleteCount=tasks.filter(t=>t.companyId===co.id&&t.status!=="Completed"&&!t.deleted).length;
        const isEditing=editItem?.id===co.id;
        return<div key={co.id} style={{padding:"10px 14px",background:"#fff",borderRadius:8,border:"1.5px solid #e2e8f0",opacity:co.active?1:0.6}}>
          {isEditing
            ?<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <input style={{...inp,width:80,flex:"0 0 80px"}} value={editItem.code} onChange={e=>setEditItem(x=>({...x,code:e.target.value.toUpperCase().slice(0,6)}))} placeholder="Code"/>
              <input style={{...inp,flex:1,minWidth:180}} value={editItem.name} onChange={e=>setEditItem(x=>({...x,name:e.target.value}))} placeholder="Full name" onKeyDown={e=>e.key==="Enter"&&handleSaveEdit()}/>
              <button onClick={handleSaveEdit} disabled={saving} style={{padding:"6px 14px",borderRadius:6,border:"none",background:"#0f2557",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Save</button>
              <button onClick={()=>setEditItem(null)} style={{padding:"6px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Cancel</button>
            </div>
            :<div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{background:"#0f2557",color:"#c9a227",borderRadius:5,padding:"3px 8px",fontSize:11,fontWeight:800,flexShrink:0}}>{co.code}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{co.name}</div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>
                  {linkedCount>0?`${linkedCount} task${linkedCount!==1?"s":""} linked`:"No tasks linked"}
                  {incompleteCount>0&&<span style={{color:"#f97316",marginLeft:6}}>· {incompleteCount} active</span>}
                </div>
              </div>
              {!co.active&&<Badge text="Inactive" color="#94a3b8" bg="#f1f5f9" small/>}
              <div style={{display:"flex",gap:5,flexShrink:0}}>
                <button onClick={()=>setEditItem({...co})} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:11,cursor:"pointer"}}>✏️ Edit</button>
                <button onClick={()=>onSave({...co,active:!co.active})} style={{padding:"4px 10px",borderRadius:5,border:`1.5px solid ${co.active?"#fecaca":"#bbf7d0"}`,background:"#fff",color:co.active?"#dc2626":"#166534",fontSize:11,cursor:"pointer"}}>{co.active?"Disable":"Enable"}</button>
                <button onClick={()=>handleDelete(co)} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #fecaca",background:"#fff",color:"#dc2626",fontSize:11,cursor:"pointer"}}>{incompleteCount>0?"🔒":"🗑"}</button>
              </div>
            </div>}
        </div>;
      })}
      {sorted.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:13}}>No companies yet. Add one above.</div>}
    </div>
    <div style={{marginTop:10,fontSize:10,color:"#94a3b8",textAlign:"center"}}>
      {sorted.filter(c=>c.active).length} active companies
    </div>
  </div>;
}

/* ── ADMIN VIEW ── */
function AdminView({members,projects,tasks,updates=[],deleteRequests,currentUser,taskTypes,companies,onUpdateMembers,onUpdateProjects,onReviewDeleteRequest,onSetPassword,onSaveTaskTypes,onSaveTaskType,onDeleteTaskType,onSaveCompany,onDeleteCompany}){
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
    <h2 style={{fontSize:17,fontWeight:800,color:"#0f2557",margin:"0 0 18px"}}>⚙️ Admin Settings</h2>
    <div style={{display:"flex",gap:0,borderBottom:"2px solid #f1f5f9",marginBottom:18}}>
      {[["projects","📁 Projects"],["members","👥 Members"],["tasktypes","🏷️ Task Types"],["companies","🏢 Companies"],["delreqs","🗑 Delete Requests"],["audit","📋 Audit Trail"]].map(([id,l])=><button key={id} onClick={()=>setTab(id)} style={{padding:"8px 18px",border:"none",borderBottom:tab===id?"2px solid #0f2557":"2px solid transparent",marginBottom:-2,background:"none",color:tab===id?"#0f2557":"#94a3b8",fontSize:13,fontWeight:tab===id?800:500,cursor:"pointer"}}>{l}</button>)}
    </div>
    {tab==="tasktypes"&&<div>
      <TaskTypesAdmin taskTypes={taskTypes} onSave={onSaveTaskTypes}/>
    </div>}
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
        {onSetPassword&&<button onClick={()=>onSetPassword(m)} style={{padding:"4px 10px",borderRadius:5,border:"1.5px solid #8b5cf6",background:"#fff",color:"#8b5cf6",fontSize:11,cursor:"pointer"}}>🔑 Password</button>}
      </div>)}
    </div>}
    {tab==="delreqs"&&<div>
      {pendingReqs.length>0&&<div style={{background:"#fef3c7",borderRadius:8,padding:"10px 14px",marginBottom:14,border:"1.5px solid #fbbf24"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#92400e",marginBottom:2}}>⏳ {pendingReqs.length} Pending Delete Request{pendingReqs.length>1?"s":""} – Action Required</div>
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
            <Badge text={r.status==="pending"?"⏳ Pending":r.status==="approved"?"✅ Approved":"❌ Rejected"} color={r.status==="pending"?"#92400e":r.status==="approved"?"#991b1b":"#166534"} bg={r.status==="pending"?"#fef3c7":r.status==="approved"?"#fee2e2":"#dcfce7"} small/>
          </div>
          <div style={{fontSize:12,color:"#475569",marginBottom:4}}><span style={{fontWeight:700}}>Requested by:</span> {requester?.name||"–"} · {fmtDT(r.timestamp)}</div>
          <div style={{fontSize:12,color:"#475569",marginBottom:6,background:"#f8fafc",padding:"6px 10px",borderRadius:5}}><span style={{fontWeight:700}}>Reason:</span> "{r.reason}"</div>
          {reviewer&&<div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Reviewed by {reviewer.name} on {fmtDT(r.reviewedAt)}{r.reviewNote?` – "${r.reviewNote}"`:""}</div>}
          {r.status==="pending"&&<div>
            {reviewModal===r.id&&<div style={{marginBottom:8}}>
              <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Add a note (optional)..." style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:6,padding:"7px 10px",fontSize:12,fontFamily:"inherit",resize:"vertical",minHeight:56,outline:"none",boxSizing:"border-box"}}/>
            </div>}
            <div style={{display:"flex",gap:8}}>
              {reviewModal!==r.id&&<button onClick={()=>{setReviewModal(r.id);setReviewNote("");}} style={{padding:"6px 14px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Review</button>}
              {reviewModal===r.id&&<>
                <button onClick={()=>{onReviewDeleteRequest(r.id,true,reviewNote);setReviewModal(null);}} style={{padding:"6px 16px",borderRadius:6,border:"none",background:"#dc2626",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>✅ Approve & Delete</button>
                <button onClick={()=>{onReviewDeleteRequest(r.id,false,reviewNote);setReviewModal(null);}} style={{padding:"6px 16px",borderRadius:6,border:"none",background:"#166534",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>❌ Reject Request</button>
                <button onClick={()=>setReviewModal(null)} style={{padding:"6px 12px",borderRadius:6,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:12,cursor:"pointer"}}>Cancel</button>
              </>}
            </div>
          </div>}
        </div>;
      })}
    </div>}
    {tab==="tasktypes"&&<div>
      <TaskTypesManager taskTypes={taskTypes} tasks={tasks} onSave={onSaveTaskType||onSaveTaskTypes} onDelete={onDeleteTaskType}/>
    </div>}
    {tab==="companies"&&<div>
      <CompaniesManager companies={companies} tasks={tasks} onSave={onSaveCompany} onDelete={onDeleteCompany}/>
    </div>}
    {tab==="audit"&&<div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Complete system audit trail – all creates, updates, deletions and delete request decisions. Read-only.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
        {[{label:"Total Events",n:updates.length,color:"#0f2557"},{label:"System Events",n:updates.filter(u=>u.type==="system").length,color:"#166534"},{label:"User Updates",n:updates.filter(u=>u.type==="comment").length,color:"#1e40af"},{label:"Deletion Events",n:updates.filter(u=>u.text&&u.text.includes("delete")).length,color:"#dc2626"},{label:"Briefing Acks",n:updates.filter(u=>u.type==="briefing_audit").length,color:"#7c3aed"}].map(s=><div key={s.label} style={{background:"#fff",borderRadius:8,padding:"12px 14px",border:`2px solid ${s.color}20`,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
          <div style={{fontSize:24,fontWeight:900,color:s.color}}>{s.n}</div>
          <div style={{fontSize:10,color:"#64748b",marginTop:3,fontWeight:600}}>{s.label}</div>
        </div>)}
      </div>
      <div style={{maxHeight:480,overflowY:"auto",display:"flex",flexDirection:"column",gap:7}}>
        {[...updates].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(u=>{
          const author=members.find(m=>m.id===u.authorId)||{name:"System"};
          const task=tasks.find(t=>t.id===u.taskId);
          const isDeletion=u.text&&(u.text.toLowerCase().includes("delete")||u.text.toLowerCase().includes("deleted"));
          const isRejection=u.text&&u.text.includes("REJECTED");
          const isBriefing=u.type==="briefing_audit";
          const bgColor=isBriefing?"#f5f3ff":isDeletion?"#fff5f5":isRejection?"#f0fdf4":u.type==="system"?"#f0fdf4":"#f8fafc";
          const borderColor=isBriefing?"#c4b5fd":isDeletion?"#fecaca":isRejection?"#bbf7d0":u.type==="system"?"#bbf7d0":"#e2e8f0";
          return<div key={u.id} style={{padding:"10px 14px",background:bgColor,borderRadius:8,border:`1px solid ${borderColor}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
              <Avatar name={author.name} size={24} color={u.type==="system"?"#166534":"#0f2557"}/>
              <span style={{fontSize:12,fontWeight:700,color:"#0f2557"}}>{author.name}</span>
              {u.type==="system"&&<Badge text="SYSTEM" color="#166534" bg="#dcfce7" small/>}
              {isDeletion&&<Badge text="DELETION" color="#991b1b" bg="#fee2e2" small/>}
              {isRejection&&<Badge text="REJECT" color="#166534" bg="#dcfce7" small/>}
              {isBriefing&&<Badge text="📋 BRIEFING" color="#7c3aed" bg="#ede9fe" small/>}
              <span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{fmtDT(u.timestamp)}</span>
            </div>
            {task&&<div style={{fontSize:10,color:"#64748b",marginBottom:4,paddingLeft:32}}>Task: <span style={{fontWeight:700,color:"#0f2557"}}>{task.ref}</span> – {task.task}</div>}
            <div style={{fontSize:12,color:"#374151",lineHeight:1.5,paddingLeft:32,whiteSpace:"pre-wrap"}}>{u.text}</div>
          </div>;
        })}
        {updates.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8",fontSize:13}}>No audit events yet.</div>}
      </div>
    </div>}
  </div>;
}

/* ── TASK FORM ── */
function TaskForm({initial,tasks,members,projects,taskTypes=[],currentUser,onSave,onCancel}){
  const DRAFT_KEY=`tkj_form_draft_${currentUser.id}`;
  const blank={id:uid(),projectId:"",task:"",taskType:"",preparedDate:today(),dueDate:"",dueTime:"18:00",completedDate:"",status:"Not Started",priority:"Medium",assignorId:currentUser.id,assigneeId:"",cc:[],remarks:"",linkedTo:[],attachments:[],isPersonal:false,personalOwnerId:null,createdAt:nowISO(),createdBy:currentUser.id};
  const [f,setF]=useState(()=>{
    if(initial)return{...blank,...initial,cc:initial?.cc||[],linkedTo:initial?.linkedTo||[],attachments:initial?.attachments||[]};
    try{const saved=localStorage.getItem(DRAFT_KEY);if(saved){const d=JSON.parse(saved);if(d&&d._autoSaved)return{...blank,...d};}}catch{}
    return blank;
  });
  const [isPersonal,setIsPersonal]=useState(initial?.isPersonal||false);
  const [hasDraftRecovery,setHasDraftRecovery]=useState(()=>{try{const s=localStorage.getItem(DRAFT_KEY);return!!s&&!initial;}catch{return false;}});
  const upd=(k,v)=>{
    setF(p=>{
      const next={...p,[k]:v};
      if(!initial)try{localStorage.setItem(DRAFT_KEY,JSON.stringify({...next,attachments:[],_autoSaved:true}));}catch{}
      return next;
    });
  };
  const clearDraft=()=>{try{localStorage.removeItem(DRAFT_KEY);}catch{}setHasDraftRecovery(false);};
  const discardDraft=()=>{setF(blank);clearDraft();};
  const activeProjects=projects.filter(p=>p.active);
  const activeTaskTypes=(taskTypes||[]).filter(tt=>tt.active).sort((a,b)=>a.name.localeCompare(b.name));
  const activeCompanies=(companies||[]).filter(c=>c.active).sort((a,b)=>a.name.localeCompare(b.name));
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
    clearDraft();onSave(finalTask);
  };
  return<div style={{padding:30}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
      <div>
        <h2 style={{margin:0,fontSize:18,color:"#0f2557",fontWeight:800}}>{initial?"Edit Task":"New Task"}</h2>
        <p style={{margin:"3px 0 0",fontSize:11,color:"#94a3b8"}}>TKJ Task Monitoring · {currentUser.name}</p>
      </div>
      {hasDraftRecovery&&!initial&&<div style={{position:"absolute",top:0,left:0,right:0,background:"#fef3c7",padding:"8px 16px",borderRadius:"12px 12px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12}}>
        <span style={{color:"#92400e",fontWeight:700}}>📋 Unsaved draft recovered – continue where you left off?</span>
        <div style={{display:"flex",gap:8}}>
          <button onClick={discardDraft} style={{padding:"3px 10px",borderRadius:4,border:"1px solid #fbbf24",background:"#fff",color:"#92400e",fontSize:11,cursor:"pointer"}}>Discard</button>
          <button onClick={clearDraft} style={{padding:"3px 10px",borderRadius:4,border:"none",background:"#92400e",color:"#fff",fontSize:11,cursor:"pointer"}}>Keep</button>
        </div>
      </div>}
      <button onClick={onCancel} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8"}}>✕</button>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:18,padding:"10px 14px",background:"#f8fafc",borderRadius:8,border:"1.5px solid #e2e8f0"}}>
      <button onClick={()=>setIsPersonal(false)} style={{padding:"6px 16px",borderRadius:6,border:"none",background:!isPersonal?"#0f2557":"transparent",color:!isPersonal?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer"}}>📁 Project Task</button>
      <button onClick={()=>setIsPersonal(true)} style={{padding:"6px 16px",borderRadius:6,border:"none",background:isPersonal?"#8b5cf6":"transparent",color:isPersonal?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer"}}>👤 Personal Task</button>
      {isPersonal&&<span style={{fontSize:11,color:"#8b5cf6",fontWeight:600,alignSelf:"center"}}>Only visible to you</span>}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:15}}>
      {!isPersonal&&<Sel label="Project" value={f.projectId} onChange={v=>upd("projectId",v)} options={[<option key="" value="">– Select Project –</option>,...activeProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)]}/>}
      <div><label style={lbl}>Task / Document Description</label><input style={inp} value={f.task} onChange={e=>upd("task",e.target.value)} placeholder="e.g. BOQ Preparation – Civil Works"/></div>
      <Sel label="Task Type" value={f.taskTypeId||""} onChange={v=>upd("taskTypeId",v||null)}
        options={[<option key="" value="">– Select Type –</option>,...(activeTaskTypes||[]).map(tt=><option key={tt.id} value={tt.id}>{tt.name}</option>)]}/>
      <Sel label="Company Related To" value={f.companyId||""} onChange={v=>upd("companyId",v||null)}
        options={[<option key="" value="">– Select Company –</option>,...(activeCompanies||[]).map(co=><option key={co.id} value={co.id}>{co.code} — {co.name}</option>)]}/>
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
      <Sel label="Assignee" value={f.assigneeId} onChange={v=>upd("assigneeId",v)} options={[<option key="" value="">– Select Assignee –</option>,...members.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.name}{m.role==="admin"?" (Admin)":""}</option>)]}/>
      {!isPersonal&&<MemberPicker label="CC (Copy To)" selected={f.cc} onChange={v=>upd("cc",v)} members={members} excludeIds={[f.assigneeId].filter(Boolean)}/>}
      <div><label style={lbl}>Remarks / Notes</label><textarea style={{...inp,resize:"vertical",minHeight:56}} value={f.remarks} onChange={e=>upd("remarks",e.target.value)}/></div>
      <div><label style={lbl}>Attachments</label><AttachmentPanel attachments={f.attachments} onChange={v=>upd("attachments",v)}/></div>
      {tasks.filter(t=>t.id!==f.id&&!t.isPersonal).length>0&&<div>
        <label style={lbl}>Linked Tasks</label>
        <div style={{border:"1.5px solid #e2e8f0",borderRadius:7,padding:10,display:"flex",flexWrap:"wrap",gap:6,background:"#f8fafc"}}>
          {tasks.filter(t=>t.id!==f.id&&!t.isPersonal).map(t=>{const on=f.linkedTo.includes(t.id);return<button key={t.id} onClick={()=>upd("linkedTo",on?f.linkedTo.filter(x=>x!==t.id):[...f.linkedTo,t.id])}
            style={{padding:"4px 9px",borderRadius:5,border:`1.5px solid ${on?"#0f2557":"#e2e8f0"}`,background:on?"#0f2557":"#fff",color:on?"#fff":"#475569",fontSize:11,cursor:"pointer",fontWeight:on?700:400}}>
            {t.ref} – {t.task.slice(0,18)}{t.task.length>18?"…":""}
          </button>;})}
        </div>
      </div>}
    </div>
    <div style={{display:"flex",gap:12,marginTop:22,justifyContent:"flex-end"}}>
      <button onClick={onCancel} style={{padding:"10px 22px",borderRadius:7,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
      {!initial&&<button onClick={()=>handleSave(true)} style={{padding:"10px 22px",borderRadius:7,border:"1.5px solid #8b5cf6",background:"#fff",color:"#8b5cf6",fontSize:13,fontWeight:700,cursor:"pointer"}}>
        💾 Save Draft
      </button>}
      <button onClick={()=>handleSave(false)} style={{padding:"10px 26px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#0f2557,#1e40af)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 14px rgba(15,37,87,0.3)"}}>
        {initial?"Update Task":"Add Task"}
      </button>
    </div>
  </div>;
}

/* ── NOTIFICATION PANEL ── */
function NotifPanel({notifs,members,tasks,projects,onClose,onOpenTask}){
  const getMember=(id)=>members.find(m=>m.id===id)||{name:"?"};
  const getTask=(id)=>tasks.find(t=>t.id===id);
  return<div style={{position:"absolute",top:"100%",right:0,width:340,background:"#fff",borderRadius:10,boxShadow:"0 8px 32px rgba(10,20,60,0.18)",border:"1.5px solid #e2e8f0",zIndex:500,overflow:"hidden",marginTop:4}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #f1f5f9",background:"#0f2557"}}>
      <span style={{fontSize:13,fontWeight:800,color:"#fff"}}>🔔 Notifications</span>
      <button onClick={onClose} style={{background:"none",border:"none",color:"#7ba3d4",fontSize:16,cursor:"pointer"}}>✕</button>
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
                {n.urgent&&"🚨 "}<span style={{color:"#0f2557"}}>{author.name}</span>
                {n.type==="message"?" sent a message":" posted an update"}
              </div>
              {task&&<div style={{fontSize:11,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.task}</div>}
              {proj&&<div style={{fontSize:10,color:"#94a3b8"}}>{proj.name}</div>}
              <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{fmtDT(n.timestamp)}</div>
            </div>
            {n.urgent&&<span style={{fontSize:16}}>🚨</span>}
          </div>
        </div>;
      })}
    </div>
    {notifs.length>0&&<div style={{padding:"10px 16px",borderTop:"1px solid #f1f5f9",textAlign:"center"}}>
      <span style={{fontSize:11,color:"#94a3b8"}}>{notifs.length} notification{notifs.length>1?"s":""}</span>
    </div>}
  </div>;
}

/* ── RESPONSIVE TASK TABLE ── */
function ResponsiveTaskTable({filtered,enriched,messages,notifications,members,projects,taskTypes,getMember,getProject,STATUS_META,PRIORITY_META,fmtDate,DueChip,Badge,Avatar,clearFilters,activeFiltersCount,onOpenTask}){
  const [isMobile,setIsMobile]=useState(window.innerWidth<768);
  useEffect(()=>{
    const h=()=>setIsMobile(window.innerWidth<768);
    window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);
  },[]);

  if(isMobile){
    if(filtered.length===0)return<div style={{padding:"40px 0",textAlign:"center",color:"#94a3b8"}}>
      <div style={{fontSize:32,marginBottom:8}}>📋</div>
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
          style={{background:"#fff",borderRadius:10,padding:"12px 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",border:`1.5px solid ${hasNotif?"#fbbf24":"#e2e8f0"}`,cursor:"pointer",borderLeft:`4px solid ${sm.dot||"#94a3b8"}`}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
            <span style={{fontSize:11,fontWeight:800,color:"#c9a227"}}>{t.ref}</span>
            <Badge text={t.status} color={sm.color} bg={sm.bg} small/>
            <span style={{fontSize:10,fontWeight:700,color:pm.color,marginLeft:"auto"}}>{pm.label}</span>
            {urgentMsg>0&&<span style={{fontSize:11}}>🚨</span>}
          </div>
          <div style={{fontSize:13,fontWeight:700,color:"#0f2557",lineHeight:1.4,marginBottom:4,wordBreak:"break-word"}}>{t.task}</div>
          {hasLinks&&<div style={{fontSize:10,color:"#64748b",marginBottom:4,display:"flex",alignItems:"center",gap:3}}>
            <span>🔗</span><span style={{fontWeight:600}}>Has linked tasks</span>
          </div>}
          {proj&&<div style={{fontSize:11,color:"#64748b",marginBottom:4,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span>📁 {proj.name}</span>
            {t.taskTypeId&&(taskTypes||[]).length>0&&<span style={{fontSize:10,color:"#1e40af",background:"#eff6ff",borderRadius:4,padding:"1px 8px",fontWeight:600}}>{(taskTypes||[]).find(tt=>tt.id===t.taskTypeId)?.name||""}</span>}
            {false&&<span style={{fontSize:10,color:"#1e40af",background:"#dbeafe",borderRadius:4,padding:"1px 7px",fontWeight:600}}>{t.taskType}</span>}
          </div>}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            {assignor&&<div style={{display:"flex",alignItems:"center",gap:4}}>
              <Avatar name={assignor.name} size={18} color="#94a3b8"/>
              <span style={{fontSize:10,color:"#94a3b8"}}>{assignor.name}</span>
              <span style={{fontSize:10,color:"#cbd5e1"}}>→</span>
            </div>}
            {assignee&&<div style={{display:"flex",alignItems:"center",gap:4}}>
              <Avatar name={assignee.name} size={20} color="#0f2557"/>
              <span style={{fontSize:11,fontWeight:600,color:"#1e293b"}}>{assignee.name}</span>
            </div>}
          </div>
          <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:6,flexWrap:"wrap"}}>
            <div style={{display:"flex",flexDirection:"column"}}>
              <span style={{fontSize:9,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Due</span>
              <DueChip date={t.dueDate} time={t.dueTime}/>
            </div>
            {t.completedDate&&<div style={{display:"flex",flexDirection:"column"}}>
              <span style={{fontSize:9,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Completed</span>
              <span style={{fontSize:10,color:"#166534",fontWeight:600}}>✅ {fmtDate(t.completedDate)}</span>
            </div>}
          </div>
          {(msgCount>0||fileCount>0)&&<div style={{display:"flex",gap:8}}>
            {msgCount>0&&<span style={{fontSize:11,color:urgentMsg?"#dc2626":"#3b82f6",fontWeight:700}}>💬 {msgCount}</span>}
            {fileCount>0&&<span style={{fontSize:11,color:"#0ea5e9",fontWeight:700}}>📎 {fileCount}</span>}
          </div>}
        </div>;
      })}
    </div>;
  }

  const COL_NAMES=["Ref","Project","Type","Task / Doc","Assignor","Assignee","Due Date","Completed","Status","Priority","💬","📎"];
  const COL_MIN=[60,70,60,150,70,70,90,90,75,50,30,30];
  const COL_DEF=[90,110,80,220,90,90,110,110,82,55,34,34];
  const [widths,setWidths]=useState(()=>{try{const s=localStorage.getItem("tkj_col_widths_v2");return s?JSON.parse(s):COL_DEF;}catch{return COL_DEF;}});
  const resizing=useRef(null);
  const saveWidths=(w)=>{try{localStorage.setItem("tkj_col_widths_v2",JSON.stringify(w));}catch{}};
  const startResize=(e,idx)=>{
    e.preventDefault();e.stopPropagation();
    const startX=e.touches?e.touches[0].clientX:e.clientX;
    resizing.current={idx,startX,startW:widths[idx]};
    const onMove=(ev)=>{if(!resizing.current)return;const x=ev.touches?ev.touches[0].clientX:ev.clientX;setWidths(prev=>{const n=[...prev];n[resizing.current.idx]=Math.max(COL_MIN[resizing.current.idx],resizing.current.startW+(x-resizing.current.startX));return n;});};
    const onEnd=()=>{if(resizing.current){setWidths(prev=>{saveWidths(prev);return prev;});}resizing.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("touchmove",onMove);window.removeEventListener("mouseup",onEnd);window.removeEventListener("touchend",onEnd);};
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
          {COL_NAMES.map((h,i)=><div key={i} style={{position:"relative",display:"flex",alignItems:"center",overflow:"hidden"}}>
            <span style={{fontSize:9,fontWeight:800,color:"#7ba3d4",letterSpacing:"0.06em",textTransform:"uppercase",overflow:"hidden",whiteSpace:"nowrap",flex:1}}>{h}</span>
            {i<COL_NAMES.length-1&&<div onMouseDown={e=>startResize(e,i)} onTouchStart={e=>startResize(e,i)}
              style={{position:"absolute",right:-4,top:0,bottom:0,width:9,cursor:"col-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:2,height:"50%",background:"rgba(255,255,255,0.25)",borderRadius:1}}/>
            </div>}
          </div>)}
        </div>
        {filtered.length===0&&<div style={{padding:"48px 0",textAlign:"center",color:"#94a3b8"}}>
          <div style={{fontSize:32,marginBottom:8}}>📋</div><div style={{fontSize:13,fontWeight:600}}>No tasks found</div>
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
            {/* Ref */}
            <div style={{overflow:"hidden"}}><div style={{fontSize:10,fontWeight:700,color:"#c9a227",wordBreak:"break-all"}}>{t.ref}</div></div>
            {/* Project */}
            <div style={{overflow:"hidden"}}><div style={{fontSize:10,color:"#475569",wordBreak:"break-word",lineHeight:1.3}}>{t.isPersonal?"👤 Personal":proj?.name||"–"}</div></div>
            {/* Type */}
            <div style={{overflow:"hidden"}}>
              {t.taskTypeId&&(taskTypes||[]).length>0
                ?<span style={{fontSize:10,color:"#1e40af",background:"#eff6ff",borderRadius:4,padding:"2px 7px",fontWeight:700,whiteSpace:"nowrap",display:"inline-block"}}>{(taskTypes||[]).find(tt=>tt.id===t.taskTypeId)?.name||"–"}</span>
                :<span style={{color:"#d1d5db",fontSize:10}}>–</span>}
            </div>
            {/* Task / Doc */}
            <div style={{overflow:"hidden"}}>
              <div style={{fontSize:11,color:"#1e293b",fontWeight:600,wordBreak:"break-word",lineHeight:1.3}}>{t.task}</div>
              {hasLinks&&<span style={{fontSize:9,color:"#64748b",background:"#f1f5f9",borderRadius:3,padding:"0px 4px",marginTop:2,display:"inline-block"}}>🔗 linked</span>}
            </div>
            {/* Assignor */}
            <div style={{overflow:"hidden"}}>
              {getMember(t.assignorId)&&<div style={{display:"flex",alignItems:"center",gap:3}}><Avatar name={getMember(t.assignorId).name} size={16} color="#94a3b8"/><span style={{fontSize:10,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{getMember(t.assignorId).name}</span></div>}
            </div>
            {/* Assignee */}
            <div style={{overflow:"hidden"}}>{assignee&&<div style={{display:"flex",alignItems:"center",gap:3}}><Avatar name={assignee.name} size={16}/><span style={{fontSize:10,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{assignee.name}</span></div>}</div>
            <div style={{overflow:"hidden"}}><DueChip date={t.dueDate} time={t.dueTime}/></div>
            <div style={{overflow:"hidden"}}>{t.completedDate?<span style={{fontSize:10,color:"#166534",fontWeight:600,wordBreak:"break-word"}}>✅ {fmtDate(t.completedDate)}</span>:<span style={{color:"#d1d5db",fontSize:10}}>–</span>}</div>
            <div style={{overflow:"hidden"}}><Badge text={t.status} color={sm.color} bg={sm.bg} small/></div>
            <div><span style={{fontSize:10,fontWeight:700,color:pm.color}}>{pm.label}</span></div>
            <div style={{textAlign:"center"}}>{msgCount>0?<span style={{fontSize:11,fontWeight:700,color:urgentMsg?"#dc2626":"#3b82f6"}}>{urgentMsg?"🚨":""}{msgCount}</span>:<span style={{color:"#e2e8f0",fontSize:10}}>–</span>}</div>
            <div style={{textAlign:"center"}}>{fileCount>0?<span style={{fontSize:11,color:"#0ea5e9",fontWeight:700}}>📎{fileCount}</span>:<span style={{color:"#e2e8f0",fontSize:10}}>–</span>}</div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

/* ── CONFIG SCREEN ── */
function ConfigScreen({onConnected}){
  const [url,setUrl]=useState(LS.get("sb_url")||"");
  const [key,setKey]=useState(LS.get("sb_key")||"");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const connect=async()=>{
    if(!url.trim()||!key.trim()){setErr("Please enter both values.");return;}
    setLoading(true);setErr("");
    try{
      const {createClient}=await import('@supabase/supabase-js');
      const testDb=createClient(url.trim(),key.trim());
      const {error}=await testDb.from("members").select("id").limit(1);
      if(error)throw new Error(error.message);
      LS.set("sb_url",url.trim());LS.set("sb_key",key.trim());
      onConnected();
    }catch(e){setErr("Connection failed: "+e.message);}
    setLoading(false);
  };
  const inp={width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"11px 14px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#f8fafc",boxSizing:"border-box",color:"#1e293b"};
  return<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:"#fff",borderRadius:16,padding:36,width:"min(480px,95vw)",boxShadow:"0 32px 100px rgba(0,0,0,0.4)"}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <img src={TKJ_LOGO} alt="TKJ" style={{height:70,objectFit:"contain",marginBottom:14}}/>
        <h2 style={{margin:0,fontSize:20,color:"#0f2557",fontWeight:800}}>☁️ Cloud Database Setup</h2>
        <p style={{margin:"6px 0 0",fontSize:13,color:"#64748b"}}>Connect Supabase for real-time team sync</p>
      </div>
      <div style={{background:"#f0f9ff",borderRadius:8,padding:"12px 14px",marginBottom:20,border:"1px solid #bae6fd"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#0369a1",marginBottom:4}}>📋 Where to find these:</div>
        <div style={{fontSize:11,color:"#0369a1",lineHeight:1.8}}>
          1. Go to <strong>supabase.com</strong> → your project<br/>
          2. Click <strong>Project Settings</strong> (gear icon)<br/>
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
        {err&&<div style={{padding:"10px 14px",background:"#fee2e2",borderRadius:7,color:"#991b1b",fontSize:12,fontWeight:600}}>⚠️ {err}</div>}
        <button onClick={connect} disabled={loading} style={{padding:"12px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#0f2557,#1e40af)",color:"#fff",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",opacity:loading?0.7:1}}>
          {loading?"⏳ Connecting…":"🔌 Connect to Database"}
        </button>
      </div>
      <p style={{textAlign:"center",fontSize:10,color:"#cbd5e1",marginTop:20}}>TKJ Project Management Sdn Bhd (1676211-U)</p>
    </div>
  </div>;
}

/* ── PASSWORD MODAL ── */
function PasswordModal({member,onSuccess,onBack}){
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
  return<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
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
          {show?"🙈":"👁️"}
        </button>
      </div>
      {err&&<div style={{padding:"8px 12px",background:"#fee2e2",borderRadius:6,color:"#991b1b",fontSize:12,fontWeight:600,marginBottom:12}}>⚠️ {err}</div>}
      <button onClick={submit} disabled={loading} style={{width:"100%",padding:"11px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#0f2557,#1e40af)",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",marginBottom:10}}>
        {loading?"⏳ Verifying…":"🔓 Login"}
      </button>
      <button onClick={onBack} style={{width:"100%",padding:"8px",borderRadius:7,border:"1px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:12,cursor:"pointer"}}>
        ← Back to member list
      </button>
      <p style={{textAlign:"center",fontSize:10,color:"#94a3b8",marginTop:14}}>Forgotten password? Contact your Admin to reset.</p>
    </div>
  </div>;
}

/* ── SET PASSWORD MODAL ── */
function SetPasswordModal({member,onSave,onClose}){
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
  return<div style={{position:"fixed",inset:0,background:"rgba(10,20,50,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:12,padding:28,width:"min(380px,95vw)",boxShadow:"0 24px 80px rgba(0,0,0,0.3)"}}>
      <h3 style={{margin:"0 0 6px",fontSize:16,color:"#0f2557",fontWeight:800}}>🔑 Set Password – {member.name}</h3>
      <p style={{fontSize:12,color:"#64748b",marginBottom:18}}>Only Admins can set or reset passwords.</p>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{position:"relative"}}>
          <label style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",display:"block",marginBottom:4}}>New Password (min 6 chars)</label>
          <input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)} style={{...inp,paddingRight:40}}/>
          <button onClick={()=>setShow(v=>!v)} style={{position:"absolute",right:10,bottom:8,background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:14}}>{show?"🙈":"👁️"}</button>
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",display:"block",marginBottom:4}}>Confirm Password</label>
          <input type={show?"text":"password"} value={pw2} onChange={e=>setPw2(e.target.value)} style={inp}/>
        </div>
        {err&&<div style={{padding:"8px 12px",background:"#fee2e2",borderRadius:6,color:"#991b1b",fontSize:12}}>⚠️ {err}</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"9px",borderRadius:7,border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:13,cursor:"pointer"}}>Cancel</button>
          <button onClick={save} disabled={loading} style={{flex:2,padding:"9px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#0f2557,#1e40af)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {loading?"Saving…":"✅ Save Password"}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

/* ── TASK BRIEFING MODAL ── */
function TaskBriefing({tasks,enriched,currentUser,members,projects,onNoted,onOpenTask}){
  const [timeLeft,setTimeLeft]=useState(120); // 2 minutes
  const [dismissed,setDismissed]=useState(false);

  // Get incomplete tasks assigned to this member
  const myTasks=enriched.filter(t=>
    !t.deleted&&
    !t.isPersonal&&
    t.assigneeId===currentUser.id&&
    t.status!=="Completed"&&
    t.status!=="On Hold"&&
    t.status!=="Draft"
  ).sort((a,b)=>{
    // Overdue first, then by due date
    const aOver=a.status==="Overdue"?0:1;
    const bOver=b.status==="Overdue"?0:1;
    if(aOver!==bOver)return aOver-bOver;
    return (a.dueDate||"9999").localeCompare(b.dueDate||"9999");
  });

  useEffect(()=>{
    if(myTasks.length===0){onNoted("auto-none");return;}
    const timer=setInterval(()=>{
      setTimeLeft(t=>{
        if(t<=1){clearInterval(timer);onNoted("auto-timeout");return 0;}
        return t-1;
      });
    },1000);
    return()=>clearInterval(timer);
  },[]);

  if(myTasks.length===0)return null;
  if(dismissed)return null;

  const overdueCount=myTasks.filter(t=>t.status==="Overdue").length;
  const dueTodayCount=myTasks.filter(t=>daysDiff(t.dueDate)===0).length;

  const handleNoted=()=>{
    setDismissed(true);
    onNoted("clicked");
  };

  return<div style={{
    position:"fixed",inset:0,
    background:"rgba(5,10,30,0.88)",
    zIndex:5000,
    display:"flex",alignItems:"center",justifyContent:"center",
    backdropFilter:"blur(4px)",
    padding:16,
  }}>
    <div style={{
      background:"#fff",borderRadius:16,
      width:"min(580px,96vw)",
      maxHeight:"88vh",
      overflowY:"auto",
      boxShadow:"0 32px 100px rgba(0,0,0,0.5)",
      display:"flex",flexDirection:"column",
    }}>
      {/* Header */}
      <div style={{
        background:"linear-gradient(135deg,#0a1a42,#0f2557)",
        padding:"20px 24px",borderRadius:"16px 16px 0 0",
        position:"sticky",top:0,zIndex:1,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <div style={{fontSize:28}}>📋</div>
          <div>
            <div style={{fontSize:16,fontWeight:900,color:"#c9a227",letterSpacing:"0.05em"}}>
              TASK BRIEFING
            </div>
            <div style={{fontSize:12,color:"#7ba3d4",marginTop:2}}>
              Hey {currentUser.name}! Quick heads-up before you dive in 👀
            </div>
          </div>
        </div>
        {/* Summary badges */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <span style={{padding:"3px 10px",background:"rgba(255,255,255,0.1)",borderRadius:20,fontSize:11,color:"#fff",fontWeight:600}}>
            📋 {myTasks.length} Pending
          </span>
          {overdueCount>0&&<span style={{padding:"3px 10px",background:"#dc2626",borderRadius:20,fontSize:11,color:"#fff",fontWeight:700}}>
            🚨 {overdueCount} Overdue
          </span>}
          {dueTodayCount>0&&<span style={{padding:"3px 10px",background:"#f97316",borderRadius:20,fontSize:11,color:"#fff",fontWeight:700}}>
            ⚡ {dueTodayCount} Due Today
          </span>}
        </div>
      </div>

      {/* Task List */}
      <div style={{padding:"16px 20px",flex:1}}>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {myTasks.map(t=>{
            const proj=projects.find(p=>p.id===t.projectId);
            const assignor=members.find(m=>m.id===t.assignorId);
            const d=daysDiff(t.dueDate);
            const isOverdue=t.status==="Overdue"||d<0;
            const isDueToday=d===0;
            const isDueSoon=d>0&&d<=3;

            return<div key={t.id}
              onClick={()=>{handleNoted();setTimeout(()=>onOpenTask(t.id),150);}}
              style={{
                padding:"11px 14px",
                background:isOverdue?"#fff5f5":isDueToday?"#fff7ed":"#f8fafc",
                borderRadius:10,
                border:`1.5px solid ${isOverdue?"#fecaca":isDueToday?"#fed7aa":"#e2e8f0"}`,
                cursor:"pointer",
                borderLeft:`4px solid ${isOverdue?"#dc2626":isDueToday?"#f97316":isDueSoon?"#f59e0b":"#3b82f6"}`,
                transition:"transform 0.15s",
              }}
              onMouseEnter={e=>e.currentTarget.style.transform="translateX(4px)"}
              onMouseLeave={e=>e.currentTarget.style.transform="none"}
            >
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,fontWeight:800,color:"#c9a227"}}>{t.ref}</span>
                    {isOverdue&&<span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",borderRadius:4,padding:"1px 6px",fontWeight:700}}>🚨 OVERDUE</span>}
                    {isDueToday&&!isOverdue&&<span style={{fontSize:9,background:"#ffedd5",color:"#f97316",borderRadius:4,padding:"1px 6px",fontWeight:700}}>⚡ DUE TODAY</span>}
                    {isDueSoon&&!isOverdue&&!isDueToday&&<span style={{fontSize:9,background:"#fef3c7",color:"#92400e",borderRadius:4,padding:"1px 6px",fontWeight:700}}>⏰ {d}d left</span>}
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:"#0f2557",marginBottom:3,wordBreak:"break-word"}}>{t.task}</div>
                  <div style={{display:"flex",gap:10,fontSize:10,color:"#64748b",flexWrap:"wrap"}}>
                    {proj&&<span>📁 {proj.name}</span>}
                    {assignor&&<span>👤 From: {assignor.name}</span>}
                    {t.dueDate&&<span>📅 Due: {fmtDate(t.dueDate)}</span>}
                  </div>
                </div>
                <span style={{fontSize:11,color:"#94a3b8",flexShrink:0,marginTop:2}}>→</span>
              </div>
            </div>;
          })}
        </div>
        <div style={{marginTop:12,padding:"10px 14px",background:"#f0f9ff",borderRadius:8,border:"1px solid #bae6fd",fontSize:11,color:"#0369a1"}}>
          💡 Tap any task to jump straight in. You've got this, let's smash it today! 🔥
        </div>
      </div>

      {/* Footer — NOTED button */}
      <div style={{
        padding:"16px 20px",
        borderTop:"1px solid #f1f5f9",
        background:"#fafafa",
        borderRadius:"0 0 16px 16px",
        position:"sticky",bottom:0,
      }}>
        <button onClick={handleNoted} style={{
          width:"100%",padding:"14px",
          borderRadius:10,border:"none",
          background:"linear-gradient(135deg,#166534,#16a34a)",
          color:"#fff",fontSize:15,fontWeight:900,
          cursor:"pointer",
          letterSpacing:"0.08em",
          boxShadow:"0 4px 20px rgba(22,101,52,0.35)",
        }}>
          🚀 Let's Go !!
        </button>
        <div style={{textAlign:"center",marginTop:8,fontSize:10,color:"#94a3b8"}}>
          You got this! 💪 Window closes automatically.
        </div>
      </div>
    </div>
  </div>;
}

/* ── MAIN APP ── */
function App(){
  const [dbReady,setDbReady]=useState(false);
  const [currentUserId,setCurrentUserId]=useState(()=>LS.get("tkj_session_user"));
  const [passwordTarget,setPasswordTarget]=useState(null);
  const [tasks,setTasks]=useState([]);
  const [members,setMembers]=useState([]);
  const [projects,setProjects]=useState([]);
  const [updates,setUpdates]=useState([]);
  const [messages,setMessages]=useState([]);
  const [deleteRequests,setDeleteRequests]=useState([]);
  const [taskTypes,setTaskTypes]=useState([]);
  const [companies,setCompanies]=useState([]);
  const [moods,setMoods]=useState({});
  const [loaded,setLoaded]=useState(false);
  const [view,setView]=useState("list");
  const [modal,setModal]=useState(null);
  const [selected,setSelected]=useState(null);
  const [selectedTab,setSelectedTab]=useState("info");
  const [showPersonal,setShowPersonal]=useState(false);
  const [activeTab,setActiveTab]=useState("active"); // active | completed | personal
  const [showNotifs,setShowNotifs]=useState(false);
  const [pwModal,setPwModal]=useState(null);
  const [notifSeen,setNotifSeen]=useState(()=>LS.get("tkj_notif_seen")||{});
  const [filters,setFilters]=useState({project:"",status:"",priority:"",assignee:"",taskType:"",company:"",search:"",dueDateFrom:"",dueDateTo:"",preparedFrom:"",preparedTo:"",completedFrom:"",completedTo:"",showDueToday:false,showDueWeek:false});
  const [sortKey,setSortKey]=useState(()=>LS.get("tkj_sort_key")||"createdAt");
  const [sortDir,setSortDir]=useState(()=>LS.get("tkj_sort_dir")||"desc");
  const [showBriefing,setShowBriefing]=useState(false);
  const [toasts,setToasts]=useState([]);
  const [muted,setMuted]=useState(()=>LS.get("tkj_muted")||false);
  const prevNotifIds=useRef(new Set());
  const bellRef=useRef();
  const headerW=useWindowWidth();
  const narrow=headerW<640;
  const updF=(k,v)=>setFilters(p=>({...p,[k]:v}));
  const setSort=(k,d)=>{setSortKey(k);setSortDir(d);LS.set("tkj_sort_key",k);LS.set("tkj_sort_dir",d);};

  useEffect(()=>{setDbReady(true);},[]);

  const loadAll=useCallback(async()=>{
    const [mr,pr,tr,ur,msgr,drr,ttr,cor]=await Promise.all([
      db.from("members").select("*"),
      db.from("projects").select("*"),
      db.from("tasks").select("*"),
      db.from("task_updates").select("*").order("timestamp",{ascending:true}),
      db.from("task_messages").select("*").order("timestamp",{ascending:true}),
      db.from("delete_requests").select("*"),
      db.from("task_types").select("*").order("name",{ascending:true}),
      db.from("companies").select("*").order("name",{ascending:true}),
    ]);
    if(mr.data)setMembers(mr.data.map(fromMember));
    if(pr.data)setProjects(pr.data.map(fromProject));
    if(tr.data)setTasks(tr.data.map(fromTask));
    if(ur.data)setUpdates(ur.data.map(fromUpdate));
    if(msgr.data)setMessages(msgr.data.map(fromMsg));
    if(drr.data)setDeleteRequests(drr.data.map(fromDR));
    if(ttr.data)setTaskTypes(ttr.data);
    if(cor.data)setCompanies(cor.data);
    setLoaded(true);
  },[]);

  const loadMoods=useCallback(async()=>{
    const todayStr=new Date().toISOString().split("T")[0];
    const {data}=await db.from("moods").select("*").eq("mood_date",todayStr);
    if(data){const map={};data.forEach(r=>{map[`${todayStr}_${r.member_id}`]=r.mood_id;});setMoods(map);}
  },[]);

  useEffect(()=>{if(dbReady){loadAll();loadMoods();}},[dbReady]);

  useEffect(()=>{
    if(!dbReady)return;
    const ch=db.channel("tkj-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"task_updates"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"task_messages"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"delete_requests"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"task_types"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"companies"},()=>loadAll())
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
    setCurrentUserId(member.id);LS.set("tkj_session_user",member.id);
    if(!member.passwordHash){
      if(member.role==="admin"){setPasswordTarget("mood");}
      else{alert("Your account has no password set. Please ask your Admin to set one.");setCurrentUserId(null);}
      return;
    }
    setPasswordTarget(member);
  };
  const logout=()=>{setCurrentUserId(null);setPasswordTarget(null);LS.set("tkj_session_user",null);};

  const saveTask=async(t)=>{
    const row=toTask(t);
    if(tasks.find(x=>x.id===t.id)){await db.from("tasks").update(row).eq("id",t.id);}
    else{
      await db.from("tasks").insert(row);
      const assigneeName=members.find(m=>m.id===t.assigneeId)?.name||"–";
      await db.from("task_updates").insert(toUpdate({id:uid(),taskId:t.id,authorId:currentUserId||"",
        text:`Task created by ${currentUser?.name||"–"}. Assigned to ${assigneeName}. Priority: ${t.priority}. Due: ${fmtDate(t.dueDate)}.`,
        attachments:[],timestamp:nowISO(),type:"system"}));
    }
    setModal(null);setSelected(null);
  };
  const deleteTask=async(id)=>{
    if(!isAdmin){alert("Only Admin can delete.");return;}
    if(!confirm("Permanently delete this task?"))return;
    await db.from("task_updates").insert(toUpdate({id:uid(),taskId:id,authorId:currentUserId,
      text:`Task deleted by Admin (${currentUser?.name}) on ${fmtDT(nowISO())}.`,
      attachments:[],timestamp:nowISO(),type:"system"}));
    await db.from("tasks").update({deleted:true,deleted_at:nowISO(),deleted_by:currentUserId}).eq("id",id);
    setModal(null);setSelected(null);
  };
  const addUpdate=async(u)=>{
    if(u._updateExisting){
      // Update existing record (for supersede marking)
      const {_updateExisting,...row}=u;
      await db.from("task_updates").update(toUpdate(row)).eq("id",row.id);
    } else {
      await db.from("task_updates").insert(toUpdate(u));
    }
  };
  const approveUpdate=async(suggestionId)=>{
    await db.from("task_updates").delete().eq("id",suggestionId);
  };
  const rejectUpdate=async(suggestionId)=>{
    await db.from("task_updates").delete().eq("id",suggestionId);
  };
  const deleteUpdate=async(updateId)=>{
    await db.from("task_updates").delete().eq("id",updateId);
  };
  const sendMessage=async(m)=>{await db.from("task_messages").insert(toMsg(m));};
  const updateAttachments=async(taskId,attachments)=>{
    await db.from("tasks").update({attachments}).eq("id",taskId);
    setTasks(p=>p.map(t=>t.id===taskId?{...t,attachments}:t));
    setSelected(prev=>prev?.id===taskId?{...prev,attachments}:prev);
  };
  const submitDeleteRequest=async(taskId,reason)=>{
    const existing=deleteRequests.find(r=>r.taskId===taskId&&r.status==="pending");
    if(existing){alert("A delete request is already pending.");return;}
    const req={id:uid(),taskId,requestedBy:currentUserId,reason,timestamp:nowISO(),status:"pending",reviewedBy:null,reviewedAt:null,reviewNote:""};
    await db.from("delete_requests").insert(toDR(req));
    await addUpdate({id:uid(),taskId,authorId:currentUserId,text:`Delete request by ${currentUser?.name}. Reason: "${reason}". Awaiting Admin approval.`,attachments:[],timestamp:nowISO(),type:"system"});
  };
  const reviewDeleteRequest=async(reqId,approved,reviewNote)=>{
    const req=deleteRequests.find(r=>r.id===reqId);if(!req)return;
    const requester=members.find(m=>m.id===req.requestedBy);
    await db.from("delete_requests").update({status:approved?"approved":"rejected",reviewed_by:currentUserId,reviewed_at:nowISO(),review_note:reviewNote}).eq("id",reqId);
    if(approved){
      await db.from("tasks").update({deleted:true,deleted_at:nowISO(),deleted_by:req.requestedBy,deleted_approved_by:currentUserId}).eq("id",req.taskId);
      await addUpdate({id:uid(),taskId:req.taskId,authorId:currentUserId,text:`✅ DELETE APPROVED by Admin (${currentUser?.name}). Requested by ${requester?.name||"–"}. Reason: "${req.reason}". Note: "${reviewNote||"None"}".`,attachments:[],timestamp:nowISO(),type:"system"});
    }else{
      await addUpdate({id:uid(),taskId:req.taskId,authorId:currentUserId,text:`❌ DELETE REJECTED by Admin (${currentUser?.name}). Note: "${reviewNote||"None"}".`,attachments:[],timestamp:nowISO(),type:"system"});
    }
    if(approved){setModal(null);setSelected(null);}
  };
  const saveTaskTypes=(types)=>{
    setTaskTypes(types);
    try{localStorage.setItem("tkj_task_types",JSON.stringify(types));}catch{}
  };

  const saveCompany=async(co)=>{
    if(companies.find(x=>x.id===co.id)){
      await db.from("companies").update({code:co.code,name:co.name,active:co.active}).eq("id",co.id);
    } else {
      await db.from("companies").insert({id:co.id,code:co.code,name:co.name,active:true});
    }
  };
  const deleteCompany=async(id)=>{
    const linked=tasks.filter(t=>t.companyId===id&&t.status!=="Completed"&&!t.deleted);
    if(linked.length>0){
      alert(`Cannot delete — ${linked.length} incomplete task(s) linked. Reassign them first.`);
      return false;
    }
    await db.from("companies").delete().eq("id",id);
    return true;
  };
  const saveTaskType=async(tt)=>{
    if(taskTypes.find(x=>x.id===tt.id)){
      await db.from("task_types").update({name:tt.name,active:tt.active}).eq("id",tt.id);
    } else {
      await db.from("task_types").insert({id:tt.id,name:tt.name,active:true});
    }
  };
  const deleteTaskType=async(id)=>{
    // Check if any incomplete tasks use this type
    const linked=tasks.filter(t=>t.taskTypeId===id&&t.status!=="Completed"&&t.status!=="On Hold"&&!t.deleted);
    if(linked.length>0){
      alert(`Cannot delete — ${linked.length} incomplete task(s) are using this type. Please reassign them first.`);
      return false;
    }
    await db.from("task_types").delete().eq("id",id);
    return true;
  };
  const updateMember=async(m)=>{
    const row=toMember(m);
    if(members.find(x=>x.id===m.id)){await db.from("members").update(row).eq("id",m.id);}
    else{await db.from("members").insert({...row,id:m.id});}
  };
  const updateProject=async(p)=>{
    if(projects.find(x=>x.id===p.id)){await db.from("projects").update(toProject(p)).eq("id",p.id);}
    else{await db.from("projects").insert({...toProject(p),id:p.id});}
  };
  const setMemberPassword=async(memberId,hash)=>{await db.from("members").update({password_hash:hash}).eq("id",memberId);};
  const saveMood=async(memberId,moodId)=>{
    const todayStr=new Date().toISOString().split("T")[0];
    await db.from("moods").upsert({member_id:memberId,mood_date:todayStr,mood_id:moodId},{onConflict:"member_id,mood_date"});
    setMoods(p=>({...p,[`${todayStr}_${memberId}`]:moodId}));
  };
  const markNotifsRead=()=>{const seen={...notifSeen,[currentUserId]:nowISO()};setNotifSeen(seen);LS.set("tkj_notif_seen",seen);};
  const toggleMute=()=>{const m=!muted;setMuted(m);LS.set("tkj_muted",m);};
  const handleBriefingNoted=async(how)=>{
    setShowBriefing(false);
    // Audit trail — log acknowledgement
    const myPending=enriched.filter(t=>
      !t.deleted&&!t.isPersonal&&
      t.assigneeId===currentUserId&&
      t.status!=="Completed"&&t.status!=="On Hold"&&t.status!=="Draft"
    );
    if(myPending.length>0&&how==="clicked"){
      // Log one system update per task acknowledged
      const now=nowISO();
      for(const t of myPending.slice(0,10)){// cap at 10 to avoid spam
        await addUpdate({
          id:uid(),taskId:t.id,authorId:currentUserId,
          text:`📋 Task briefing acknowledged by ${currentUser?.name} on ${fmtDT(now)}. Task status: ${t.status}.`,
          attachments:[],timestamp:now,type:"briefing_audit",
          supersedesId:null,supersededById:null,
          suggestionStatus:null,approvedBy:null,approvedAt:null,
        });
      }
    }
  };

  const enriched=useMemo(()=>tasks.map(t=>{
    if(t.status!=="Completed"&&t.status!=="On Hold"&&t.dueDate&&daysDiff(t.dueDate)<0)return{...t,status:"Overdue"};return t;
  }),[tasks]);

  const visibleTasks=useMemo(()=>{
    if(activeTab==="personal")return enriched.filter(t=>t.isPersonal&&t.personalOwnerId===currentUserId&&!t.deleted);
    if(activeTab==="completed")return enriched.filter(t=>!t.isPersonal&&!t.deleted&&t.status==="Completed");
    // active — exclude completed and personal
    return enriched.filter(t=>!t.isPersonal&&!t.deleted&&t.status!=="Completed"&&(t.status!=="Draft"||(t.createdBy===currentUserId||t.assignorId===currentUserId)));
  },[enriched,activeTab,currentUserId]);

  const filtered=useMemo(()=>{
    let res=visibleTasks;
    if(filters.search)res=res.filter(t=>[t.task,t.ref,t.remarks].join(" ").toLowerCase().includes(filters.search.toLowerCase()));
    if(filters.project)res=res.filter(t=>t.projectId===filters.project);
    if(filters.status)res=res.filter(t=>t.status===filters.status);
    if(filters.priority)res=res.filter(t=>t.priority===filters.priority);
    if(filters.assignee)res=res.filter(t=>t.assigneeId===filters.assignee);
    if(filters.taskType)res=res.filter(t=>t.taskTypeId===filters.taskType);
    if(filters.company)res=res.filter(t=>t.companyId===filters.company);
    if(filters.taskType)res=res.filter(t=>t.taskType===filters.taskType);
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

  // ── FLOATING TOAST TRIGGER ──
  // Uses raw messages+updates (NOT filtered by notifSeen) so toasts fire
  // even after bell has been opened. Tracks by id to avoid duplicates.
  // On first load: pre-populate prevNotifIds so we don't toast old history.
  const isFirstLoad=useRef(true);

  useEffect(()=>{
    if(!currentUserId||!loaded)return;
    const myTaskIds=new Set(
      tasks.filter(t=>t.assigneeId===currentUserId||t.assignorId===currentUserId||(t.cc||[]).includes(currentUserId)).map(t=>t.id)
    );
    const allRelevant=[
      ...messages.filter(m=>m.taskId&&myTaskIds.has(m.taskId)&&m.authorId!==currentUserId).map(m=>({...m,type:"message"})),
      ...updates.filter(u=>u.taskId&&myTaskIds.has(u.taskId)&&u.authorId!==currentUserId&&u.type!=="system").map(u=>({...u,type:"update"})),
    ];

    if(isFirstLoad.current){
      // Pre-populate on first load — don't toast existing items
      allRelevant.forEach(n=>prevNotifIds.current.add(n.id));
      isFirstLoad.current=false;
      return;
    }

    // Only process truly new items
    const newItems=allRelevant.filter(n=>!prevNotifIds.current.has(n.id));
    if(newItems.length===0)return;

    newItems.forEach(n=>{
      prevNotifIds.current.add(n.id);
      const author=members.find(m=>m.id===n.authorId);
      const task=enriched.find(t=>t.id===n.taskId);
      const toastId=uid();
      setToasts(prev=>[...prev,{
        id:toastId,taskId:n.taskId,
        authorName:author?.name||"Someone",
        taskRef:task?.ref||"",
        taskName:task?.task||"",
        type:n.type,urgent:n.urgent||false,
        text:n.text||"",
        timestamp:n.timestamp
      }]);
      setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==toastId)),n.urgent?15000:8000);

      // Sound — use a short delay so browser allows it after realtime event
      if(!muted){
        setTimeout(()=>{
          try{
            const ctx=new (window.AudioContext||window.webkitAudioContext)();
            const playNote=(freq,start,dur)=>{
              const o=ctx.createOscillator();
              const g=ctx.createGain();
              o.connect(g);g.connect(ctx.destination);
              o.type="sine";
              o.frequency.value=freq;
              g.gain.setValueAtTime(0,start);
              g.gain.linearRampToValueAtTime(0.25,start+0.02);
              g.gain.exponentialRampToValueAtTime(0.001,start+dur);
              o.start(start);o.stop(start+dur);
            };
            const t=ctx.currentTime;
            if(n.urgent){
              // Urgent: three sharp beeps
              playNote(880,t,0.12);
              playNote(880,t+0.15,0.12);
              playNote(1100,t+0.30,0.2);
            } else {
              // Normal: gentle two-tone chime
              playNote(660,t,0.2);
              playNote(880,t+0.18,0.25);
            }
          }catch(e){}
        },100);
      }
    });
  },[messages,updates,tasks,currentUserId,loaded,muted]);

  const urgentNotifs=notifications.filter(n=>n.urgent).length;
  const pendingDeleteNotifs=isAdmin?deleteRequests.filter(r=>r.status==="pending").length:0;
  const getMember=id=>members.find(m=>m.id===id);
  const getProject=id=>projects.find(p=>p.id===id);
  const activeFiltersCount=Object.entries(filters).filter(([k,v])=>k!=="search"&&v&&v!==false).length;
  const clearFilters=()=>setFilters({project:"",status:"",priority:"",assignee:"",taskType:"",company:"",search:"",dueDateFrom:"",dueDateTo:"",preparedFrom:"",preparedTo:"",completedFrom:"",completedTo:"",showDueToday:false,showDueWeek:false});
  const openTask=(taskId,tab="info")=>{const t=enriched.find(x=>x.id===taskId);if(t){setSelected(t);setSelectedTab(tab);setModal("detail");}};
  const selStyle={border:"1.5px solid #e2e8f0",borderRadius:6,padding:"7px 10px",fontSize:12,color:"#1e293b",background:"#fff",outline:"none",cursor:"pointer"};
  const dateStyle={border:"1.5px solid #e2e8f0",borderRadius:6,padding:"7px 10px",fontSize:12,color:"#1e293b",background:"#fff",outline:"none"};

  if(!dbReady)return<ConfigScreen onConnected={()=>setDbReady(true)}/>;

  if(!loaded)return<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
    <img src={TKJ_LOGO} alt="TKJ" style={{height:60,objectFit:"contain"}}/>
    <div style={{color:"#7ba3d4",fontSize:14}}>Loading TKJ Task Monitoring…</div>
    <div style={{width:180,height:4,background:"rgba(255,255,255,0.1)",borderRadius:2,overflow:"hidden"}}>
      <div style={{width:"60%",height:"100%",background:"#c9a227",borderRadius:2,animation:"pulse 1.5s infinite"}}/>
    </div>
  </div>;

  if(passwordTarget==="mood"){
    const user=currentUser;
    return<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:16,padding:36,width:"min(480px,95vw)",boxShadow:"0 32px 100px rgba(0,0,0,0.4)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <img src={TKJ_LOGO} alt="TKJ" style={{height:60,objectFit:"contain",marginBottom:10}}/>
          <h2 style={{fontSize:18,color:"#0f2557",fontWeight:800,margin:"0 0 4px"}}>Good day, {user?.name}! 👋</h2>
          <p style={{fontSize:13,color:"#64748b",margin:0}}>How are you feeling today?</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          {MOODS.map(m=><button key={m.id} onClick={async()=>{await saveMood(user.id,m.id);setPasswordTarget(null);setShowBriefing(true);}}
            style={{padding:"14px 8px",borderRadius:10,border:`2px solid ${moods[`${today()}_${user.id}`]===m.id?m.color:"#e2e8f0"}`,background:moods[`${today()}_${user.id}`]===m.id?m.color+"15":"#f8fafc",cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
            <span style={{fontSize:26}}>{m.emoji}</span>
            <span style={{fontSize:10,fontWeight:700,color:"#475569"}}>{m.label}</span>
          </button>)}
        </div>
        <button onClick={()=>{setPasswordTarget(null);setShowBriefing(true);}} style={{width:"100%",padding:"9px",borderRadius:7,border:"1.5px solid #e2e8f0",background:"#fff",color:"#94a3b8",fontSize:12,cursor:"pointer"}}>Skip</button>
      </div>
    </div>;
  }

  if(passwordTarget&&passwordTarget!=="mood"){
    return<PasswordModal member={passwordTarget} onSuccess={()=>setPasswordTarget("mood")} onBack={()=>{setPasswordTarget(null);setCurrentUserId(null);LS.set("tkj_session_user",null);}}/>;
  }

  if(!currentUser){
    return<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1a42,#0f2557)",display:"flex",alignItems:"center",justifyContent:"center"}}>
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
            return<button key={m.id} onClick={()=>login(m)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",textAlign:"left"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#eff6ff";e.currentTarget.style.borderColor="#0f2557";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#f8fafc";e.currentTarget.style.borderColor="#e2e8f0";}}>
              <Avatar name={m.name} size={38} color={m.role==="admin"?"#c9a227":"#0f2557"}/>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#0f2557"}}>{m.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>{m.role==="admin"?"Admin":"Member"} · {m.email}</div></div>
              {moodObj&&<span style={{fontSize:22}}>{moodObj.emoji}</span>}
              <span style={{color:"#94a3b8",fontSize:16}}>🔒</span>
            </button>;
          })}
        </div>
        <div style={{textAlign:"center",marginTop:16}}>
          <div style={{fontSize:10,color:"#94a3b8"}}>☁️ Real-time cloud sync active</div>
        </div>
        <button onClick={()=>{LS.set("sb_url",null);LS.set("sb_key",null);window.location.reload();}} style={{width:"100%",marginTop:10,padding:"6px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",color:"#94a3b8",fontSize:10,cursor:"pointer"}}>⚙️ Change Database Settings</button>
      </div>
    </div>;
  }

  return<div style={{fontFamily:"'Century Gothic','Trebuchet MS',Tahoma,sans-serif",background:"#f0f4f8",minHeight:"100vh"}}>
    {pwModal&&<SetPasswordModal member={pwModal} onSave={setMemberPassword} onClose={()=>setPwModal(null)}/>}
    {showBriefing&&currentUser&&loaded&&<TaskBriefing
      tasks={tasks} enriched={enriched}
      currentUser={currentUser}
      members={members} projects={projects}
      onNoted={handleBriefingNoted}
      onOpenTask={(taskId)=>{setShowBriefing(false);setTimeout(()=>openTask(taskId,"info"),150);}}
    />}
    <div style={{background:"linear-gradient(135deg,#0a1a42 0%,#0f2557 60%,#1a3a7c 100%)",boxShadow:"0 4px 24px rgba(10,26,66,0.4)",position:"sticky",top:0,zIndex:200}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px 5px"}}>
        <img src={TKJ_LOGO} alt="TKJ" style={{height:40,objectFit:"contain",flexShrink:0,filter:"brightness(1.05)"}}/>
        <div style={{borderLeft:"1px solid rgba(255,255,255,0.2)",paddingLeft:12}}>
          <div style={{color:"#c9a227",fontSize:11,fontWeight:900,letterSpacing:"0.12em",textTransform:"uppercase",lineHeight:1.2,whiteSpace:"nowrap"}}>Task Monitoring</div>
          <div style={{color:"#e2e8f0",fontSize:9,fontWeight:600,marginTop:2,whiteSpace:"nowrap"}}>TKJ Project Management Sdn Bhd<span style={{color:"#94a3b8",fontWeight:400,fontSize:8,marginLeft:6,paddingLeft:6,borderLeft:"1px solid #334155"}}>(1676211-U)</span></div>
          <div style={{color:"#64748b",fontSize:8,fontStyle:"italic",whiteSpace:"nowrap",marginTop:1}}>Managing Complexity. Delivering Results.</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:narrow?3:5,padding:"4px 14px 8px",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
        {[{id:"list",icon:"📋",label:"Tasks"},{id:"kpi",icon:"📊",label:"KPI"},...(isAdmin?[{id:"admin",icon:"⚙️",label:"Admin"}]:[])].map(n=>(
          <button key={n.id} onClick={()=>setView(n.id)} style={{display:"flex",alignItems:"center",gap:narrow?0:5,padding:narrow?"6px 10px":"6px 14px",borderRadius:6,border:"none",background:view===n.id?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.05)",color:view===n.id?"#fff":"#7ba3d4",fontSize:narrow?18:12,fontWeight:600,cursor:"pointer",position:"relative"}}>
            <span>{n.icon}</span>{!narrow&&<span>{n.label}{n.id==="admin"&&pendingDeleteNotifs>0?" 🔴":""}</span>}
            {narrow&&n.id==="admin"&&pendingDeleteNotifs>0&&<span style={{position:"absolute",top:2,right:2,fontSize:8}}>🔴</span>}
          </button>
        ))}
        <div ref={bellRef} style={{position:"relative"}}>
          <button onClick={()=>{setShowNotifs(v=>!v);if(!showNotifs)markNotifsRead();}} style={{position:"relative",padding:"5px 8px",border:"none",background:"transparent",cursor:"pointer",color:notifications.length?"#fbbf24":"#7ba3d4",fontSize:18}}>
            🔔{(notifications.length+pendingDeleteNotifs)>0&&<span style={{position:"absolute",top:1,right:1,background:urgentNotifs?"#dc2626":pendingDeleteNotifs?"#f97316":"#f59e0b",color:"#fff",borderRadius:"50%",width:15,height:15,fontSize:8,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>{(notifications.length+pendingDeleteNotifs)>9?"9+":(notifications.length+pendingDeleteNotifs)}</span>}
          </button>
          {showNotifs&&<NotifPanel notifs={notifications} members={members} tasks={enriched} projects={projects} onClose={()=>setShowNotifs(false)} onOpenTask={(id,tab)=>{openTask(id,tab);setView("list");}}/>}
        </div>
        <button onClick={toggleMute} title={muted?"Notifications muted — click to unmute":"Notifications sound on — click to mute"} style={{padding:"5px 8px",border:"none",background:"transparent",cursor:"pointer",color:muted?"#ef4444":"#7ba3d4",fontSize:16}}>
          {muted?"🔕":"🔔"}
        </button>
        <div style={{display:"flex",alignItems:"center",gap:narrow?0:6,padding:narrow?"4px 6px":"4px 10px",background:"rgba(255,255,255,0.08)",borderRadius:7,cursor:"pointer"}} onClick={logout}>
          <Avatar name={currentUser.name} size={narrow?22:24} color="#c9a227"/>
          {!narrow&&<div><div style={{color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>{currentUser.name}{myMoodObj&&<span style={{fontSize:11}}>{myMoodObj.emoji}</span>}</div><div style={{color:"#7ba3d4",fontSize:8}}>{isAdmin?"Admin":"Member"} · Logout</div></div>}
          {narrow&&myMoodObj&&<span style={{fontSize:10,marginLeft:2}}>{myMoodObj.emoji}</span>}
        </div>
        <button onClick={()=>{setSelected(null);setModal("form");}} style={{padding:narrow?"6px 10px":"7px 14px",borderRadius:7,border:"1.5px solid #c9a227",background:"rgba(201,162,39,0.1)",color:"#c9a227",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>
          {narrow?"＋":"+ New Task"}
        </button>
      </div>
    </div>

    {view==="kpi"&&<KPIView tasks={enriched} members={members} projects={projects} moods={moods}/>}
    {view==="admin"&&isAdmin&&<AdminView
      members={members} projects={projects} tasks={enriched} updates={updates}
      deleteRequests={deleteRequests} currentUser={currentUser}
      taskTypes={taskTypes}
      onUpdateMembers={async(arr)=>{for(const m of arr)await updateMember(m);}}
      onUpdateProjects={async(arr)=>{for(const p of arr)await updateProject(p);}}
      onReviewDeleteRequest={reviewDeleteRequest}
      onSetPassword={(m)=>setPwModal(m)}
      onSaveTaskTypes={saveTaskTypes}
      onSaveTaskType={saveTaskType}
      onDeleteTaskType={deleteTaskType}
    />}

    {view==="list"&&<div style={{padding:"14px 18px"}}>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <button onClick={()=>{setActiveTab("active");setShowPersonal(false);}} style={{padding:"6px 14px",borderRadius:6,border:`1.5px solid ${activeTab==="active"?"#0f2557":"#e2e8f0"}`,background:activeTab==="active"?"#0f2557":"#fff",color:activeTab==="active"?"#fff":"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          📋 Active Tasks <span style={{fontSize:10,background:activeTab==="active"?"rgba(255,255,255,0.2)":"#f1f5f9",borderRadius:10,padding:"1px 6px",marginLeft:4}}>{enriched.filter(t=>!t.isPersonal&&!t.deleted&&t.status!=="Completed").length}</span>
        </button>
        <button onClick={()=>{setActiveTab("completed");setShowPersonal(false);}} style={{padding:"6px 14px",borderRadius:6,border:`1.5px solid ${activeTab==="completed"?"#166534":"#e2e8f0"}`,background:activeTab==="completed"?"#166534":"#fff",color:activeTab==="completed"?"#fff":"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          ✅ Completed <span style={{fontSize:10,background:activeTab==="completed"?"rgba(255,255,255,0.2)":"#f1f5f9",borderRadius:10,padding:"1px 6px",marginLeft:4}}>{enriched.filter(t=>!t.isPersonal&&!t.deleted&&t.status==="Completed").length}</span>
        </button>
        <button onClick={()=>{setActiveTab("personal");setShowPersonal(true);}} style={{padding:"6px 14px",borderRadius:6,border:`1.5px solid ${activeTab==="personal"?"#8b5cf6":"#e2e8f0"}`,background:activeTab==="personal"?"#8b5cf6":"#fff",color:activeTab==="personal"?"#fff":"#64748b",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          👤 My Personal <span style={{fontSize:10,background:activeTab==="personal"?"rgba(255,255,255,0.2)":"#f1f5f9",borderRadius:10,padding:"1px 6px",marginLeft:4}}>{enriched.filter(t=>t.isPersonal&&t.personalOwnerId===currentUserId&&!t.deleted).length}</span>
        </button>
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:"12px 14px",marginBottom:14,boxShadow:"0 2px 12px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{position:"relative",flex:"1 1 200px"}}>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",fontSize:13}}>🔍</span>
            <input value={filters.search} onChange={e=>updF("search",e.target.value)} placeholder="Search tasks, ref…" style={{...selStyle,paddingLeft:28,width:"100%",boxSizing:"border-box"}}/>
          </div>
          {!showPersonal&&<select value={filters.project} onChange={e=>updF("project",e.target.value)} style={selStyle}><option value="">All Projects</option>{projects.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <select value={filters.taskType||""} onChange={e=>updF("taskType",e.target.value)} style={selStyle}>
            <option value="">All Types</option>
            {taskTypes.filter(tt=>tt.active).sort((a,b)=>a.name.localeCompare(b.name)).map(tt=><option key={tt.id} value={tt.id}>{tt.name}</option>)}
          </select>
          <select value={filters.company||""} onChange={e=>updF("company",e.target.value)} style={selStyle}>
            <option value="">All Companies</option>
            {companies.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          <select value={filters.status} onChange={e=>updF("status",e.target.value)} style={selStyle}><option value="">All Status</option>{Object.keys(STATUS_META).map(s=><option key={s}>{s}</option>)}</select>
          <select value={filters.priority} onChange={e=>updF("priority",e.target.value)} style={selStyle}><option value="">All Priority</option>{Object.keys(PRIORITY_META).map(p=><option key={p}>{p}</option>)}</select>
          {!showPersonal&&<select value={filters.assignee} onChange={e=>updF("assignee",e.target.value)} style={selStyle}><option value="">All Assignee</option>{members.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>}
          <select value={filters.taskType} onChange={e=>updF("taskType",e.target.value)} style={selStyle}>
            <option value="">All Types</option>
            {taskTypes.filter(t=>t.active).map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          {activeFiltersCount>0&&<button onClick={clearFilters} style={{padding:"7px 12px",borderRadius:6,border:"1.5px solid #fecaca",background:"#fff",color:"#dc2626",fontSize:11,fontWeight:700,cursor:"pointer"}}>✕ Clear</button>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
          {[["Due","dueDateFrom","dueDateTo"],["Prepared","preparedFrom","preparedTo"],["Completed","completedFrom","completedTo"]].map(([l,f1,f2])=><div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:10,color:"#64748b",fontWeight:700,whiteSpace:"nowrap"}}>{l}:</span>
            <input type="date" value={filters[f1]} onChange={e=>updF(f1,e.target.value)} style={dateStyle}/>
            <span style={{fontSize:10,color:"#94a3b8"}}>–</span>
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
            return<div key={s.k} style={{display:"flex",borderRadius:5,overflow:"hidden",border:`1px solid ${isActive?"#0f2557":"#e2e8f0"}`}}>
              <button onClick={()=>setSort(s.k,"asc")} style={{padding:"3px 7px",border:"none",borderRight:`1px solid ${isActive?"#1e3a7c":"#e2e8f0"}`,background:isActive&&sortDir==="asc"?"#0f2557":isActive?"#e8eef8":"#fff",color:isActive&&sortDir==="asc"?"#fff":"#64748b",fontSize:9,fontWeight:isActive&&sortDir==="asc"?700:400,cursor:"pointer"}}>{s.l} ↑</button>
              <button onClick={()=>setSort(s.k,"desc")} style={{padding:"3px 7px",border:"none",background:isActive&&sortDir==="desc"?"#0f2557":isActive?"#e8eef8":"#fff",color:isActive&&sortDir==="desc"?"#fff":"#64748b",fontSize:9,fontWeight:isActive&&sortDir==="desc"?700:400,cursor:"pointer"}}>↓</button>
            </div>;
          })}
        </div>
      </div>
      <ResponsiveTaskTable
        filtered={filtered} enriched={enriched} messages={messages}
        notifications={notifications} members={members} projects={projects} taskTypes={taskTypes}
        getMember={getMember} getProject={getProject}
        STATUS_META={STATUS_META} PRIORITY_META={PRIORITY_META}
        fmtDate={fmtDate} DueChip={DueChip} Badge={Badge} Avatar={Avatar}
        clearFilters={clearFilters} activeFiltersCount={activeFiltersCount}
        onOpenTask={(t)=>{setSelected(t);setSelectedTab("info");setModal("detail");}}
      />
    </div>}

    {modal==="form"&&<Modal onClose={()=>setModal(null)} wide><TaskForm initial={null} tasks={tasks} members={members} projects={projects} taskTypes={taskTypes} companies={companies} currentUser={currentUser} onSave={saveTask} onCancel={()=>setModal(null)}/></Modal>}
    {modal==="edit"&&selected&&<Modal onClose={()=>setModal(null)} wide><TaskForm initial={enriched.find(t=>t.id===selected.id)||selected} tasks={tasks} members={members} projects={projects} taskTypes={taskTypes} companies={companies} currentUser={currentUser} onSave={saveTask} onCancel={()=>setModal(null)}/></Modal>}
    {modal==="detail"&&selected&&<Modal onClose={()=>setModal(null)} extraWide>
      <TaskDetailModal
        task={enriched.find(t=>t.id===selected.id)||selected}
        tasks={enriched} members={members} projects={projects} taskTypes={taskTypes} companies={companies}
        updates={updates} messages={messages} currentUser={currentUser}
        onClose={()=>setModal(null)} onEdit={()=>setModal("edit")}
        isAdmin={isAdmin} deleteRequests={deleteRequests}
        onDeleteAdmin={()=>deleteTask(selected.id)}
        onRequestDelete={(reason)=>submitDeleteRequest(selected.id,reason)}
        onAddUpdate={addUpdate} onSendMessage={sendMessage}
        onAttachmentChange={(a)=>updateAttachments(selected.id,a)}
        onSaveTask={saveTask}
        onOpenLinked={(taskId)=>{setModal(null);setSelected(null);setTimeout(()=>openTask(taskId,"info"),100);}}
        onApproveUpdate={approveUpdate}
        onRejectUpdate={rejectUpdate}
        onDeleteUpdate={deleteUpdate}
      />
    </Modal>}

    {/* ── FLOATING TOAST NOTIFICATIONS ── */}
    <div style={{position:"fixed",top:70,right:16,zIndex:3000,display:"flex",flexDirection:"column",gap:10,maxWidth:340,pointerEvents:"none"}}>
      {toasts.map(toast=>(
        <div key={toast.id} style={{background:toast.urgent?"#fff5f5":"#fff",borderRadius:12,boxShadow:"0 8px 32px rgba(10,20,60,0.28)",border:`1.5px solid ${toast.urgent?"#fca5a5":"#e2e8f0"}`,overflow:"hidden",animation:"slideInRight 0.35s cubic-bezier(.22,.68,0,1.2)",pointerEvents:"all"}}>
          {/* Header — clickable to go to task+tab */}
          <div
            onClick={()=>{
              setToasts(prev=>prev.filter(t=>t.id!==toast.id));
              openTask(toast.taskId, toast.type==="message"?"messages":"updates");
              setView("list");
            }}
            style={{background:toast.urgent?"linear-gradient(135deg,#dc2626,#b91c1c)":"linear-gradient(135deg,#0f2557,#1e40af)",padding:"9px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}
          >
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:15}}>{toast.urgent?"🚨":toast.type==="message"?"💬":"📌"}</span>
              <div>
                <div style={{fontSize:11,fontWeight:800,color:"#fff",lineHeight:1.2}}>{toast.urgent?"🚨 URGENT — ":""}{toast.type==="message"?"New Chat Message":"New Update Posted"}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",marginTop:1}}>Tap to open → {toast.type==="message"?"Chat":"Updates"} tab</div>
              </div>
            </div>
            <button
              onClick={e=>{e.stopPropagation();setToasts(prev=>prev.filter(t=>t.id!==toast.id));}}
              style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:4,color:"#fff",fontSize:12,cursor:"pointer",padding:"3px 7px",lineHeight:1,flexShrink:0}}
            >✕</button>
          </div>
          {/* Body — also clickable */}
          <div
            onClick={()=>{
              setToasts(prev=>prev.filter(t=>t.id!==toast.id));
              openTask(toast.taskId, toast.type==="message"?"messages":"updates");
              setView("list");
            }}
            style={{padding:"10px 12px",cursor:"pointer"}}
            onMouseEnter={e=>e.currentTarget.style.background=toast.urgent?"#fff0f0":"#f8fafc"}
            onMouseLeave={e=>e.currentTarget.style.background=""}
          >
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:toast.urgent?"#dc2626":"#0f2557",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10,fontWeight:800,flexShrink:0}}>
                {toast.authorName.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
              </div>
              <div style={{fontSize:12,fontWeight:800,color:"#0f2557"}}>{toast.authorName}</div>
            </div>
            {toast.taskRef&&<div style={{fontSize:10,color:"#c9a227",fontWeight:700,marginBottom:3}}>
              {toast.taskRef}<span style={{color:"#94a3b8",fontWeight:400,marginLeft:4}}>· {toast.taskName.slice(0,35)}{toast.taskName.length>35?"…":""}</span>
            </div>}
            {toast.text&&<div style={{fontSize:12,color:"#374151",lineHeight:1.45,marginBottom:4,background:"#f8fafc",borderRadius:6,padding:"5px 8px",borderLeft:"3px solid #0f2557"}}>
              {toast.text.slice(0,100)}{toast.text.length>100?"…":""}
            </div>}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:9,color:"#94a3b8"}}>{fmtDT(toast.timestamp)}</div>
              <div style={{fontSize:9,color:toast.type==="message"?"#1e40af":"#166534",fontWeight:700,background:toast.type==="message"?"#dbeafe":"#dcfce7",borderRadius:4,padding:"2px 6px"}}>
                {toast.type==="message"?"→ Reply in Chat":"→ View Updates"}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    <style>{`
      @keyframes slideInRight {
        from { transform: translateX(120%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `}</style>

    <div style={{textAlign:"center",padding:"14px 0 22px",fontSize:10,color:"#94a3b8"}}>
      TKJ Project Management Sdn Bhd (1676211-U) · {new Date().toLocaleDateString("en-MY",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})} · {currentUser.name} {myMoodObj?myMoodObj.emoji:""} · ☁️ Cloud Sync
    </div>
  </div>;
}

export default App
