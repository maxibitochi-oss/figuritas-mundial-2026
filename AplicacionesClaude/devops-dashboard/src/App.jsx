import { useState, useEffect, useCallback, useRef } from "react";

const ORG = "atioint";
async function getApiBase() {
  if (window.electronAPI?.isElectron) {
    const port = await window.electronAPI.getProxyPort();
    return `http://127.0.0.1:${port}`;
  }
  return "/azdo";
}
let _apiBase = "/azdo";
getApiBase().then(b => { _apiBase = b; });

const TASK_TYPES    = ["Task","Bug","Defect","Test","Improvement","Management","Support","Task AI","Issue"];
const US_TYPES      = ["User Story","Feature"];
const EPIC_COLORS   = ["#7C3AED","#0369A1","#0F766E","#B45309","#9D174D","#1D4ED8","#047857","#B91C1C","#6D28D9","#0E7490","#92400E","#065F46"];
const epicColor     = idx => EPIC_COLORS[idx % EPIC_COLORS.length];
const typeIcon      = {"Task":"☰","User Story":"◈","Bug":"⬡","Feature":"◆","Epic":"◉","Issue":"△","Defect":"⬡","Test":"✦","Improvement":"↑","Management":"⊞","Support":"◎","Task AI":"⬡"};
const stateColors   = {"Active":"#3B82F6","In Progress":"#3B82F6","Committed":"#F59E0B","Resolved":"#10B981","Closed":"#10B981","Done":"#10B981","New":"#6B7280","To Do":"#6B7280","Blocked":"#EF4444","In Review":"#F59E0B","Warranty":"#A78BFA"};
const DONE_STATES   = ["Resolved","Closed","Done"];
const ACTIVE_STATES = ["Active","In Progress","Committed"];
const WARRANTY_STATES = ["Warranty","Closed","Done","Resolved"];
const fmt = h => h > 0 ? `${Math.round(h)}h` : "—";

// ── UI primitives ─────────────────────────────────────────────────────────────
function Avatar({ name, size=28, colorIdx=0 }) {
  const colors=[["#DBEAFE","#1E40AF"],["#D1FAE5","#065F46"],["#FEF3C7","#92400E"],["#FCE7F3","#9D174D"],["#EDE9FE","#5B21B6"],["#FEE2E2","#991B1B"]];
  const [bg,fg]=colors[colorIdx%colors.length];
  const ini=name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.35,fontWeight:600,flexShrink:0}}>{ini}</div>;
}
function StatusBadge({ state }) {
  const col=stateColors[state]||"#6B7280";
  return <span style={{background:col+"22",color:col,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap"}}>{state}</span>;
}
function Spinner({ text="Consultando Azure DevOps…" }) {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"3rem",gap:12,color:"#6B7280"}}><div style={{width:20,height:20,border:"2px solid #334155",borderTopColor:"#3B82F6",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><span style={{fontSize:14}}>{text}</span></div>;
}
function MetricCard({ label, value, sub, color="#F9FAFB" }) {
  return <div style={{background:"#1E293B",borderRadius:12,padding:"1rem",border:"1px solid #334155"}}><div style={{fontSize:12,color:"#9CA3AF",marginBottom:4,fontWeight:500}}>{label}</div><div style={{fontSize:22,fontWeight:700,color,letterSpacing:"-0.02em"}}>{value}</div>{sub&&<div style={{fontSize:11,color:"#4B5563",marginTop:2}}>{sub}</div>}</div>;
}
function ProgressBar({ pct, color="#3B82F6", height=5 }) {
  return <div style={{height,background:"#334155",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,pct)}%`,background:color,borderRadius:3,transition:"width .5s ease"}}/></div>;
}

// ── Burndown (snapshot-based: uses current state + iteration) ─────────────────
function BurndownChart({ iterMap, iterOrder, compact=false }) {
  const [selIter, setSelIter] = useState(iterOrder[0]||"");
  const items = iterMap[selIter]||[];
  const total = items.length;
  const done  = items.filter(i=>DONE_STATES.includes(i.state)).length;
  const remaining = total - done;
  const pctDone = total>0?Math.round(done/total*100):0;
  const pts=10;
  const W=560, H=compact?80:130, PAD={t:10,r:12,b:compact?18:28,l:32};
  const iW=W-PAD.l-PAD.r, iH=H-PAD.t-PAD.b;
  const xScale = i => PAD.l + (i/pts)*iW;
  const yScale = v => PAD.t + iH - (total>0?(v/total)*iH:0);
  const idealPts = Array.from({length:pts+1},(_,i)=>total-(total/pts)*i);
  const idealPath = idealPts.map((v,i)=>`${i===0?"M":"L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
  const actualPath = `M${xScale(0).toFixed(1)},${yScale(total).toFixed(1)} L${xScale(pts).toFixed(1)},${yScale(remaining).toFixed(1)}`;
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:compact?6:12,flexWrap:"wrap"}}>
        <div style={{fontSize:compact?12:13,fontWeight:600,color:"#9CA3AF"}}>Burndown por sprint</div>
        <select value={selIter} onChange={e=>setSelIter(e.target.value)}
          style={{background:"#0F172A",border:"1px solid #334155",color:"#E2E8F0",borderRadius:8,padding:"4px 10px",fontSize:11,marginLeft:"auto"}}>
          {iterOrder.map(k=><option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div style={{display:"flex",gap:compact?4:8,marginBottom:compact?6:12}}>
        {[["Total",total,"#F9FAFB"],["Hechas",done,"#22C55E"],["Restantes",remaining,remaining>0?"#F59E0B":"#22C55E"],["Avance",`${pctDone}%`,"#3B82F6"]].map(([l,v,c])=>(
          <div key={l} style={{flex:1,background:"#0F172A",borderRadius:8,padding:compact?"4px 6px":"6px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#4B5563"}}>{l}</div>
            <div style={{fontSize:compact?13:16,fontWeight:700,color:c}}>{v}</div>
          </div>
        ))}
      </div>
      {total>0?(
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
          {(compact?[0,.5,1]:[0,.25,.5,.75,1]).map(f=>{const y=yScale(total*f);return <g key={f}><line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke="#1E293B" strokeWidth="1"/><text x={PAD.l-4} y={y+4} textAnchor="end" fill="#4B5563" fontSize="7">{Math.round(total*f)}</text></g>;})}
          {(compact?[0,5,10]:[0,2,4,6,8,10]).map(i=><text key={i} x={xScale(i)} y={H-4} textAnchor="middle" fill="#4B5563" fontSize="7">D{i}</text>)}
          <path d={idealPath} fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3" opacity=".6"/>
          <path d={actualPath} fill="none" stroke="#22C55E" strokeWidth="2"/>
          <path d={`${actualPath} L${xScale(pts).toFixed(1)},${yScale(0).toFixed(1)} L${xScale(0).toFixed(1)},${yScale(0).toFixed(1)} Z`} fill="#22C55E" opacity=".08"/>
          <circle cx={xScale(0)} cy={yScale(total)} r="3" fill="#22C55E"/>
          <circle cx={xScale(pts)} cy={yScale(remaining)} r="4" fill="#22C55E" stroke="#0F172A" strokeWidth="1.5"/>
          <text x={xScale(pts)+6} y={yScale(remaining)+4} fill="#22C55E" fontSize="8" fontWeight="bold">{remaining}</text>
        </svg>
      ):<div style={{textAlign:"center",color:"#4B5563",fontSize:12,padding:"16px 0"}}>Sin tareas en esta iteración</div>}
      {!compact&&<div style={{display:"flex",gap:14,fontSize:10,color:"#4B5563",marginTop:4}}>
        <span><svg width="16" height="6" style={{verticalAlign:"middle",marginRight:3}}><line x1="0" y1="3" x2="16" y2="3" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3"/></svg>Ideal</span>
        <span><svg width="16" height="6" style={{verticalAlign:"middle",marginRight:3}}><line x1="0" y1="3" x2="16" y2="3" stroke="#22C55E" strokeWidth="2"/></svg>Real</span>
      </div>}
    </div>
  );
}


// ── Project selector panel ────────────────────────────────────────────────────
function ProjectSelectorPanel({ projects, selected, onConfirm }) {
  const [sel, setSel] = useState(selected.length?selected:projects.map(p=>p.id));
  const toggle = id => setSel(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  return (
    <div style={{minHeight:"100vh",background:"#0F172A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:"2rem"}}>
      <div style={{maxWidth:560,width:"100%"}}>
        <div style={{marginBottom:"1.5rem"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(124,58,237,0.15)",border:"1px solid rgba(124,58,237,0.3)",borderRadius:8,padding:"4px 12px",marginBottom:12}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#7C3AED"}}/>
            <span style={{fontSize:12,color:"#C4B5FD",fontWeight:600,letterSpacing:"0.06em"}}>SELECCIÓN DE PROYECTOS</span>
          </div>
          <h1 style={{color:"#F9FAFB",fontSize:24,fontWeight:700,margin:"0 0 6px",letterSpacing:"-0.03em"}}>¿Qué proyectos querés ver?</h1>
          <p style={{color:"#6B7280",fontSize:13,margin:0}}>Seleccioná uno o más proyectos. Podés cambiarlo en cualquier momento.</p>
        </div>
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1rem",marginBottom:14,maxHeight:360,overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,padding:"0 4px"}}>
            <button onClick={()=>setSel(projects.map(p=>p.id))} style={{fontSize:12,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",padding:0}}>Todos</button>
            <button onClick={()=>setSel([])} style={{fontSize:12,color:"#6B7280",background:"none",border:"none",cursor:"pointer",padding:0}}>Ninguno</button>
          </div>
          {projects.map(p=>{
            const active=sel.includes(p.id);
            return (
              <div key={p.id} onClick={()=>toggle(p.id)} style={{
                display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,marginBottom:4,
                background:active?"rgba(59,130,246,0.1)":"transparent",
                border:active?"1px solid rgba(59,130,246,0.3)":"1px solid transparent",
                cursor:"pointer",userSelect:"none",transition:"all .15s"
              }}>
                <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${active?"#3B82F6":"#334155"}`,background:active?"#3B82F6":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                  {active&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:500,color:active?"#F9FAFB":"#9CA3AF"}}>{p.name}</div>
                  {p.description&&<div style={{fontSize:11,color:"#4B5563",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.description}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <button disabled={sel.length===0} onClick={()=>onConfirm(sel)} style={{
          width:"100%",background:sel.length?"#3B82F6":"#1E3A5F",border:"none",borderRadius:10,padding:"12px",
          color:sel.length?"#fff":"#4B5563",fontSize:14,fontWeight:600,cursor:sel.length?"pointer":"default"
        }}>
          {sel.length===0?"Seleccioná al menos un proyecto":`Continuar con ${sel.length} proyecto${sel.length>1?"s":""} →`}
        </button>
      </div>
    </div>
  );
}

// ── Role classifier panel ─────────────────────────────────────────────────────
function RoleClassifierModal({ people, roles, onSave, onClose }) {
  const [local, setLocal] = useState({...roles});
  const ROLE_OPTIONS = ["Desarrollo","QA","Management","Otro"];
  const ROLE_COLORS  = {"Desarrollo":"#3B82F6","QA":"#22C55E","Management":"#F59E0B","Otro":"#6B7280"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"1rem"}}>
      <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1.5rem",maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:15,fontWeight:600,color:"#F9FAFB"}}>Clasificar personas por rol</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6B7280",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{fontSize:12,color:"#4B5563",marginBottom:14}}>Asignaciones guardadas en el browser (localStorage).</div>
        {people.map((person,idx)=>(
          <div key={person.name} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"8px 10px",background:"#0F172A",borderRadius:8}}>
            <Avatar name={person.name} size={28} colorIdx={idx}/>
            <span style={{flex:1,fontSize:13,color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{person.name}</span>
            <div style={{display:"flex",gap:4}}>
              {ROLE_OPTIONS.map(r=>(
                <button key={r} onClick={()=>setLocal(prev=>({...prev,[person.name]:r}))} style={{
                  fontSize:11,padding:"3px 8px",borderRadius:20,border:"1px solid",cursor:"pointer",fontWeight:500,
                  background:local[person.name]===r?ROLE_COLORS[r]+"33":"transparent",
                  color:local[person.name]===r?ROLE_COLORS[r]:"#6B7280",
                  borderColor:local[person.name]===r?ROLE_COLORS[r]:"#334155"
                }}>{r}</button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={()=>{onSave(local);onClose();}} style={{
          width:"100%",background:"#3B82F6",border:"none",borderRadius:8,padding:"10px",
          color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",marginTop:8
        }}>Guardar clasificaciones</button>
      </div>
    </div>
  );
}

// ── EpicGroup with US sub-grouping ────────────────────────────────────────────
function EpicGroup({ epic, tasks, usMap, epicIdx, people, isOpen, onToggle, onMoveUp, onMoveDown, canMoveUp, canMoveDown, epicState, createdDate, isMoving }) {
  const [openUS, setOpenUS] = useState({});
  const done    = tasks.filter(i=>DONE_STATES.includes(i.state)).length;
  const active  = tasks.filter(i=>ACTIVE_STATES.includes(i.state)).length;
  const blocked = tasks.filter(i=>i.state==="Blocked").length;
  const pct     = tasks.length?Math.round(done/tasks.length*100):0;
  const totalComp = Math.round(tasks.reduce((s,i)=>s+i.completed,0));
  const totalEst  = Math.round(tasks.reduce((s,i)=>s+i.estimated,0));
  const color   = epic==="Sin épica"?"#6B7280":epicColor(epicIdx);
  const ss = {
    "Active":  {bg:"rgba(59,130,246,0.15)",c:"#93C5FD"},
    "Blocked": {bg:"rgba(239,68,68,0.15)", c:"#FCA5A5"},
    "Done":    {bg:"rgba(34,197,94,0.15)", c:"#86EFAC"},
    "Warranty":{bg:"rgba(167,139,250,0.15)",c:"#C4B5FD"},
    "New":     {bg:"rgba(107,114,128,0.15)",c:"#9CA3AF"},
    "Empty":   {bg:"rgba(107,114,128,0.1)", c:"#6B7280"},
  }[epicState]||{bg:"rgba(107,114,128,0.15)",c:"#9CA3AF"};

  // Group tasks by US parent title; tasks without US go to "Sin US"
  const usGroups = {};
  const noUS = [];
  tasks.forEach(t=>{
    if(t.usTitle) {
      if(!usGroups[t.usTitle]) usGroups[t.usTitle]=[];
      usGroups[t.usTitle].push(t);
    } else {
      noUS.push(t);
    }
  });

  const renderTaskRow = (item, ri) => (
    <tr key={item.id} style={{borderBottom:"1px solid #1E293B",background:ri%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
      <td style={{padding:"7px 14px",color:"#4B5563",fontFamily:"monospace",fontSize:11}}>{item.id}</td>
      <td style={{padding:"7px 14px",color:"#6B7280",fontSize:12,whiteSpace:"nowrap"}}>{typeIcon[item.type]||"○"} {item.type}</td>
      <td style={{padding:"7px 14px",maxWidth:260}}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#E2E8F0"}}>{item.title}</div></td>
      <td style={{padding:"7px 14px",whiteSpace:"nowrap"}}><StatusBadge state={item.state}/></td>
      <td style={{padding:"7px 14px",whiteSpace:"nowrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <Avatar name={item.assignedTo} size={20} colorIdx={people.findIndex(p=>p.name===item.assignedTo)}/>
          <span style={{color:"#9CA3AF",fontSize:12,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis"}}>{item.assignedTo}</span>
        </div>
      </td>
      <td style={{padding:"7px 14px",color:"#6B7280",textAlign:"right",fontFamily:"monospace"}}>{item.estimated>0?item.estimated:"—"}</td>
      <td style={{padding:"7px 14px",color:item.completed>item.estimated&&item.estimated>0?"#EF4444":"#10B981",textAlign:"right",fontFamily:"monospace"}}>{item.completed>0?item.completed:"—"}</td>
    </tr>
  );

  return (
    <div style={{marginBottom:8,border:`1px solid ${isMoving?"#3B82F6":"#334155"}`,borderRadius:14,overflow:"hidden",transition:"border-color .3s",boxShadow:isMoving?"0 0 0 2px rgba(59,130,246,0.3)":"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:0,background:"#1E293B"}}>
        <div style={{display:"flex",flexDirection:"column",gap:1,padding:"0 4px",flexShrink:0}}>
          <button onClick={e=>{e.stopPropagation();onMoveUp();}} disabled={!canMoveUp}
            title="Mover arriba"
            style={{background:canMoveUp?"rgba(59,130,246,0.15)":"transparent",border:`1px solid ${canMoveUp?"rgba(59,130,246,0.4)":"#334155"}`,borderRadius:4,cursor:canMoveUp?"pointer":"default",color:canMoveUp?"#93C5FD":"#334155",fontSize:11,padding:"3px 5px",lineHeight:1,transition:"all .15s"}}>▲</button>
          <button onClick={e=>{e.stopPropagation();onMoveDown();}} disabled={!canMoveDown}
            title="Mover abajo"
            style={{background:canMoveDown?"rgba(59,130,246,0.15)":"transparent",border:`1px solid ${canMoveDown?"rgba(59,130,246,0.4)":"#334155"}`,borderRadius:4,cursor:canMoveDown?"pointer":"default",color:canMoveDown?"#93C5FD":"#334155",fontSize:11,padding:"3px 5px",lineHeight:1,transition:"all .15s"}}>▼</button>
        </div>
        <div onClick={onToggle} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px 12px 6px",cursor:"pointer",userSelect:"none",flex:1,minWidth:0}}>
          <div style={{width:4,alignSelf:"stretch",borderRadius:2,background:color,flexShrink:0}}/>
          <div style={{fontSize:15,opacity:0.7,flexShrink:0,color}}>{epic==="Sin épica"?"○":"◉"}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontWeight:600,fontSize:14,color:"#F9FAFB"}}>{epic}</span>
              <span style={{fontSize:11,background:ss.bg,color:ss.c,padding:"2px 8px",borderRadius:20,fontWeight:600}}>{epicState}</span>
              <span style={{fontSize:11,color,background:`${color}22`,padding:"2px 8px",borderRadius:20,fontWeight:600}}>{tasks.length} tareas</span>
              {blocked>0&&<span style={{fontSize:11,color:"#EF4444",background:"rgba(239,68,68,0.1)",padding:"2px 8px",borderRadius:20,fontWeight:600}}>⚠ {blocked} bloq.</span>}
              {createdDate&&<span style={{fontSize:10,color:"#4B5563",marginLeft:4}}>creada {new Date(createdDate).toLocaleDateString("es-AR")}</span>}
            </div>
            <div style={{marginTop:6,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{width:120}}><ProgressBar pct={pct} color={color}/></div>
              <span style={{fontSize:11,color:"#6B7280"}}>{pct}% · {done} hechos · {active} activos</span>
              <span style={{fontSize:11,color:"#9CA3AF",marginLeft:"auto"}}>
                <span style={{color:totalComp>0?"#22C55E":"#4B5563",fontWeight:600}}>{fmt(totalComp)}</span>
                <span style={{color:"#4B5563"}}> / {fmt(totalEst)} est.</span>
              </span>
            </div>
          </div>
          <div style={{fontSize:16,color:"#4B5563",transform:isOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform .2s",flexShrink:0,marginLeft:8}}>›</div>
        </div>
      </div>

      {isOpen&&(
        <div style={{background:"#0F172A"}}>
          {/* US groups */}
          {Object.entries(usGroups).map(([usTitle, usTasks])=>{
            const usOpen = openUS[usTitle]!==false; // default open
            const usComp = Math.round(usTasks.reduce((s,i)=>s+i.completed,0));
            const usDone = usTasks.filter(i=>DONE_STATES.includes(i.state)).length;
            const usPct  = usTasks.length?Math.round(usDone/usTasks.length*100):0;
            return (
              <div key={usTitle}>
                <div onClick={()=>setOpenUS(p=>({...p,[usTitle]:!usOpen}))}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",background:"rgba(255,255,255,0.03)",borderBottom:"1px solid #1E293B",cursor:"pointer",userSelect:"none"}}>
                  <span style={{fontSize:13,color:"#C4B5FD"}}>◈</span>
                  <span style={{fontSize:12,fontWeight:600,color:"#C4B5FD",flex:1}}>{usTitle}</span>
                  <span style={{fontSize:11,color:"#6B7280"}}>{usTasks.length} tareas</span>
                  <span style={{fontSize:11,color:"#22C55E",fontWeight:600,marginLeft:8}}>{fmt(usComp)}</span>
                  <span style={{fontSize:11,color:"#6B7280",marginLeft:8}}>{usPct}%</span>
                  <span style={{fontSize:14,color:"#4B5563",marginLeft:8,transform:usOpen?"rotate(90deg)":"none",transition:"transform .2s"}}>›</span>
                </div>
                {usOpen&&(
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead><tr style={{borderBottom:"1px solid #1E293B"}}>
                        {["#","Tipo","Título","Estado","Asignado","Effort","Hs. comp"].map(h=>(
                          <th key={h} style={{padding:"7px 14px",textAlign:"left",fontSize:10,color:"#4B5563",fontWeight:600,letterSpacing:".05em",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>{usTasks.map((t,ri)=>renderTaskRow(t,ri))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {/* Tasks without US */}
          {noUS.length>0&&(
            <div>
              {Object.keys(usGroups).length>0&&(
                <div style={{padding:"7px 16px",background:"rgba(255,255,255,0.02)",borderBottom:"1px solid #1E293B"}}>
                  <span style={{fontSize:11,color:"#4B5563",fontWeight:600}}>Sin User Story</span>
                  <span style={{fontSize:11,color:"#4B5563",marginLeft:8}}>{noUS.length} tareas</span>
                </div>
              )}
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  {Object.keys(usGroups).length===0&&<thead><tr style={{borderBottom:"1px solid #1E293B"}}>
                    {["#","Tipo","Título","Estado","Asignado","Effort","Hs. comp"].map(h=>(
                      <th key={h} style={{padding:"7px 14px",textAlign:"left",fontSize:10,color:"#4B5563",fontWeight:600,letterSpacing:".05em",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>}
                  <tbody>{noUS.map((t,ri)=>renderTaskRow(t,ri))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
// ── AtioneView ────────────────────────────────────────────────────────────────
const ATIONET_PROJECT = "Ationet";   // exact project name in Azure DevOps
const ATIONET_QA_TYPES = ["Test","Management","Support"];

function AtioneView({ allProjects, pat, roles, onSaveRoles, onClose }) {
  const [activeTab, setActiveTab]         = useState(0);
  const [items, setItems]                 = useState([]);
  const [loading, setLoading]             = useState(false);
  const [loadingMsg, setLoadingMsg]       = useState("");
  const [error, setError]                 = useState(null);
  const [sprint, setSprint]               = useState("");
  const [expandPerson, setExpandPerson]   = useState(null);
  const [lastRefresh, setLastRefresh]     = useState(null);
  const [showRoles, setShowRoles]         = useState(false);
  const [itemIndex, setItemIndex]         = useState([]);
  const [sprintLoading, setSprintLoading] = useState(false);
  const [assignedItems, setAssignedItems] = useState([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [testStateFilter, setTestStateFilter] = useState("");
  // Tab 1 filters
  const [asgTypeFilter, setAsgTypeFilter]       = useState("");
  const [asgStateFilter, setAsgStateFilter]     = useState("");
  const [asgSevFilter, setAsgSevFilter]         = useState("");
  const [asgTsFilter, setAsgTsFilter]           = useState("");
  // Tab 2 filters
  const [bugsStateFilter, setBugsStateFilter]   = useState("");
  const [bugsSevFilter, setBugsSevFilter]       = useState("");
  const [bugsTsFilter, setBugsTsFilter]         = useState("");
  // Tab 3 filters
  const [defsStateFilter, setDefsStateFilter]   = useState("");
  const [defsSevFilter, setDefsSevFilter]       = useState("");
  const [defsTsFilter, setDefsTsFilter]         = useState("");
  const [reportedBugs, setReportedBugs]   = useState([]);
  const [reportedDefects, setReportedDefects] = useState([]);
  const [reportedLoading, setReportedLoading] = useState(false);

  // Find the Ationet project
  const ationeProj = allProjects.find(p =>
    p.name === ATIONET_PROJECT ||
    p.name.toLowerCase() === "ationet" ||
    p.name.toLowerCase().includes("ationet")
  );

  const makeHeaders = useCallback(() => ({
    "Content-Type":"application/json",
    "Authorization":"Basic "+btoa(":"+pat)
  }),[pat]);

  // Extract sprint key from iteration path — supports AN_YYYYMMDD and Sxx formats
  const extractSprint = path => {
    if(!path) return null;
    const parts = path.split("\\");
    const last = parts[parts.length-1].trim();
    if(/^AN_\d{8}$/.test(last)) return last;
    const m = last.match(/[Ss]\s*(\d+)/);
    return m ? `S${m[1]}` : (last || null);
  };

  // Sort AN_ sprints by date descending
  const sortSprints = labels => [...labels].sort((a,b)=>{
    const anA = a.match(/^AN_(\d{8})$/);
    const anB = b.match(/^AN_(\d{8})$/);
    if(anA && anB) return parseInt(anB[1],10) - parseInt(anA[1],10);
    return b.localeCompare(a);
  });

  const isAtioneSprint = s => /^AN_\d{8}$/.test(s);

  const findCurrentSprint = (labels) => {
    if(!labels.length) return "";
    const today = new Date(); today.setHours(0,0,0,0);
    return [...labels].reverse().find(s=>{
      const m=s.match(/^AN_(\d{4})(\d{2})(\d{2})$/);
      if(!m) return false;
      return new Date(+m[1],+m[2]-1,+m[3]) >= today;
    }) || labels[0];
  };

  // Format AN_YYYYMMDD → "AN 12/06/2026" for display
  const formatSprint = s => {
    const m = s.match(/^AN_(\d{4})(\d{2})(\d{2})$/);
    if(m) return `AN ${m[3]}/${m[2]}/${m[1]}`;
    return s;
  };

  const sel={background:"#1E293B",border:"1px solid #334155",color:"#E2E8F0",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"};
  const ROLE_COLORS={"Desarrollo":"#3B82F6","QA":"#22C55E","Management":"#F59E0B","Otro":"#6B7280"};

  // Sprint labels from index
  const sprintLabels = sortSprints([...new Set(itemIndex.filter(i=>ATIONET_QA_TYPES.includes(i.type)).map(i=>extractSprint(i.iteration)).filter(s=>s&&isAtioneSprint(s)))]);

  // ── Phase 1: get lightweight index ──────────────────────────────────────────
  const fetchIndex = useCallback(async () => {
    if(!ationeProj) { setError("No se encontró el proyecto Ationet."); return; }
    setLoading(true); setError(null); setItems([]); setItemIndex([]);
    let _apiBase = "/azdo";
    if(window.electronAPI?.isElectron){ const port=await window.electronAPI.getProxyPort(); _apiBase=`http://127.0.0.1:${port}`; }
    try {
      const TYPES = ['Test','Management','Support','Bug','Defect'];
      setLoadingMsg("Obteniendo sprints…");
      const idxFields = "System.Id,System.IterationPath,System.WorkItemType,System.AssignedTo";
      const allIdSets = await Promise.all(TYPES.map(async wtype => {
        const body = { query: `SELECT [System.Id] FROM WorkItems WHERE [System.IsDeleted] = False AND [System.WorkItemType] = '${wtype}' ORDER BY [System.Id] ASC` };
        const wr = await fetch(`${_apiBase}/${encodeURIComponent(ationeProj.name)}/_apis/wit/wiql?api-version=7.0`,
          { method:"POST", headers:makeHeaders(), body:JSON.stringify(body) });
        if(!wr.ok){ const t=await wr.text().catch(()=>""); throw new Error(`WIQL error ${wr.status}${t?": "+t.slice(0,120):""}`); }
        const d = await wr.json();
        return (d.workItems||[]).map(i=>i.id);
      }));
      const allIds = [...new Set(allIdSets.flat())];
      const index = [];
      for(let i=0;i<allIds.length;i+=200){
        const batch=allIds.slice(i,i+200);
        setLoadingMsg(`Indexando… ${Math.min(i+200,allIds.length)}/${allIds.length}`);
        const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${idxFields}&api-version=7.0`,{headers:makeHeaders()});
        if(r.ok){ const d=await r.json(); (d.value||[]).forEach(wi=>index.push({id:wi.fields["System.Id"],iteration:wi.fields["System.IterationPath"]||"",type:wi.fields["System.WorkItemType"],assignedTo:wi.fields["System.AssignedTo"]?.displayName||""})); }
      }
      setItemIndex(index);
      setLastRefresh(new Date());
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); setLoadingMsg(""); }
  },[ationeProj, makeHeaders]);

  // ── fetchSprintItems: QA tasks for tab 0 ────────────────────────────────────
  const fetchSprintItems = useCallback(async (sprintKey, idx) => {
    if(!ationeProj||!sprintKey||!idx.length) return;
    const sprintIds = idx.filter(i=>ATIONET_QA_TYPES.includes(i.type)&&extractSprint(i.iteration)===sprintKey).map(i=>i.id);
    if(!sprintIds.length){ setItems([]); return; }
    setSprintLoading(true);
    let _apiBase = "/azdo";
    if(window.electronAPI?.isElectron){ const port=await window.electronAPI.getProxyPort(); _apiBase=`http://127.0.0.1:${port}`; }
    const fields = ["System.Id","System.Title","System.State","System.AssignedTo","System.WorkItemType","System.Tags","Microsoft.VSTS.Scheduling.Effort","Microsoft.VSTS.Scheduling.CompletedWork","System.IterationPath","System.Parent"].join(",");
    try {
      const allRaw=[];
      for(let i=0;i<sprintIds.length;i+=200){
        const batch=sprintIds.slice(i,i+200);
        const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${fields}&api-version=7.0`,{headers:makeHeaders()});
        if(r.ok){const d=await r.json();allRaw.push(...(d.value||[]));}
      }
      const mapped=allRaw.map(wi=>({
        id:wi.fields["System.Id"], title:wi.fields["System.Title"],
        state:wi.fields["System.State"]||"New", type:wi.fields["System.WorkItemType"],
        assignedTo:wi.fields["System.AssignedTo"]?.displayName||"Sin asignar",
        tags:wi.fields["System.Tags"]||"",
        estimated:wi.fields["Microsoft.VSTS.Scheduling.Effort"]||0,
        completed:wi.fields["Microsoft.VSTS.Scheduling.CompletedWork"]||0,
        iteration:wi.fields["System.IterationPath"]||"",
        parent:wi.fields["System.Parent"]||null, parentTitle:"",
      }));
      // Resolve parent titles
      const parentIds=[...new Set(mapped.map(i=>i.parent).filter(Boolean))];
      if(parentIds.length){
        const parentMap={};
        for(let i=0;i<parentIds.length;i+=200){
          const batch=parentIds.slice(i,i+200);
          const r2=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${batch.join(",")}&fields=System.Id,System.Title&api-version=7.0`,{headers:makeHeaders()});
          if(r2.ok){const d2=await r2.json();(d2.value||[]).forEach(wi=>parentMap[wi.fields["System.Id"]]=wi.fields["System.Title"]);}
        }
        mapped.forEach(i=>{ if(i.parent) i.parentTitle=parentMap[i.parent]||""; });
      }
      setItems(mapped);
    } catch(e){ console.error(e); }
    finally{ setSprintLoading(false); }
  },[ationeProj, makeHeaders]);

  // ── fetchAssigned: Bug+Defect by iteration for tab 1 ────────────────────────
  const fetchAssigned = useCallback(async (sprintKey, idx) => {
    if(!ationeProj||!sprintKey||!idx.length) return;
    const ids = idx.filter(i=>["Bug","Defect"].includes(i.type)&&extractSprint(i.iteration)===sprintKey).map(i=>i.id);
    if(!ids.length){ setAssignedItems([]); return; }
    setAssignedLoading(true);
    let _apiBase = "/azdo";
    if(window.electronAPI?.isElectron){ const port=await window.electronAPI.getProxyPort(); _apiBase=`http://127.0.0.1:${port}`; }
    const fields = "System.Id,System.Title,System.State,System.AssignedTo,System.WorkItemType,System.IterationPath,Custom.TestState,Microsoft.VSTS.Common.Severity";
    try {
      const allRaw=[];
      for(let i=0;i<ids.length;i+=200){
        const batch=ids.slice(i,i+200);
        const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${fields}&api-version=7.0`,{headers:makeHeaders()});
        if(r.ok){const d=await r.json();allRaw.push(...(d.value||[]));}
      }
      setAssignedItems(allRaw.map(wi=>({
        id:wi.fields["System.Id"], title:wi.fields["System.Title"],
        state:wi.fields["System.State"]||"New", type:wi.fields["System.WorkItemType"],
        assignedTo:wi.fields["System.AssignedTo"]?.displayName||"Sin asignar",
        iteration:wi.fields["System.IterationPath"]||"",
        testState:wi.fields["Custom.TestState"]||"",
        severity:wi.fields["Microsoft.VSTS.Common.Severity"]||"",
      })));
    } catch(e){ console.error(e); }
    finally{ setAssignedLoading(false); }
  },[ationeProj, makeHeaders]);

  // ── fetchReported: bugs/defects by createdDate for tabs 2&3 ─────────────────
  const fetchReported = useCallback(async (sprintKey, allSprintLabels) => {
    if(!ationeProj||!sprintKey) return;
    // AN_YYYYMMDD = END date of the sprint
    const parse = s => { const m=s.match(/^AN_(\d{4})(\d{2})(\d{2})$/); return m?new Date(+m[1],+m[2]-1,+m[3]):null; };
    const end = parse(sprintKey);
    if(!end) return;
    // Find previous sprint to compute start = prevSprint.end + 1 day
    const asc = [...allSprintLabels].reverse(); // ascending by date
    const idx = asc.indexOf(sprintKey);
    const prevS = idx > 0 ? asc[idx-1] : null;
    const start = prevS
      ? new Date(parse(prevS).getTime() + 24*60*60*1000)  // prev end + 1 day
      : new Date(end.getTime() - 13*24*60*60*1000);        // fallback: 14 days window
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const startStr = fmt(start);
    const endStr = fmt(end);
    setReportedLoading(true);
    let _apiBase = "/azdo";
    if(window.electronAPI?.isElectron){ const port=await window.electronAPI.getProxyPort(); _apiBase=`http://127.0.0.1:${port}`; }
    const fields = "System.Id,System.Title,System.State,System.AssignedTo,System.WorkItemType,System.CreatedDate,Microsoft.VSTS.Common.Severity,Microsoft.VSTS.Common.Priority,Custom.TestState";
    try {
      const fetchWIQL = async (wtype) => {
        const body = { query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject]='${ationeProj.name}' AND [System.IsDeleted]=False AND [System.WorkItemType]='${wtype}' AND [System.CreatedDate]>='${startStr}' AND [System.CreatedDate]<='${endStr}'` };
        const wr = await fetch(`${_apiBase}/${encodeURIComponent(ationeProj.name)}/_apis/wit/wiql?api-version=7.0`,
          { method:"POST", headers:makeHeaders(), body:JSON.stringify(body) });
        if(!wr.ok) return [];
        const d = await wr.json();
        const ids = (d.workItems||[]).map(i=>i.id);
        if(!ids.length) return [];
        const allRaw=[];
        for(let i=0;i<ids.length;i+=200){
          const batch=ids.slice(i,i+200);
          const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${fields}&api-version=7.0`,{headers:makeHeaders()});
          if(r.ok){const d2=await r.json();allRaw.push(...(d2.value||[]));}
        }
        return allRaw.map(wi=>({
          id:wi.fields["System.Id"], title:wi.fields["System.Title"],
          state:wi.fields["System.State"]||"New", type:wi.fields["System.WorkItemType"],
          assignedTo:wi.fields["System.AssignedTo"]?.displayName||"Sin asignar",
          createdDate:wi.fields["System.CreatedDate"]||"",
          severity:wi.fields["Microsoft.VSTS.Common.Severity"]||"",
          priority:wi.fields["Microsoft.VSTS.Common.Priority"]||99,
          testState:wi.fields["Custom.TestState"]||"",
        }));
      };
      const [bugs, defects] = await Promise.all([fetchWIQL("Bug"), fetchWIQL("Defect")]);
      setReportedBugs(bugs);
      setReportedDefects(defects);
    } catch(e){ console.error(e); }
    finally{ setReportedLoading(false); }
  },[ationeProj, makeHeaders]);

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(()=>{ if(ationeProj&&pat) fetchIndex(); },[ationeProj?.id]);
  useEffect(()=>{ if(sprintLabels.length) setSprint(prev=>prev||findCurrentSprint(sprintLabels)); },[sprintLabels[0]]);
  useEffect(()=>{
    if(sprint&&itemIndex.length){
      fetchSprintItems(sprint, itemIndex);
      fetchAssigned(sprint, itemIndex);
      fetchReported(sprint, sprintLabels);
    }
  },[sprint, itemIndex.length]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const sprintQA = items.filter(i=>ATIONET_QA_TYPES.includes(i.type));
  const sprintDoneQA = sprintQA.filter(i=>DONE_STATES.includes(i.state)).length;

  const peopleMap={};
  sprintQA.forEach(i=>{
    if(!peopleMap[i.assignedTo]) peopleMap[i.assignedTo]={name:i.assignedTo,tasks:0,est:0,comp:0,items:[]};
    peopleMap[i.assignedTo].tasks++;
    peopleMap[i.assignedTo].est+=i.estimated;
    peopleMap[i.assignedTo].comp+=i.completed;
    peopleMap[i.assignedTo].items.push(i);
  });
  const people = Object.values(peopleMap)
    .filter(p=>p.name!=="Sin asignar"&&roles[p.name]==="QA")
    .sort((a,b)=>a.name.localeCompare(b.name));
  const maxComp = Math.max(...people.map(p=>p.comp),1);

  const TEST_STATE_COLORS = {
    "Not Tested":"#6B7280",
    "Test Ok":"#22C55E",
    "Tested with Errors":"#EF4444",
    "Waiting Answer":"#F59E0B",
    "Test Not Required":"#64748B",
  };
  const SEV_COLOR = {"1 - Critical":"#EF4444","2 - High":"#F97316","3 - Medium":"#F59E0B","4 - Low":"#6B7280"};
  const SEV_ORDER = {"1 - Critical":1,"2 - High":2,"3 - Medium":3,"4 - Low":4};

  const applyFilters = (list, {type,state,sev,ts}) => list
    .filter(i=>(!type||i.type===type))
    .filter(i=>(!state||i.state===state))
    .filter(i=>(!sev||i.severity===sev))
    .filter(i=>(!ts||i.testState===ts));

  const filteredAssigned = applyFilters(assignedItems,{type:asgTypeFilter,state:asgStateFilter,sev:asgSevFilter,ts:asgTsFilter});
  const filteredBugs     = applyFilters(reportedBugs, {state:bugsStateFilter,sev:bugsSevFilter,ts:bugsTsFilter});
  const filteredDefects  = applyFilters(reportedDefects,{state:defsStateFilter,sev:defsSevFilter,ts:defsTsFilter});

  const groupBySev = (list) => {
    const g={};
    list.forEach(b=>{ const k=b.severity||"Sin criticidad"; g[k]=(g[k]||[]).concat(b); });
    const ordered=[...["1 - Critical","2 - High","3 - Medium","4 - Low"].filter(s=>g[s]),...Object.keys(g).filter(s=>!["1 - Critical","2 - High","3 - Medium","4 - Low"].includes(s)&&g[s])];
    return ordered.map(k=>({key:k,items:g[k]}));
  };

  const tabLabels = [
    "Horas por agente",
    `Errores asignados (${assignedItems.length})`,
    `Bugs reportados (${reportedBugs.length})`,
    `Defectos (${reportedDefects.length})`,
  ];

  const anyLoading = loading || sprintLoading || assignedLoading || reportedLoading;

  return (
    <div style={{minHeight:"100vh",background:"#0F172A",color:"#F9FAFB",fontFamily:"system-ui,sans-serif",padding:"1.5rem"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}`}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onClose} style={{...sel,color:"#9CA3AF",padding:"5px 10px",fontSize:14}}>← Volver</button>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#22C55E",boxShadow:"0 0 0 3px rgba(34,197,94,.2)"}}/>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:"-0.03em"}}>Ationet QA</span>
          <span style={{fontSize:12,color:"#22C55E",background:"rgba(34,197,94,0.1)",padding:"2px 10px",borderRadius:20}}>{ationeProj?.name||"—"}</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"#4B5563"}}>Sprint:</span>
          <select value={sprint} onChange={e=>setSprint(e.target.value)} style={sel}>
            {sprintLabels.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={fetchIndex} style={sel}>↻ Actualizar</button>
          {lastRefresh&&<span style={{fontSize:11,color:"#4B5563"}}>{lastRefresh.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* Loading bar */}
      {anyLoading&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"0.75rem 0",color:"#6B7280",fontSize:13,marginBottom:8}}>
        <div style={{width:16,height:16,border:"2px solid #334155",borderTopColor:"#22C55E",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
        {loadingMsg||"Cargando…"}
      </div>}

      {/* Error */}
      {error&&<div style={{background:"rgba(220,38,38,0.1)",border:"1px solid rgba(220,38,38,0.3)",borderRadius:10,padding:"1rem",color:"#FCA5A5",marginBottom:12}}>{error}</div>}

      {/* Metrics cards — solo personas con rol QA */}
      {(()=>{
        const qaItems=people.flatMap(p=>p.items);
        const totalComp=Math.round(qaItems.reduce((s,i)=>s+i.completed,0));
        const totalEst=Math.round(qaItems.reduce((s,i)=>s+i.estimated,0));
        const doneQA=qaItems.filter(i=>DONE_STATES.includes(i.state)).length;
        return(
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:"1.25rem"}}>
        {[
          ["Tareas QA",qaItems.length,"#F9FAFB",`sprint ${sprint||""}`],
          ["Completadas",doneQA,"#22C55E",qaItems.length?`${Math.round(doneQA/qaItems.length*100)}%`:"0%"],
          ["Hs. completadas",totalComp>0?`${totalComp}h`:"—","#22C55E",totalEst>0?`de ${totalEst}h estimadas`:"sin estimación"],
          ["Bugs reportados",reportedBugs.length,reportedBugs.length>0?"#F97316":"#22C55E","por fecha creación"],
          ["Defectos",reportedDefects.length,reportedDefects.length>0?"#EF4444":"#22C55E","llegaron a producción"],
        ].map(([l,v,c,s])=>(
          <div key={l} style={{background:"#1E293B",borderRadius:12,padding:"0.85rem",border:"1px solid #334155"}}>
            <div style={{fontSize:11,color:"#9CA3AF",marginBottom:3}}>{l}</div>
            <div style={{fontSize:22,fontWeight:700,color:c}}>{v}</div>
            <div style={{fontSize:10,color:"#4B5563",marginTop:2}}>{s}</div>
          </div>
        ))}
      </div>);})()}

      {/* Tab navigation */}
      <div style={{display:"flex",gap:2,borderBottom:"1px solid #334155",marginBottom:16}}>
        {tabLabels.map((label,i)=>(
          <button key={i} onClick={()=>setActiveTab(i)}
            style={{fontSize:12,padding:"8px 16px",border:"none",borderBottom:activeTab===i?"2px solid #3B82F6":"2px solid transparent",background:"transparent",color:activeTab===i?"#60A5FA":"#6B7280",cursor:"pointer",fontWeight:activeTab===i?600:400,whiteSpace:"nowrap",transition:"color .15s"}}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab 0: Horas por usuario */}
      {activeTab===0&&(
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:"1.25rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <span style={{fontSize:13,fontWeight:600,color:"#9CA3AF"}}>Horas por agente — {sprint||""}</span>
              <span style={{fontSize:11,color:"#4B5563",marginLeft:8}}>Tareas: Test + Management · Solo rol QA</span>
            </div>
            <button onClick={()=>setShowRoles(true)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #334155",background:"#0F172A",color:"#9CA3AF",cursor:"pointer"}}>⚙ Gestión de personas</button>
          </div>
          {sprintLoading&&<div style={{fontSize:12,color:"#4B5563",padding:"1rem 0"}}>Cargando tareas…</div>}
          {!sprintLoading&&people.length===0&&<div style={{fontSize:12,color:"#4B5563",padding:"2rem 0",textAlign:"center"}}>Sin personas con rol QA en este sprint</div>}
          {people.map((person,idx)=>{
            const avatarColors=[["#DBEAFE","#1E40AF"],["#D1FAE5","#065F46"],["#FEF3C7","#92400E"],["#FCE7F3","#9D174D"],["#EDE9FE","#5B21B6"],["#FEE2E2","#991B1B"]];
            const [bg,fg]=avatarColors[idx%avatarColors.length];
            const ini=person.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
            const role=roles[person.name]||"QA";
            const roleColor=ROLE_COLORS[role]||"#22C55E";
            const pctBar=Math.round(person.comp/maxComp*100);
            const pctEst=person.est>0?Math.round(person.comp/person.est*100):null;
            const isExp=expandPerson===person.name;
            return (
              <div key={person.name} style={{borderBottom:"1px solid #0F172A"}}>
                <div onClick={()=>setExpandPerson(isExp?null:person.name)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",cursor:"pointer",userSelect:"none"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,flexShrink:0}}>{ini}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span style={{fontSize:13,color:"#E2E8F0",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{person.name}</span>
                      <span style={{fontSize:10,padding:"1px 6px",borderRadius:10,background:roleColor+"22",color:roleColor,fontWeight:600,flexShrink:0}}>{role}</span>
                      <span style={{fontSize:12,color:"#22C55E",fontWeight:600,marginLeft:"auto",flexShrink:0}}>{Math.round(person.comp)}h</span>
                      {person.est>0&&<span style={{fontSize:11,color:"#4B5563",flexShrink:0}}>/{Math.round(person.est)}h</span>}
                    </div>
                    <div style={{height:5,background:"#334155",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pctBar}%`,background:pctEst&&pctEst>100?"#EF4444":roleColor,borderRadius:3}}/>
                    </div>
                    <div style={{fontSize:10,color:"#4B5563",marginTop:2}}>{person.tasks} tareas{pctEst!==null?` · ${pctEst}% del estimado`:""}</div>
                  </div>
                  <span style={{fontSize:14,color:"#4B5563",transform:isExp?"rotate(90deg)":"none",transition:"transform .2s",flexShrink:0}}>›</span>
                </div>
                {isExp&&(
                  <div style={{background:"#0F172A",borderRadius:8,margin:"0 0 10px",padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:"#4B5563",fontWeight:600,letterSpacing:".06em",marginBottom:8}}>TAREAS DETALLADAS</div>
                    {person.items.map(t=>{
                      const tc={"Test":"#22C55E","Management":"#F59E0B"}[t.type]||"#6B7280";
                      const sc=stateColors[t.state]||"#6B7280";
                      return (
                        <div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid #1E293B"}}>
                          <span style={{fontSize:10,padding:"1px 5px",borderRadius:8,background:tc+"22",color:tc,fontWeight:600,flexShrink:0}}>{t.type}</span>
                          <span style={{fontSize:10,padding:"1px 5px",borderRadius:8,background:sc+"22",color:sc,flexShrink:0}}>{t.state}</span>
                          <span style={{flex:1,fontSize:11,color:"#9CA3AF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</span>
                          {t.parentTitle&&<span style={{fontSize:10,color:"#4B5563",flexShrink:0,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.parentTitle}</span>}
                          <span style={{fontSize:11,color:t.completed>0?"#22C55E":"#4B5563",fontFamily:"monospace",flexShrink:0,fontWeight:t.completed>0?700:400}}>{t.completed>0?`${t.completed}h`:"—"}</span>
                          {t.estimated>0&&<span style={{fontSize:10,color:"#4B5563",fontFamily:"monospace",flexShrink:0}}>/{t.estimated}h</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 1: Errores asignados */}
      {activeTab===1&&(()=>{
        const TS_VALS=["","Not Tested","Test Not Required","Test Ok","Tested with Errors","Waiting Answer"];
        const SEV_VALS=["","1 - Critical","2 - High","3 - Medium","4 - Low"];
        const uniqueStates=[...new Set(assignedItems.map(i=>i.state).filter(Boolean))].sort();
        return(
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:"1.25rem"}}>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,color:"#9CA3AF",marginBottom:8}}>Errores asignados al sprint</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              {assignedLoading&&<div style={{width:12,height:12,border:"2px solid #334155",borderTopColor:"#3B82F6",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>}
              <select value={asgTypeFilter} onChange={e=>setAsgTypeFilter(e.target.value)} style={{...sel,fontSize:11}}>
                <option value="">Tipo: Todos</option>
                <option value="Bug">Bug</option>
                <option value="Defect">Defect</option>
              </select>
              <select value={asgStateFilter} onChange={e=>setAsgStateFilter(e.target.value)} style={{...sel,fontSize:11}}>
                <option value="">Estado: Todos</option>
                {uniqueStates.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={asgSevFilter} onChange={e=>setAsgSevFilter(e.target.value)} style={{...sel,fontSize:11}}>
                <option value="">Criticidad: Todas</option>
                {SEV_VALS.filter(Boolean).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={asgTsFilter} onChange={e=>setAsgTsFilter(e.target.value)} style={{...sel,fontSize:11}}>
                {TS_VALS.map(v=><option key={v} value={v}>{v||"Test State: Todos"}</option>)}
              </select>
              <span style={{fontSize:11,color:"#4B5563"}}>{filteredAssigned.length} / {assignedItems.length}</span>
            </div>
          </div>
          {!assignedLoading&&filteredAssigned.length===0&&<div style={{fontSize:12,color:"#4B5563",padding:"2rem 0",textAlign:"center"}}>Sin resultados</div>}
          <div style={{overflowY:"auto",maxHeight:500}}>
            {filteredAssigned.map(b=>{
              const isDefect=b.type==="Defect";
              const sc=stateColors[b.state]||"#6B7280";
              const tsColor=TEST_STATE_COLORS[b.testState]||"#6B7280";
              const sevC=SEV_COLOR[b.severity]||"";
              return (
                <div key={b.id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 0",borderBottom:"1px solid #0F172A",flexWrap:"nowrap"}}>
                  <span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:isDefect?"rgba(239,68,68,0.15)":"rgba(245,158,11,0.15)",color:isDefect?"#EF4444":"#F59E0B",fontWeight:700,flexShrink:0}}>{isDefect?"DEF":"BUG"}</span>
                  <span style={{fontSize:10,padding:"1px 5px",borderRadius:8,background:sc+"22",color:sc,flexShrink:0}}>{b.state}</span>
                  {b.severity&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:sevC+"22",color:sevC,flexShrink:0}}>{b.severity.replace(/^\d - /,"")}</span>}
                  {b.testState&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:tsColor+"22",color:tsColor,fontWeight:600,flexShrink:0}}>{b.testState}</span>}
                  <span style={{flex:1,fontSize:12,color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</span>
                  <span style={{fontSize:10,color:"#6B7280",flexShrink:0}}>{b.assignedTo.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* Tab 2: Bugs Reportados */}
      {activeTab===2&&(()=>{
        const TS_VALS=["","Not Tested","Test Not Required","Test Ok","Tested with Errors","Waiting Answer"];
        const SEV_VALS=["","1 - Critical","2 - High","3 - Medium","4 - Low"];
        const uniqueStates=[...new Set(reportedBugs.map(i=>i.state).filter(Boolean))].sort();
        return(
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:"1.25rem"}}>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,color:"#9CA3AF",marginBottom:8}}>Bugs reportados en el sprint</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              {reportedLoading&&<div style={{width:12,height:12,border:"2px solid #334155",borderTopColor:"#F97316",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>}
              <select value={bugsStateFilter} onChange={e=>setBugsStateFilter(e.target.value)} style={{...sel,fontSize:11}}>
                <option value="">Estado: Todos</option>
                {uniqueStates.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={bugsSevFilter} onChange={e=>setBugsSevFilter(e.target.value)} style={{...sel,fontSize:11}}>
                <option value="">Criticidad: Todas</option>
                {SEV_VALS.filter(Boolean).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={bugsTsFilter} onChange={e=>setBugsTsFilter(e.target.value)} style={{...sel,fontSize:11}}>
                {TS_VALS.map(v=><option key={v} value={v}>{v||"Test State: Todos"}</option>)}
              </select>
              <span style={{fontSize:11,color:"#4B5563"}}>{filteredBugs.length} / {reportedBugs.length}</span>
            </div>
          </div>
          {!reportedLoading&&filteredBugs.length===0&&<div style={{fontSize:12,color:"#4B5563",padding:"2rem 0",textAlign:"center"}}>Sin bugs reportados en el rango del sprint</div>}
          <div style={{overflowY:"auto",maxHeight:500}}>
            {groupBySev(filteredBugs).map(({key,items:sevItems})=>{
              const sc2=SEV_COLOR[key]||"#6B7280";
              return (
                <div key={key} style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #334155",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:sc2}}>{key}</span>
                    <span style={{fontSize:11,background:sc2+"22",color:sc2,borderRadius:10,padding:"1px 8px",fontWeight:700}}>{sevItems.length}</span>
                  </div>
                  {sevItems.map(b=>{
                    const sc=stateColors[b.state]||"#6B7280";
                    const tsColor=TEST_STATE_COLORS[b.testState]||"";
                    const d=b.createdDate?new Date(b.createdDate).toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"}):null;
                    return (
                      <div key={b.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid #0F172A"}}>
                        <span style={{fontSize:10,padding:"1px 5px",borderRadius:8,background:sc+"22",color:sc,flexShrink:0}}>{b.state}</span>
                        {b.testState&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:tsColor+"22",color:tsColor,flexShrink:0}}>{b.testState}</span>}
                        <span style={{flex:1,fontSize:12,color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</span>
                        <span style={{fontSize:10,color:"#6B7280",flexShrink:0}}>{b.assignedTo.split(" ")[0]}</span>
                        {d&&<span style={{fontSize:10,color:"#4B5563",flexShrink:0}}>{d}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* Tab 3: Defectos */}
      {activeTab===3&&(()=>{
        const TS_VALS=["","Not Tested","Test Not Required","Test Ok","Tested with Errors","Waiting Answer"];
        const SEV_VALS=["","1 - Critical","2 - High","3 - Medium","4 - Low"];
        const uniqueStates=[...new Set(reportedDefects.map(i=>i.state).filter(Boolean))].sort();
        return(
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:"1.25rem"}}>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,color:"#9CA3AF",marginBottom:8}}>Defectos en el sprint</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              {reportedLoading&&<div style={{width:12,height:12,border:"2px solid #334155",borderTopColor:"#EF4444",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>}
              <select value={defsStateFilter} onChange={e=>setDefsStateFilter(e.target.value)} style={{...sel,fontSize:11}}>
                <option value="">Estado: Todos</option>
                {uniqueStates.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={defsSevFilter} onChange={e=>setDefsSevFilter(e.target.value)} style={{...sel,fontSize:11}}>
                <option value="">Criticidad: Todas</option>
                {SEV_VALS.filter(Boolean).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={defsTsFilter} onChange={e=>setDefsTsFilter(e.target.value)} style={{...sel,fontSize:11}}>
                {TS_VALS.map(v=><option key={v} value={v}>{v||"Test State: Todos"}</option>)}
              </select>
              <span style={{fontSize:11,color:"#4B5563"}}>{filteredDefects.length} / {reportedDefects.length}</span>
            </div>
          </div>
          {!reportedLoading&&filteredDefects.length===0&&<div style={{fontSize:12,color:"#4B5563",padding:"2rem 0",textAlign:"center"}}>Sin defectos en el rango del sprint</div>}
          <div style={{overflowY:"auto",maxHeight:500}}>
            {groupBySev(filteredDefects).map(({key,items:sevItems})=>{
              const sc2=SEV_COLOR[key]||"#6B7280";
              return (
                <div key={key} style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #334155",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:sc2}}>{key}</span>
                    <span style={{fontSize:11,background:sc2+"22",color:sc2,borderRadius:10,padding:"1px 8px",fontWeight:700}}>{sevItems.length}</span>
                  </div>
                  {sevItems.map(b=>{
                    const sc=stateColors[b.state]||"#6B7280";
                    const tsColor=TEST_STATE_COLORS[b.testState]||"";
                    const d=b.createdDate?new Date(b.createdDate).toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"}):null;
                    return (
                      <div key={b.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid #0F172A"}}>
                        <span style={{fontSize:10,padding:"2px 6px",borderRadius:8,background:sc+"22",color:sc,fontWeight:600,flexShrink:0}}>{b.state}</span>
                        {b.testState&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:tsColor+"22",color:tsColor,flexShrink:0}}>{b.testState}</span>}
                        <span style={{flex:1,fontSize:12,color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</span>
                        <span style={{fontSize:10,color:"#6B7280",flexShrink:0}}>{b.assignedTo.split(" ")[0]}</span>
                        {d&&<span style={{fontSize:10,color:"#4B5563",flexShrink:0}}>{d}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {!loading&&itemIndex.length===0&&!error&&(
        <div style={{padding:"3rem",textAlign:"center",color:"#4B5563",fontSize:14}}>
          {ationeProj?"Sin datos cargados. Hacé click en ↻ Actualizar.":"No se encontró el proyecto Ationet en los proyectos seleccionados. Verificá que esté en la selección de proyectos."}
        </div>
      )}

      {showRoles&&onSaveRoles&&(
        <RoleClassifierModal
          people={[...new Set(itemIndex.map(i=>i.assignedTo).filter(Boolean))].sort((a,b)=>a.localeCompare(b)).map(n=>({name:n}))}
          roles={roles}
          onSave={r=>{onSaveRoles(r);setShowRoles(false);}}
          onClose={()=>setShowRoles(false)}
        />
      )}
    </div>
  );
}

// ── GlobalView ────────────────────────────────────────────────────────────────
function GlobalView({ allProjects, selectedProjectIds, pat, roles, onClose }) {
  const ROLE_COLORS={"Desarrollo":"#3B82F6","QA":"#22C55E","Management":"#F59E0B","Otro":"#6B7280"};
  const [projectData, setProjectData] = useState({});   // { projectId: { items:[], loading, name } }
  const [globalSprint, setGlobalSprint] = useState("");
  const [openNodes, setOpenNodes] = useState({});        // { key: bool }
  const [loadingAll, setLoadingAll] = useState(false);
  const [filterRole, setFilterRole] = useState("all");
  // QA Ationet integration
  const [iterationMap, setIterationMap]     = useState({});  // { "S14": "AN_20260612" }
  const [iterMapLoading, setIterMapLoading] = useState(false);
  const [qaItemIndex, setQaItemIndex]       = useState([]);  // índice ligero Ationet
  const [qaSprintData, setQaSprintData]     = useState({});  // { anKey: { loading, items[], error } }
  const qaCache = useRef({});

  const makeHeaders = useCallback(() => ({
    "Content-Type":"application/json",
    "Authorization":"Basic "+btoa(":"+pat)
  }),[pat]);

  const fetchProject = useCallback(async(project) => {
    setProjectData(prev=>({...prev,[project.id]:{...prev[project.id],loading:true,name:project.name}}));
    try {
      const detailFields=[
        "System.Id","System.Title","System.State","System.AssignedTo",
        "System.WorkItemType","Microsoft.VSTS.Scheduling.Effort",
        "Microsoft.VSTS.Scheduling.CompletedWork","System.ChangedDate",
        "System.IterationPath","System.Parent"
      ].join(",");
      const wiqlBody={query:`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject]='${project.name}' AND [System.IsDeleted]=False ORDER BY [System.Id] ASC`};
      let _apiBase="/azdo";
      if(window.electronAPI?.isElectron){const port=await window.electronAPI.getProxyPort();_apiBase=`http://127.0.0.1:${port}`;}
      const wr=await fetch(`${_apiBase}/${encodeURIComponent(project.name)}/_apis/wit/wiql?api-version=7.0`,{method:"POST",headers:makeHeaders(),body:JSON.stringify(wiqlBody)});
      if(!wr.ok){setProjectData(prev=>({...prev,[project.id]:{...prev[project.id],loading:false,error:`Error ${wr.status}`}}));return;}
      const wdata=await wr.json();
      const ids=(wdata.workItems||[]).map(i=>i.id);
      if(!ids.length){setProjectData(prev=>({...prev,[project.id]:{items:[],loading:false,name:project.name}}));return;}
      const allRaw=[];
      for(let i=0;i<ids.length;i+=50){
        const batch=ids.slice(i,i+50);
        const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${detailFields}&api-version=7.0`,{headers:makeHeaders()});
        if(r.ok){const d=await r.json();allRaw.push(...(d.value||[]));}
      }
      // Build node map
      const nodeMap={};
      allRaw.forEach(wi=>{nodeMap[wi.id]={id:wi.id,type:wi.fields["System.WorkItemType"],title:wi.fields["System.Title"],state:wi.fields["System.State"]||"New",assignedTo:wi.fields["System.AssignedTo"]?.displayName||"Sin asignar",estimated:wi.fields["Microsoft.VSTS.Scheduling.Effort"]||0,completed:wi.fields["Microsoft.VSTS.Scheduling.CompletedWork"]||0,changed:wi.fields["System.ChangedDate"],iteration:wi.fields["System.IterationPath"]||"",parent:wi.fields["System.Parent"]||null};});
      // Walk ancestors for countable items
      async function resolveChain(parentId){
        let epicTitle="Sin épica",usTitle=null,cursor=parentId;
        const visited=new Set();
        for(let d=0;d<8;d++){
          if(!cursor||visited.has(cursor))break;visited.add(cursor);
          let node=nodeMap[cursor];
          if(!node){try{const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${cursor}&fields=System.Id,System.Title,System.WorkItemType,System.Parent&api-version=7.0`,{headers:makeHeaders()});if(r.ok){const dd=await r.json();(dd.value||[]).forEach(wi=>{nodeMap[wi.id]={id:wi.id,type:wi.fields["System.WorkItemType"],title:wi.fields["System.Title"],parent:wi.fields["System.Parent"]||null};});node=nodeMap[cursor];}}catch(_){}}
          if(!node)break;
          if(node.type==="Epic"){epicTitle=node.title;break;}
          if(["User Story","Feature"].includes(node.type)&&!usTitle)usTitle=node.title;
          cursor=node.parent;
        }
        return{epicTitle,usTitle};
      }
      const cache={};
      const items=[];
      for(const wi of Object.values(nodeMap).filter(n=>TASK_TYPES.includes(n.type))){
        const k=wi.parent;
        if(k&&!cache[k])cache[k]=await resolveChain(k);
        const{epicTitle,usTitle}=k&&cache[k]?cache[k]:{epicTitle:"Sin épica",usTitle:null};
        items.push({...wi,epicTitle,usTitle});
      }
      setProjectData(prev=>({...prev,[project.id]:{items,loading:false,name:project.name}}));
    } catch(e){setProjectData(prev=>({...prev,[project.id]:{...prev[project.id],loading:false,error:e.message}}));}
  },[makeHeaders]);

  const visibleProjects=allProjects.filter(p=>selectedProjectIds.includes(p.id));

  // ── fetchIterationMap: mapea Sxx ↔ AN_YYYYMMDD via finishDate ───────────────
  const fetchIterationMap = useCallback(async () => {
    const ationeProj = allProjects.find(p => p.name === ATIONET_PROJECT || p.name.toLowerCase().includes("ationet"));
    if (!ationeProj) return;
    setIterMapLoading(true);
    let apiBase = "/azdo";
    if (window.electronAPI?.isElectron) { const port = await window.electronAPI.getProxyPort(); apiBase = `http://127.0.0.1:${port}`; }
    try {
      // helper: extrae YYYYMMDD de un ISO string sin conversión de timezone
      const isoToYMD = iso => iso ? iso.substring(0,10).replace(/-/g,"") : null;

      // Recorre árbol de classificationNodes recursivamente y devuelve hojas
      const flattenNodes = (node) => {
        if (!node) return [];
        const children = node.children || [];
        if (!children.length) return [node];
        return children.flatMap(flattenNodes);
      };

      // 1. Obtener TODAS las iteraciones de Ationet via classificationNodes (no requiere suscripción de equipo)
      const anR = await fetch(`${apiBase}/${encodeURIComponent(ationeProj.name)}/_apis/wit/classificationnodes/iterations?$depth=10&api-version=7.0`, { headers: makeHeaders() });
      const anData = anR.ok ? await anR.json() : null;
      const anNodes = anData ? flattenNodes(anData) : [];

      // Extraer sprints AN_YYYYMMDD — la fecha viene del nombre directamente
      const anList = anNodes.reduce((acc, node) => {
        const name = (node.name || "").trim();
        if (/^AN_\d{8}$/.test(name)) {
          acc.push({ key: name, ymd: name.substring(3) }); // "20260612"
        }
        return acc;
      }, []).sort((a,b) => a.ymd.localeCompare(b.ymd)); // ASC por fecha

      // 2. Obtener TODAS las iteraciones de los otros proyectos via classificationNodes
      const sEntries = []; // { key:"S259", num:259, ymd:"20260615"|null }
      await Promise.all(visibleProjects.filter(p => p.id !== ationeProj.id).map(async proj => {
        const r = await fetch(`${apiBase}/${encodeURIComponent(proj.name)}/_apis/wit/classificationnodes/iterations?$depth=10&api-version=7.0`, { headers: makeHeaders() });
        if (!r.ok) return;
        const d = await r.json();
        flattenNodes(d).forEach(node => {
          const m = (node.name || "").match(/[Ss]\s*(\d+)/);
          if (!m) return;
          const num = parseInt(m[1], 10);
          const sKey = `S${num}`;
          if (sEntries.find(e => e.key === sKey)) return;
          const ymd = node.attributes?.finishDate ? isoToYMD(node.attributes.finishDate) : null;
          sEntries.push({ key: sKey, num, ymd });
        });
      }));
      sEntries.sort((a,b) => a.num - b.num); // ASC por número

      const sMap = {};

      // Estrategia A: matching por fecha — AN termina viernes, Sxxx termina lunes (≤4 días de diff)
      if (anList.length && sEntries.some(e => e.ymd)) {
        const finishToAN = {};
        anList.forEach(an => { finishToAN[an.ymd] = an.key; });
        sEntries.forEach(se => {
          if (!se.ymd || sMap[se.key]) return;
          for (let delta = 0; delta <= 4; delta++) {
            for (const sign of [-1, 1]) {
              if (delta === 0 && sign === 1) continue;
              const shifted = delta === 0 ? se.ymd : (() => {
                const d = new Date(`${se.ymd.substring(0,4)}-${se.ymd.substring(4,6)}-${se.ymd.substring(6,8)}T12:00:00Z`);
                d.setUTCDate(d.getUTCDate() + sign * delta);
                return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;
              })();
              if (finishToAN[shifted]) { sMap[se.key] = finishToAN[shifted]; return; }
            }
          }
        });
      }

      // Estrategia B (fallback secuencial): usar el primer Sxxx mapeado como ancla de índice
      if (anList.length && sEntries.length) {
        const firstMapped = sEntries.find(e => sMap[e.key]);
        const offset = firstMapped
          ? anList.findIndex(a => a.key === sMap[firstMapped.key]) - sEntries.indexOf(firstMapped)
          : anList.length - sEntries.length; // alinear por el final si no hay ancla
        sEntries.forEach((se, sIdx) => {
          if (sMap[se.key]) return;
          const anIdx = sIdx + offset;
          if (anIdx >= 0 && anIdx < anList.length) sMap[se.key] = anList[anIdx].key;
        });
      }

      setIterationMap(sMap);
    } catch(e) { console.error("fetchIterationMap:", e); }
    finally { setIterMapLoading(false); }
  }, [allProjects, visibleProjects, makeHeaders]);

  // ── fetchQAForSprint: horas QA para un sprint AN_YYYYMMDD ───────────────────
  const fetchQAForSprint = useCallback(async (anSprintKey) => {
    if (!anSprintKey || qaCache.current[anSprintKey]) return;
    qaCache.current[anSprintKey] = true;
    const ationeProj = allProjects.find(p => p.name === ATIONET_PROJECT || p.name.toLowerCase().includes("ationet"));
    if (!ationeProj) return;
    setQaSprintData(prev => ({ ...prev, [anSprintKey]: { loading: true, items: [], error: null } }));
    let apiBase = "/azdo";
    if (window.electronAPI?.isElectron) { const port = await window.electronAPI.getProxyPort(); apiBase = `http://127.0.0.1:${port}`; }
    try {
      let index = qaItemIndex;
      if (!index.length) {
        const QA_FETCH_TYPES = ["Test","Management","Support"];
        const idxResults = await Promise.all(QA_FETCH_TYPES.map(async wtype => {
          const body = { query: `SELECT [System.Id] FROM WorkItems WHERE [System.IsDeleted] = False AND [System.WorkItemType] = '${wtype}' ORDER BY [System.Id] ASC` };
          const wr = await fetch(`${apiBase}/${encodeURIComponent(ationeProj.name)}/_apis/wit/wiql?api-version=7.0`, { method:"POST", headers: makeHeaders(), body: JSON.stringify(body) });
          if (!wr.ok) return [];
          const d = await wr.json();
          return (d.workItems || []).map(i => i.id);
        }));
        const allIds = [...new Set(idxResults.flat())];
        const rawIdx = [];
        const idxFields = "System.Id,System.IterationPath,System.WorkItemType,System.AssignedTo";
        for (let i = 0; i < allIds.length; i += 200) {
          const r = await fetch(`${apiBase}/_apis/wit/workitems?ids=${allIds.slice(i,i+200).join(",")}&fields=${idxFields}&api-version=7.0`, { headers: makeHeaders() });
          if (r.ok) { const d = await r.json(); rawIdx.push(...(d.value||[])); }
        }
        index = rawIdx.map(wi => ({ id: wi.fields["System.Id"], iteration: wi.fields["System.IterationPath"]||"", type: wi.fields["System.WorkItemType"], assignedTo: wi.fields["System.AssignedTo"]?.displayName||"" }));
        setQaItemIndex(index);
      }
      const sprintIds = index.filter(i => ATIONET_QA_TYPES.includes(i.type) && i.iteration.includes(anSprintKey)).map(i => i.id);
      if (!sprintIds.length) { setQaSprintData(prev => ({ ...prev, [anSprintKey]: { loading: false, items: [], error: null } })); return; }
      const fields = ["System.Id","System.Title","System.AssignedTo","System.WorkItemType","System.State","System.Parent","Microsoft.VSTS.Scheduling.Effort","Microsoft.VSTS.Scheduling.CompletedWork"].join(",");
      const allRaw = [];
      for (let i = 0; i < sprintIds.length; i += 200) {
        const r = await fetch(`${apiBase}/_apis/wit/workitems?ids=${sprintIds.slice(i,i+200).join(",")}&fields=${fields}&api-version=7.0`, { headers: makeHeaders() });
        if (r.ok) { const d = await r.json(); allRaw.push(...(d.value||[])); }
      }
      // Resolver títulos de padres
      const parentIds = [...new Set(allRaw.map(wi=>wi.fields["System.Parent"]).filter(Boolean))];
      const parentTitleMap = {};
      for (let i = 0; i < parentIds.length; i += 200) {
        const r = await fetch(`${apiBase}/_apis/wit/workitems?ids=${parentIds.slice(i,i+200).join(",")}&fields=System.Id,System.Title&api-version=7.0`, { headers: makeHeaders() });
        if (r.ok) { const d = await r.json(); (d.value||[]).forEach(wi=>{ parentTitleMap[wi.id]=wi.fields["System.Title"]||""; }); }
      }
      const items = allRaw.map(wi => ({
        id: wi.fields["System.Id"],
        title: wi.fields["System.Title"]||"",
        assignedTo: wi.fields["System.AssignedTo"]?.displayName||"Sin asignar",
        type: wi.fields["System.WorkItemType"],
        state: wi.fields["System.State"]||"New",
        completed: wi.fields["Microsoft.VSTS.Scheduling.CompletedWork"]||0,
        estimated: wi.fields["Microsoft.VSTS.Scheduling.Effort"]||0,
        parent: wi.fields["System.Parent"]||null,
        parentTitle: wi.fields["System.Parent"] ? (parentTitleMap[wi.fields["System.Parent"]]||"") : "",
      }));
      setQaSprintData(prev => ({ ...prev, [anSprintKey]: { loading: false, items, error: null } }));
    } catch(e) { setQaSprintData(prev => ({ ...prev, [anSprintKey]: { loading: false, items: [], error: e.message } })); }
  }, [allProjects, qaItemIndex, makeHeaders]);

  useEffect(()=>{
    if(!pat||!visibleProjects.length)return;
    setLoadingAll(true);
    Promise.all(visibleProjects.map(p=>fetchProject(p))).then(()=>setLoadingAll(false));
  },[]);

  // Mapear iteraciones Sxx ↔ AN una vez que cargan los proyectos
  useEffect(()=>{ if(allProjects.length && pat) fetchIterationMap(); },[allProjects.length]);

  // Cargar horas QA cuando cambia el sprint global o el mapa
  useEffect(()=>{ const anKey=iterationMap[globalSprint]; if(anKey) fetchQAForSprint(anKey); },[globalSprint, iterationMap]);

  // Collect all items across projects
  const allItems=Object.entries(projectData).flatMap(([pid,pd])=>(pd.items||[]).map(i=>({...i,projectId:pid,projectName:pd.name||""})));

  // Collect all sprint labels
  // Extract sprint number from any iteration path: "PROJ\Sprint 14", "PROJ\S14", "S14", etc.
  const extractSprintKey = path => {
    if(!path) return null;
    const m = path.match(/[Ss]\s*(\d+)/);
    return m ? `S${m[1]}` : null;
  };

  // Build unique sprint keys across all projects, sorted descending
  const sprintLabels=[...new Set(allItems.map(i=>extractSprintKey(i.iteration)).filter(Boolean))].sort((a,b)=>{
    const n=s=>parseInt(s.replace(/\D/g,""),10);
    return n(b)-n(a);
  });

  // Always default to highest sprint when data loads
  useEffect(()=>{
    if(sprintLabels.length>0) setGlobalSprint(sprintLabels[0]);
  },[sprintLabels[0]]);
  useEffect(()=>setSelectedPerson(null),[globalSprint]);
  useEffect(()=>setSelectedBurndownProject(null),[globalSprint]);

  // Filter to selected sprint using normalized key
  const sprintItems=allItems.filter(i=>extractSprintKey(i.iteration)===globalSprint);

  // QA Ationet: sprint correspondiente y sus ítems
  const currentAnSprint = iterationMap[globalSprint] || null;
  const currentQaData   = currentAnSprint ? (qaSprintData[currentAnSprint] || { loading: false, items: [] }) : null;
  // Mezclar ítems QA de Ationet en el sprint actual (misma estructura que sprintItems)
  const ationeQAItems = (currentQaData?.items || []).map(i => ({
    ...i,
    projectName: "Ationet QA",
    epicTitle:   i.type,   // agrupar por tipo (Test / Management / Support)
    usTitle:     null,
    iteration:   currentAnSprint || "",
    parent:      null,
    parentTitle: "",
    tags:        "",
  }));
  const combinedSprintItems = [...sprintItems, ...ationeQAItems];

  // Excluir personas con rol "Otro" de métricas y jerarquía
  const nonOtherItems=combinedSprintItems.filter(i=>(roles[i.assignedTo]||"Otro")!=="Otro");

  // Metrics (excluye "Otro")
  const totalItems=nonOtherItems.length;
  const doneItems=nonOtherItems.filter(i=>DONE_STATES.includes(i.state)).length;
  const activeItems=nonOtherItems.filter(i=>ACTIVE_STATES.includes(i.state)).length;
  const totalHrs=Math.round(nonOtherItems.reduce((s,i)=>s+i.completed,0));
  const totalEst=Math.round(nonOtherItems.reduce((s,i)=>s+i.estimated,0));

  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedBurndownProject, setSelectedBurndownProject] = useState(null);

  // People map — incluye tareas de todos los proyectos + QA Ationet
  const peopleMap={};
  combinedSprintItems.forEach(i=>{
    if(!peopleMap[i.assignedTo])peopleMap[i.assignedTo]={name:i.assignedTo,tasks:0,comp:0,est:0,projects:new Set(),items:[]};
    peopleMap[i.assignedTo].tasks++;
    peopleMap[i.assignedTo].comp+=i.completed;
    peopleMap[i.assignedTo].est+=i.estimated;
    peopleMap[i.assignedTo].projects.add(i.projectName);
    peopleMap[i.assignedTo].items.push(i);
  });
  const people=Object.values(peopleMap).sort((a,b)=>b.comp-a.comp).filter(p=>p.name!=="Sin asignar");
  const maxComp=Math.max(...people.map(p=>p.comp),1);

  // Tree: Project → Epic → US → Tasks (excluye "Otro"; Ationet QA usa parentTitle en vez de US)
  const tree={};
  nonOtherItems.forEach(item=>{
    const pKey=item.projectName;
    if(!tree[pKey])tree[pKey]={};
    const eKey=item.epicTitle||"Sin épica";
    if(!tree[pKey][eKey])tree[pKey][eKey]={};
    // Para Ationet QA: agrupar por parentTitle (padre de la tarea) en lugar de US
    const uKey=pKey==="Ationet QA"
      ? (item.parentTitle||"Sin padre")
      : (item.usTitle||"Sin US");
    if(!tree[pKey][eKey][uKey])tree[pKey][eKey][uKey]=[];
    tree[pKey][eKey][uKey].push(item);
  });

  const toggle=key=>setOpenNodes(p=>({...p,[key]:!p[key]}));
  const isOpen=key=>p[key]!==false; // default open for project & epic, closed for us

  // Burndown data per project — horas, excluye "Otro" (ya filtrado en tree via nonOtherItems)
  const burndownByProject={};
  Object.entries(tree).forEach(([proj,epics])=>{
    const items=Object.values(epics).flatMap(e=>Object.values(e).flat());
    const comp=Math.round(items.reduce((s,i)=>s+i.completed,0));
    const est=Math.round(items.reduce((s,i)=>s+i.estimated,0));
    const done=items.filter(i=>DONE_STATES.includes(i.state)).length;
    burndownByProject[proj]={total:items.length,done,comp,est,items};
  });
  const bTotal=nonOtherItems.length;
  const bDone=doneItems;
  const bRemaining=bTotal-bDone;
  const pts=10;
  const W=500,H=120,PL=32,PR=8,PT=8,PB=22;
  const iW=W-PL-PR,iH=H-PT-PB;
  const xS=i=>PL+(i/pts)*iW;
  const yS=v=>PT+iH-(bTotal>0?(v/bTotal)*iH:0);
  const idealPath=Array.from({length:pts+1},(_,i)=>`${i===0?"M":"L"}${xS(i).toFixed(1)},${yS(bTotal-(bTotal/pts)*i).toFixed(1)}`).join(" ");
  const actualPath=`M${xS(0).toFixed(1)},${yS(bTotal).toFixed(1)} L${xS(pts).toFixed(1)},${yS(bRemaining).toFixed(1)}`;

  const sel={background:"#1E293B",border:"1px solid #334155",color:"#E2E8F0",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"};

  return (
    <div style={{minHeight:"100vh",background:"#0F172A",color:"#F9FAFB",fontFamily:"system-ui,sans-serif",padding:"1.5rem"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px} tr:hover td{background:rgba(59,130,246,0.04)}`}</style>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onClose} style={{...sel,color:"#9CA3AF",padding:"5px 10px",fontSize:14}}>← Volver</button>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#7C3AED",boxShadow:"0 0 0 3px rgba(124,58,237,.2)"}}/>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:"-0.03em"}}>Vista Global</span>
          <span style={{fontSize:12,color:"#7C3AED",background:"rgba(124,58,237,0.1)",padding:"2px 10px",borderRadius:20}}>{visibleProjects.length} proyectos</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"#4B5563"}}>Sprint:</span>
          <select value={globalSprint} onChange={e=>setGlobalSprint(e.target.value)} style={sel}>
            {sprintLabels.map(s=><option key={s} value={s}>{iterationMap[s]?`${s} — ${iterationMap[s]}`:s}</option>)}
          </select>
          {iterMapLoading&&<span style={{fontSize:10,color:"#4B5563"}}>mapeando QA…</span>}
          {currentQaData?.loading&&<span style={{fontSize:10,color:"#4B5563"}}>cargando QA…</span>}
          <button onClick={()=>{setProjectData({});qaCache.current={};setQaSprintData({});setQaItemIndex([]);setIterationMap({});Promise.all(visibleProjects.map(p=>fetchProject(p)));}} style={sel}>↻ Actualizar</button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:"1.25rem"}}>
        {[["Tareas",totalItems,"#F9FAFB"],["En curso",activeItems,"#3B82F6"],["Completadas",doneItems,"#22C55E"],["Hs. estimadas",totalEst>0?`${totalEst}h`:"—","#9CA3AF"],["Hs. comp.",totalHrs>0?`${totalHrs}h`:"—","#22C55E"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#1E293B",borderRadius:12,padding:"0.85rem",border:"1px solid #334155"}}>
            <div style={{fontSize:11,color:"#9CA3AF",marginBottom:3}}>{l}</div>
            <div style={{fontSize:20,fontWeight:700,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {loadingAll&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"1rem",color:"#6B7280",fontSize:13}}><div style={{width:16,height:16,border:"2px solid #334155",borderTopColor:"#7C3AED",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>Cargando proyectos…</div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>

        {/* Burndown */}
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:"1rem"}}>
          <div style={{fontSize:13,fontWeight:600,color:"#9CA3AF",marginBottom:10}}>Burndown — {globalSprint}{currentAnSprint?` — ${currentAnSprint}`:""}</div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {[["Total",bTotal,"#F9FAFB"],["Hechas",bDone,"#22C55E"],["Restantes",bRemaining,bRemaining>0?"#F59E0B":"#22C55E"],["Avance",`${bTotal?Math.round(bDone/bTotal*100):0}%`,"#3B82F6"]].map(([l,v,c])=>(
              <div key={l} style={{flex:1,background:"#0F172A",borderRadius:8,padding:"6px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#4B5563"}}>{l}</div>
                <div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>
          {bTotal>0?(
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
              {[0,.25,.5,.75,1].map(f=>{const y=yS(bTotal*f);return <g key={f}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#1E293B" strokeWidth="1"/><text x={PL-4} y={y+4} textAnchor="end" fill="#4B5563" fontSize="9">{Math.round(bTotal*f)}</text></g>;})}
              {[0,2,4,6,8,10].map(i=><text key={i} x={xS(i)} y={H-5} textAnchor="middle" fill="#4B5563" fontSize="9">D{i}</text>)}
              <path d={idealPath} fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3" opacity=".6"/>
              <path d={actualPath} fill="none" stroke="#22C55E" strokeWidth="2.5"/>
              <path d={`${actualPath} L${xS(pts).toFixed(1)},${yS(0).toFixed(1)} L${xS(0).toFixed(1)},${yS(0).toFixed(1)} Z`} fill="#22C55E" opacity=".07"/>
              <circle cx={xS(0)} cy={yS(bTotal)} r="3" fill="#22C55E"/>
              <circle cx={xS(pts)} cy={yS(bRemaining)} r="4" fill="#22C55E" stroke="#0F172A" strokeWidth="1.5"/>
              <text x={xS(pts)+7} y={yS(bRemaining)+4} fill="#22C55E" fontSize="10" fontWeight="bold">{bRemaining}</text>
            </svg>
          ):<div style={{textAlign:"center",color:"#4B5563",fontSize:12,padding:"1rem"}}>Sin datos para este sprint</div>}
          <div style={{display:"flex",gap:14,fontSize:10,color:"#4B5563",marginTop:4}}>
            <span><svg width="16" height="6" style={{verticalAlign:"middle",marginRight:3}}><line x1="0" y1="3" x2="16" y2="3" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3"/></svg>Ideal</span>
            <span><svg width="16" height="6" style={{verticalAlign:"middle",marginRight:3}}><line x1="0" y1="3" x2="16" y2="3" stroke="#22C55E" strokeWidth="2"/></svg>Real</span>
          </div>
          {/* Per-project mini stats — clickable */}
          {Object.keys(burndownByProject).length>0&&(
            <div style={{marginTop:12,borderTop:"1px solid #334155",paddingTop:10}}>
              <div style={{fontSize:11,color:"#4B5563",marginBottom:8,fontWeight:600,letterSpacing:".05em"}}>POR PROYECTO</div>
              {Object.entries(burndownByProject).map(([proj,{total,done,comp,est,items:projItems}])=>{
                const maxComp2=Math.max(...Object.values(burndownByProject).map(p=>p.comp),1);
                const pctHrs=est>0?Math.round(comp/est*100):0;
                const pctBar=Math.round(comp/maxComp2*100);
                const isSelProj=selectedBurndownProject===proj;
                return <div key={proj} style={{marginBottom:6}}>
                  <div onClick={()=>setSelectedBurndownProject(isSelProj?null:proj)} style={{cursor:"pointer",userSelect:"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3,alignItems:"center"}}>
                      <span style={{color:"#E2E8F0",display:"flex",alignItems:"center",gap:5}}>
                        <span style={{fontSize:13,color:"#4B5563",transform:isSelProj?"rotate(90deg)":"none",transition:"transform .2s",display:"inline-block"}}>›</span>
                        {proj}
                      </span>
                      <span style={{color:"#22C55E",fontWeight:600}}>{comp}h{est>0?` / ${est}h · ${pctHrs}%`:""}</span>
                    </div>
                    <div style={{height:4,background:"#334155",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pctBar}%`,background:"#22C55E",borderRadius:2}}/></div>
                  </div>
                  {isSelProj&&(
                    <div style={{background:"#0A1628",borderRadius:8,marginTop:6,padding:"6px 8px",maxHeight:200,overflowY:"auto"}}>
                      <div style={{fontSize:10,color:"#4B5563",fontWeight:600,letterSpacing:".05em",marginBottom:5}}>TAREAS — {proj}</div>
                      {(projItems||[]).map(t=>{
                        const sc=stateColors[t.state]||"#6B7280";
                        return <div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:"1px solid #1E293B"}}>
                          <span style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:sc+"22",color:sc,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>{t.state}</span>
                          <span style={{flex:1,fontSize:11,color:"#9CA3AF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</span>
                          <span style={{fontSize:10,color:t.completed>0?"#22C55E":"#4B5563",fontFamily:"monospace",flexShrink:0}}>{t.completed>0?`${t.completed}h`:"—"}</span>
                        </div>;
                      })}
                    </div>
                  )}
                </div>;
              })}
            </div>
          )}
        </div>

        {/* People performance */}
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:"1rem",overflowY:"auto",maxHeight:480}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:600,color:"#9CA3AF",flex:1}}>Rendimiento por persona</span>
            <div style={{display:"flex",gap:3}}>
              {["all","Desarrollo","QA","Management","Otro"].map(r=>(
                <button key={r} onClick={()=>setFilterRole(r)} style={{fontSize:10,padding:"3px 8px",borderRadius:20,border:"1px solid",cursor:"pointer",
                  background:filterRole===r?"rgba(59,130,246,0.15)":"transparent",
                  color:filterRole===r?"#93C5FD":"#6B7280",
                  borderColor:filterRole===r?"#3B82F6":"#334155"}}>
                  {r==="all"?"Todos":r}
                </button>
              ))}
            </div>
          </div>
          {people.filter(p=>filterRole==="all"?(roles[p.name]||"Otro")!=="Otro":(roles[p.name]||"Otro")===filterRole).map((person,idx)=>{
            const colors=[["#DBEAFE","#1E40AF"],["#D1FAE5","#065F46"],["#FEF3C7","#92400E"],["#FCE7F3","#9D174D"],["#EDE9FE","#5B21B6"],["#FEE2E2","#991B1B"]];
            const [bg,fg]=colors[idx%colors.length];
            const ini=person.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
            const role=roles[person.name]||"Otro";
            const roleColor=ROLE_COLORS[role]||"#6B7280";
            const pct=Math.round(person.comp/maxComp*100);
            const isSelected=selectedPerson===person.name;
            // Group tasks by project for drill-down
            const tasksByProj={};
            person.items.forEach(t=>{
              if(!tasksByProj[t.projectName])tasksByProj[t.projectName]=[];
              tasksByProj[t.projectName].push(t);
            });
            return (
              <div key={person.name} style={{borderBottom:"1px solid #1E293B"}}>
                {/* Person row — clickable */}
                <div onClick={()=>setSelectedPerson(isSelected?null:person.name)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",cursor:"pointer",userSelect:"none"}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,flexShrink:0}}>{ini}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontSize:12,color:"#E2E8F0",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{person.name}</span>
                      <span style={{fontSize:10,padding:"1px 6px",borderRadius:10,background:roleColor+"22",color:roleColor,fontWeight:600,flexShrink:0}}>{role}</span>
                    </div>
                    <div style={{height:4,background:"#334155",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:roleColor,borderRadius:2}}/></div>
                    <div style={{display:"flex",gap:8,marginTop:2}}>
                      <span style={{fontSize:10,color:"#22C55E",fontWeight:600}}>{Math.round(person.comp)}h comp.</span>
                      {person.est>0&&<span style={{fontSize:10,color:"#9CA3AF"}}>{Math.round(person.est)}h est.</span>}
                      <span style={{fontSize:10,color:"#4B5563"}}>{person.tasks} tareas · {[...person.projects].join(", ")}</span>
                    </div>
                  </div>
                  <span style={{fontSize:13,color:"#4B5563",transform:isSelected?"rotate(90deg)":"none",transition:"transform .2s",flexShrink:0}}>›</span>
                </div>
                {/* Drill-down: tasks grouped by project */}
                {isSelected&&(
                  <div style={{background:"#0F172A",borderRadius:8,margin:"0 0 8px",padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:"#4B5563",fontWeight:600,letterSpacing:".05em",marginBottom:8}}>
                      DETALLE DE HORAS — {person.name}
                      <span style={{color:"#22C55E",fontWeight:700,marginLeft:8}}>{Math.round(person.comp)}h completadas</span>
                      {person.est>0&&<span style={{color:"#9CA3AF",marginLeft:6}}>/ {Math.round(person.est)}h estimadas</span>}
                    </div>
                    {Object.entries(tasksByProj).map(([proj,tasks])=>(
                      <div key={proj} style={{marginBottom:10}}>
                        <div style={{fontSize:11,color:"#7C3AED",fontWeight:600,marginBottom:5,display:"flex",justifyContent:"space-between"}}>
                          <span>⊞ {proj}</span>
                          <span style={{color:"#22C55E"}}>{Math.round(tasks.reduce((s,t)=>s+t.completed,0))}h</span>
                        </div>
                        {tasks.filter(t=>t.completed>0||t.estimated>0).map(t=>{
                          const sColor=stateColors[t.state]||"#6B7280";
                          return (
                            <div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:"1px solid #1E293B"}}>
                              <span style={{fontSize:10,color:sColor,background:sColor+"22",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap",fontWeight:600,flexShrink:0}}>{t.state}</span>
                              <span style={{flex:1,fontSize:11,color:"#9CA3AF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</span>
                              <span style={{fontSize:11,color:t.completed>0?"#22C55E":"#4B5563",fontWeight:t.completed>0?700:400,flexShrink:0,fontFamily:"monospace"}}>{t.completed>0?`${t.completed}h`:"—"}</span>
                              {t.estimated>0&&<span style={{fontSize:10,color:"#4B5563",flexShrink:0,fontFamily:"monospace"}}>/{t.estimated}h</span>}
                            </div>
                          );
                        })}
                        {tasks.every(t=>t.completed===0&&t.estimated===0)&&(
                          <div style={{fontSize:11,color:"#4B5563",padding:"3px 0"}}>Sin horas registradas</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {people.length===0&&<div style={{fontSize:12,color:"#4B5563",textAlign:"center",padding:"1.5rem"}}>Sin datos para este sprint</div>}
        </div>
      </div>

      {/* Hierarchy tree: Project → Epic → US → Tasks */}
      <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #334155",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:600,color:"#9CA3AF"}}>Jerarquía de tareas — {globalSprint}</span>
          <span style={{fontSize:11,color:"#4B5563",marginLeft:4}}>{totalItems} tareas en {visibleProjects.length} proyectos</span>
          <button onClick={()=>{const n={};Object.keys(tree).forEach(p=>{n[`p:${p}`]=true;Object.keys(tree[p]).forEach(e=>{n[`e:${p}:${e}`]=true;});});setOpenNodes(n);}} style={{...sel,fontSize:11,padding:"3px 10px",marginLeft:"auto"}}>↓ Expandir todo</button>
          <button onClick={()=>setOpenNodes({})} style={{...sel,fontSize:11,padding:"3px 10px"}}>↑ Colapsar todo</button>
        </div>
        <div>
          {Object.entries(tree).map(([projName,epics],pi)=>{
            const projItems=Object.values(epics).flatMap(e=>Object.values(e).flat());
            const projDone=projItems.filter(i=>DONE_STATES.includes(i.state)).length;
            const projComp=Math.round(projItems.reduce((s,i)=>s+i.completed,0));
            const projPct=projItems.length?Math.round(projDone/projItems.length*100):0;
            const pKey=`p:${projName}`;
            const pOpen=!!openNodes[pKey];
            const PROJ_COLORS=["#7C3AED","#0369A1","#0F766E","#B45309","#9D174D","#1D4ED8"];
            const pColor=PROJ_COLORS[pi%PROJ_COLORS.length];
            return (
              <div key={projName} style={{borderBottom:"1px solid #334155"}}>
                {/* Project row */}
                <div onClick={()=>toggle(pKey)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",userSelect:"none",background:"rgba(255,255,255,0.02)"}}>
                  <div style={{width:4,height:"100%",minHeight:20,borderRadius:2,background:pColor,flexShrink:0,alignSelf:"stretch"}}/>
                  <span style={{fontSize:16,color:pColor}}>⊞</span>
                  <span style={{fontWeight:700,fontSize:14,color:"#F9FAFB",flex:1}}>{projName}</span>
                  <span style={{fontSize:11,color:pColor,background:pColor+"22",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{projItems.length} tareas</span>
                  <span style={{fontSize:11,color:"#22C55E",fontWeight:600}}>{projComp>0?`${projComp}h`:""}</span>
                  <span style={{fontSize:11,color:"#6B7280",marginLeft:4}}>{projPct}%</span>
                  <span style={{fontSize:14,color:"#4B5563",transform:pOpen?"rotate(90deg)":"none",transition:"transform .2s",marginLeft:4}}>›</span>
                </div>
                {pOpen&&Object.entries(epics).map(([epicName,uss],ei)=>{
                  const epicItems=Object.values(uss).flat();
                  const epicDone=epicItems.filter(i=>DONE_STATES.includes(i.state)).length;
                  const epicComp=Math.round(epicItems.reduce((s,i)=>s+i.completed,0));
                  const epicPct=epicItems.length?Math.round(epicDone/epicItems.length*100):0;
                  const epicBlocked=epicItems.filter(i=>i.state==="Blocked").length;
                  const eKey=`e:${projName}:${epicName}`;
                  const eOpen=!!openNodes[eKey];
                  const eColor=epicColor(ei);
                  return (
                    <div key={epicName} style={{borderTop:"1px solid #1E293B"}}>
                      {/* Epic row */}
                      <div onClick={()=>toggle(eKey)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px 8px 32px",cursor:"pointer",userSelect:"none",background:"rgba(255,255,255,0.01)"}}>
                        <span style={{fontSize:13,color:eColor}}>◉</span>
                        <span style={{fontWeight:600,fontSize:13,color:"#E2E8F0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{epicName}</span>
                        <span style={{fontSize:11,color:eColor,background:eColor+"22",padding:"2px 6px",borderRadius:20,fontWeight:600}}>{epicItems.length}</span>
                        {epicBlocked>0&&<span style={{fontSize:11,color:"#EF4444",background:"rgba(239,68,68,0.1)",padding:"2px 6px",borderRadius:20,fontWeight:600}}>⚠ {epicBlocked}</span>}
                        <span style={{fontSize:11,color:"#22C55E",fontWeight:600}}>{epicComp>0?`${epicComp}h`:""}</span>
                        <span style={{fontSize:11,color:"#6B7280",marginLeft:4}}>{epicPct}%</span>
                        <span style={{fontSize:14,color:"#4B5563",transform:eOpen?"rotate(90deg)":"none",transition:"transform .2s",marginLeft:4}}>›</span>
                      </div>
                      {eOpen&&Object.entries(uss).map(([usName,tasks])=>{
                        const usDone=tasks.filter(i=>DONE_STATES.includes(i.state)).length;
                        const usComp=Math.round(tasks.reduce((s,i)=>s+i.completed,0));
                        const usPct=tasks.length?Math.round(usDone/tasks.length*100):0;
                        const uKey=`u:${projName}:${epicName}:${usName}`;
                        const uOpen=openNodes[uKey]!==false; // default open
                        const colors=[["#DBEAFE","#1E40AF"],["#D1FAE5","#065F46"],["#FEF3C7","#92400E"],["#FCE7F3","#9D174D"],["#EDE9FE","#5B21B6"]];
                        return (
                          <div key={usName} style={{borderTop:"1px solid #1E293B"}}>
                            {/* US row */}
                            <div onClick={()=>toggle(uKey)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 16px 7px 52px",cursor:"pointer",userSelect:"none"}}>
                              <span style={{fontSize:12,color:"#C4B5FD"}}>◈</span>
                              <span style={{fontSize:12,color:"#C4B5FD",fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{usName}</span>
                              <span style={{fontSize:11,color:"#6B7280"}}>{tasks.length} tareas</span>
                              <span style={{fontSize:11,color:"#22C55E",fontWeight:600,marginLeft:6}}>{usComp>0?`${usComp}h`:""}</span>
                              <span style={{fontSize:11,color:"#6B7280",marginLeft:4}}>{usPct}%</span>
                              <span style={{fontSize:14,color:"#4B5563",transform:uOpen?"rotate(90deg)":"none",transition:"transform .2s",marginLeft:4}}>›</span>
                            </div>
                            {/* Task rows */}
                            {uOpen&&(
                              <div style={{background:"#0F172A"}}>
                                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                                  <tbody>
                                    {tasks.map((task,ti)=>{
                                      const sColor=stateColors[task.state]||"#6B7280";
                                      const [avBg,avFg]=colors[ti%colors.length];
                                      const ini=task.assignedTo.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
                                      return <tr key={task.id} style={{borderBottom:"1px solid #1E293B"}}>
                                        <td style={{padding:"6px 10px 6px 68px",color:"#4B5563",fontFamily:"monospace",fontSize:10,width:60}}>{task.id}</td>
                                        <td style={{padding:"6px 8px",color:"#6B7280",fontSize:11,whiteSpace:"nowrap"}}>{typeIcon[task.type]||"○"} {task.type}</td>
                                        <td style={{padding:"6px 8px",maxWidth:260}}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#E2E8F0"}}>{task.title}</div></td>
                                        <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:10,background:sColor+"22",color:sColor,fontWeight:600}}>{task.state}</span></td>
                                        <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                                            <div style={{width:20,height:20,borderRadius:"50%",background:avBg,color:avFg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:600,flexShrink:0}}>{ini}</div>
                                            <span style={{fontSize:11,color:"#9CA3AF",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.assignedTo}</span>
                                          </div>
                                        </td>
                                        <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",fontSize:11,color:task.completed>0?"#22C55E":"#4B5563",fontWeight:task.completed>0?600:400}}>{task.completed>0?`${task.completed}h`:"—"}</td>
                                      </tr>;
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {Object.keys(tree).length===0&&!loadingAll&&<div style={{padding:"3rem",textAlign:"center",color:"#4B5563",fontSize:13}}>Sin tareas para {globalSprint||"este sprint"}</div>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [pat, setPat]         = useState(()=>sessionStorage.getItem("azdo_pat")||"");
  const [patInput, setPatInput] = useState("");
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("selected_projects")||"[]"); } catch{ return []; }
  });
  const [showProjectPanel, setShowProjectPanel] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [workItems, setWorkItems]   = useState([]);
  // epicMap: { epicTitle: { tasks:[], createdDate, epicId } }
  const [epicData, setEpicData]     = useState({});
  const [epicOrder, setEpicOrder]   = useState([]);
  const [epicSortDir, setEpicSortDir]   = useState("desc"); // "desc"|"asc" by CreatedDate
  const [openEpics, setOpenEpics]   = useState({});
  const [movingEpic, setMovingEpic] = useState(null); // epicTitle being moved
  const [openIters, setOpenIters]   = useState({});
  const [loading, setLoading]       = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState("epics");
  const [filterAssigned, setFilterAssigned] = useState([]);
  const [filterState, setFilterState]       = useState([]);
  const [filterType, setFilterType]         = useState([]);
  const [epicStateFilter, setEpicStateFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [roles, setRoles] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("people_roles")||"{}"); } catch { return {}; }
  });
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [filterRole, setFilterRole]       = useState("all");
  const [showGlobal, setShowGlobal]       = useState(false);
  const [showAtione, setShowAtione]       = useState(false);

  const makeHeaders = useCallback((p)=>({
    "Content-Type":"application/json",
    "Authorization":"Basic "+btoa(":"+(p||pat))
  }),[pat]);

  const fetchProjects = useCallback(async(p)=>{
    setLoading(true); setError(null);
    try {
      const res=await fetch(`${_apiBase}/_apis/projects?api-version=7.0`,{headers:makeHeaders(p)});
      if(res.status===401) throw new Error("PAT inválido. Scopes: Work Items (Read).");
      if(!res.ok) throw new Error(`Error ${res.status}`);
      const data=await res.json();
      const list=data.value||[];
      if(!list.length) throw new Error("No se encontraron proyectos.");
      setAllProjects(list);
      sessionStorage.setItem("azdo_pat",p);
      // Show project selector if no selection saved
      const saved=JSON.parse(localStorage.getItem("selected_projects")||"[]");
      if(!saved.length) setShowProjectPanel(true);
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  },[makeHeaders]);

  const fetchWorkItems = useCallback(async(project)=>{
    if(!project||!pat) return;
    setLoadingItems(true); setError(null);
    try {
      const detailFields=[
        "System.Id","System.Title","System.State","System.AssignedTo",
        "System.WorkItemType","Microsoft.VSTS.Scheduling.Effort",
        "Microsoft.VSTS.Scheduling.CompletedWork","Microsoft.VSTS.Scheduling.RemainingWork",
        "System.CreatedDate","System.ChangedDate","System.IterationPath","System.Parent"
      ].join(",");
      const ancestorFields="System.Id,System.Title,System.WorkItemType,System.State,System.Parent,System.CreatedDate";

      const wiqlBody={query:`SELECT [System.Id] FROM WorkItems
        WHERE [System.TeamProject] = '${project.name}'
        AND [System.IsDeleted] = False
        ORDER BY [System.Id] ASC`};
      const wiqlRes=await fetch(
        `${_apiBase}/${encodeURIComponent(project.name)}/_apis/wit/wiql?api-version=7.0`,
        {method:"POST",headers:makeHeaders(),body:JSON.stringify(wiqlBody)}
      );
      if(!wiqlRes.ok) throw new Error(`WIQL error ${wiqlRes.status}`);
      const wiqlData=await wiqlRes.json();
      const allIds=(wiqlData.workItems||[]).map(i=>i.id);

      setLoadingItems(`Cargando ${allIds.length} items…`);
      const allItems=[];
      for(let i=0;i<allIds.length;i+=50){
        const batch=allIds.slice(i,i+50);
        const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${detailFields}&api-version=7.0`,{headers:makeHeaders()});
        if(r.ok){const d=await r.json();allItems.push(...(d.value||[]));}
        if(i%200===150) setLoadingItems(`Cargando… ${Math.min(i+50,allIds.length)}/${allIds.length}`);
      }

      // Build knownNodes — include State for Epics
      const knownNodes={};
      allItems.forEach(wi=>{
        knownNodes[wi.id]={
          type:wi.fields["System.WorkItemType"],
          title:wi.fields["System.Title"],
          state:wi.fields["System.State"]||"New",
          parent:wi.fields["System.Parent"]||null,
          created:wi.fields["System.CreatedDate"],
        };
      });

      // Countable items only
      const countableItems=allItems.filter(i=>TASK_TYPES.includes(i.fields["System.WorkItemType"]));

      // Prefetch unknown direct parents
      const directParentIds=[...new Set(countableItems.map(i=>i.fields["System.Parent"]).filter(id=>id&&!knownNodes[id]))];
      for(let i=0;i<directParentIds.length;i+=50){
        const batch=directParentIds.slice(i,i+50);
        try{
          const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${ancestorFields}&api-version=7.0`,{headers:makeHeaders()});
          if(r.ok){const d=await r.json();(d.value||[]).forEach(wi=>{knownNodes[wi.id]={type:wi.fields["System.WorkItemType"],title:wi.fields["System.Title"],state:wi.fields["System.State"]||"New",parent:wi.fields["System.Parent"]||null,created:wi.fields["System.CreatedDate"]};});}
        }catch(_){}
      }

      // Walk ancestors: find Epic AND nearest US/Feature
      async function resolveAncestors(startParentId){
        let cursor=startParentId;
        const visited=new Set();
        let epicTitle=null, epicCreated=null, epicState=null;
        let usTitle=null;
        for(let depth=0;depth<8;depth++){
          if(!cursor||visited.has(cursor)) break;
          visited.add(cursor);
          if(!knownNodes[cursor]){
            try{
              const r=await fetch(`${_apiBase}/_apis/wit/workitems?ids=${cursor}&fields=${ancestorFields}&api-version=7.0`,{headers:makeHeaders()});
              if(r.ok){const d=await r.json();(d.value||[]).forEach(wi=>{knownNodes[wi.id]={type:wi.fields["System.WorkItemType"],title:wi.fields["System.Title"],state:wi.fields["System.State"]||"New",parent:wi.fields["System.Parent"]||null,created:wi.fields["System.CreatedDate"]};});}
            }catch(_){}
          }
          const node=knownNodes[cursor];
          if(!node) break;
          if(node.type==="Epic"){ epicTitle=node.title; epicCreated=node.created; epicState=node.state; break; }
          if(US_TYPES.includes(node.type)&&!usTitle){ usTitle=node.title; }
          cursor=node.parent;
        }
        return {epicTitle,epicCreated,epicState,usTitle};
      }

      setLoadingItems("Resolviendo épicas…");
      const epicCache={};
      const mapped=[];
      for(const wi of countableItems){
        const parentId=wi.fields["System.Parent"];
        let epicTitle="Sin épica", epicCreated=null, epicState=null, usTitle=null;
        if(parentId){
          if(!epicCache[parentId]) epicCache[parentId]=await resolveAncestors(parentId);
          ({epicTitle,epicCreated,epicState,usTitle}=epicCache[parentId]);
          if(!epicTitle) epicTitle="Sin épica";
        }
        mapped.push({
          id:wi.fields["System.Id"],title:wi.fields["System.Title"],
          state:wi.fields["System.State"]||"New",type:wi.fields["System.WorkItemType"],
          assignedTo:wi.fields["System.AssignedTo"]?.displayName||"Sin asignar",
          estimated:wi.fields["Microsoft.VSTS.Scheduling.Effort"]||0,
          completed:wi.fields["Microsoft.VSTS.Scheduling.CompletedWork"]||0,
          remaining:wi.fields["Microsoft.VSTS.Scheduling.RemainingWork"]||0,
          changed:wi.fields["System.ChangedDate"],
          iteration:wi.fields["System.IterationPath"]||"",
          epicTitle, epicCreated, epicState, usTitle, parentId,
        });
      }

      // Build epicData: { epicTitle: { tasks, createdDate, epicState } }
      const ed={};
      mapped.forEach(item=>{
        if(!ed[item.epicTitle]) ed[item.epicTitle]={tasks:[],createdDate:item.epicCreated,epicState:item.epicState};
        ed[item.epicTitle].tasks.push(item);
        if(item.epicCreated&&(!ed[item.epicTitle].createdDate||item.epicCreated<ed[item.epicTitle].createdDate))
          ed[item.epicTitle].createdDate=item.epicCreated;
        if(item.epicState&&!ed[item.epicTitle].epicState)
          ed[item.epicTitle].epicState=item.epicState;
      });

      // Add Epics that exist in Azure DevOps but have NO countable children yet
      allItems.filter(wi=>wi.fields["System.WorkItemType"]==="Epic").forEach(wi=>{
        const title=wi.fields["System.Title"];
        if(title&&!ed[title]){
          ed[title]={tasks:[],createdDate:wi.fields["System.CreatedDate"]||null,epicState:wi.fields["System.State"]||"New"};
        }
      });

      // Sort by creation date desc, "Sin épica" last
      const order=Object.keys(ed).sort((a,b)=>{
        if(a==="Sin épica") return 1;
        if(b==="Sin épica") return -1;
        const da=ed[a].createdDate||"";
        const db=ed[b].createdDate||"";
        return db.localeCompare(da);
      });

      setWorkItems(mapped);
      setEpicData(ed);
      setEpicOrder(order);
      // Preserve open/closed state of epics across refreshes — only initialize new ones as closed
      setOpenEpics(prev=>{
        const next={...prev};
        order.forEach(k=>{ if(!(k in next)) next[k]=false; });
        return next;
      });
      setLastRefresh(new Date());
    } catch(e){ setError(e.message); }
    finally{ setLoadingItems(false); }
  },[pat,makeHeaders]);

  useEffect(()=>{ if(pat) fetchProjects(pat); },[]);
  useEffect(()=>{
    if(!currentProjectId&&allProjects.length&&selectedProjectIds.length){
      setCurrentProjectId(selectedProjectIds[0]);
    }
  },[allProjects,selectedProjectIds]);
  useEffect(()=>{
    if(currentProjectId&&pat){
      const proj=allProjects.find(p=>p.id===currentProjectId);
      if(proj) fetchWorkItems(proj);
    }
  },[currentProjectId]);

  const handleConnect=async(e)=>{
    e.preventDefault(); const p=patInput.trim(); if(!p) return;
    setPat(p); await fetchProjects(p);
  };
  const handleProjectConfirm=(ids)=>{
    setSelectedProjectIds(ids);
    localStorage.setItem("selected_projects",JSON.stringify(ids));
    setShowProjectPanel(false);
    if(ids.length&&!currentProjectId) setCurrentProjectId(ids[0]);
  };
  const handleSaveRoles=(r)=>{
    setRoles(r);
    localStorage.setItem("people_roles",JSON.stringify(r));
  };

  const toggleEpic  = key => setOpenEpics(prev=>({...prev,[key]:!prev[key]}));
  const toggleAll   = () => { const anyOpen=epicOrder.some(k=>openEpics[k]); const next={}; epicOrder.forEach(k=>{next[k]=!anyOpen;}); setOpenEpics(next); };
  // moveEpic: find the epic in epicOrder and swap with neighbor
  const moveEpic    = (epicTitle, dir) => {
    setEpicOrder(prev => {
      const n=[...prev];
      const idx=n.indexOf(epicTitle);
      if(idx<0) return prev;
      const swap=idx+dir;
      if(swap<0||swap>=n.length) return prev;
      [n[idx],n[swap]]=[n[swap],n[idx]];
      return n;
    });
    // Flash highlight
    setMovingEpic(epicTitle);
    setTimeout(()=>setMovingEpic(null),600);
  };
  const toggleFilter= (setter,val) => setter(prev=>prev.includes(val)?prev.filter(v=>v!==val):[...prev,val]);

  // Login screen
  if(!pat||allProjects.length===0){
    return (
      <div style={{minHeight:"100vh",background:"#0F172A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:"2rem"}}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{maxWidth:420,width:"100%"}}>
          <div style={{marginBottom:"2rem",textAlign:"center"}}>
            <img src="logo-horizontal.png" alt="ATIO International" style={{height:64,marginBottom:24,objectFit:"contain"}}/>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",borderRadius:8,padding:"4px 12px",marginBottom:16}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#3B82F6"}}/>
              <span style={{fontSize:12,color:"#93C5FD",fontWeight:600,letterSpacing:".06em"}}>AZURE DEVOPS · {ORG}</span>
            </div>
            <h1 style={{color:"#F9FAFB",fontSize:26,fontWeight:700,margin:"0 0 8px",letterSpacing:"-0.03em"}}>DevOps Dashboard</h1>
            <p style={{color:"#6B7280",fontSize:14,lineHeight:1.6,margin:0}}>Conectate a <strong style={{color:"#93C5FD"}}>atioint</strong> con tu Personal Access Token.</p>
          </div>
          <form onSubmit={handleConnect} style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1.5rem"}}>
            <label style={{display:"block",fontSize:12,color:"#9CA3AF",fontWeight:600,marginBottom:8,letterSpacing:".06em"}}>PERSONAL ACCESS TOKEN</label>
            <input type="password" value={patInput} onChange={e=>setPatInput(e.target.value)} placeholder="Pegá tu PAT aquí…" autoFocus
              style={{width:"100%",background:"#0F172A",border:"1px solid #334155",borderRadius:8,padding:"10px 14px",color:"#F9FAFB",fontSize:14,fontFamily:"monospace",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
            <div style={{fontSize:11,color:"#4B5563",background:"#0F172A",borderRadius:8,padding:"8px 12px",marginBottom:14}}>🔒 Solo en sessionStorage. No sale del browser.</div>
            {error&&<div style={{background:"rgba(220,38,38,0.1)",border:"1px solid rgba(220,38,38,0.3)",borderRadius:8,padding:"10px 14px",color:"#FCA5A5",fontSize:13,marginBottom:12}}>{error}</div>}
            <button type="submit" disabled={loading||!patInput.trim()} style={{width:"100%",background:loading?"#1E3A5F":"#3B82F6",border:"none",borderRadius:8,padding:"11px",color:"#fff",fontSize:14,fontWeight:600,cursor:loading?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {loading?<><div style={{width:16,height:16,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>Conectando…</>:"Conectar →"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if(showProjectPanel){
    return <ProjectSelectorPanel projects={allProjects} selected={selectedProjectIds} onConfirm={handleProjectConfirm}/>;
  }

  if(showGlobal){
    return <GlobalView allProjects={allProjects} selectedProjectIds={selectedProjectIds} pat={pat} roles={roles} onClose={()=>setShowGlobal(false)}/>;
  }
  if(showAtione){
    return <AtioneView allProjects={allProjects} pat={pat} roles={roles} onSaveRoles={handleSaveRoles} onClose={()=>setShowAtione(false)}/>;
  }

  // Derived data
  const f=workItems;
  const active =f.filter(i=>ACTIVE_STATES.includes(i.state));
  const done   =f.filter(i=>DONE_STATES.includes(i.state));
  const blocked=f.filter(i=>i.state==="Blocked");
  const totalComp=Math.round(f.reduce((s,i)=>s+i.completed,0));

  const peopleMap={};
  f.forEach(i=>{
    if(!peopleMap[i.assignedTo]) peopleMap[i.assignedTo]={name:i.assignedTo,tasks:0,est:0,comp:0};
    peopleMap[i.assignedTo].tasks++;
    peopleMap[i.assignedTo].est+=i.estimated;
    peopleMap[i.assignedTo].comp+=i.completed;
  });
  const people=Object.values(peopleMap).sort((a,b)=>b.comp-a.comp||b.tasks-a.tasks);

  const allAssignees=[...new Set(f.map(i=>i.assignedTo))].sort();
  const allStates   =[...new Set(f.map(i=>i.state))].sort();
  const allTypes    =[...new Set(f.map(i=>i.type))].sort();
  const filtered=f.filter(i=>
    (filterAssigned.length===0||filterAssigned.includes(i.assignedTo))&&
    (filterState.length===0||filterState.includes(i.state))&&
    (filterType.length===0||filterType.includes(i.type))
  );
  const flatSummary={
    items:filtered.length,
    horas:Math.round(filtered.reduce((s,i)=>s+i.completed,0)),
    effort:Math.round(filtered.reduce((s,i)=>s+i.estimated,0)),
    pct:filtered.some(i=>i.estimated>0)?Math.round(filtered.reduce((s,i)=>s+i.completed,0)/Math.max(filtered.reduce((s,i)=>s+i.estimated,0),1)*100):null,
    bloqueados:filtered.filter(i=>i.state==="Blocked").length,
  };

  // Get the real state of an epic (from Azure DevOps field), fallback to synthetic
  function getEpicState(key){
    const data=epicData[key];
    if(!data) return "Empty";
    // Use the real Azure DevOps state if available
    if(data.epicState) return data.epicState;
    // Fallback: derive from tasks
    return epicSyntheticState(data.tasks||[]);
  }
  function epicSyntheticState(tasks){
    if(!tasks||tasks.length===0) return "Empty";
    const warrantyC = tasks.filter(i=>i.state==="Warranty").length;
    const doneC     = tasks.filter(i=>DONE_STATES.includes(i.state)).length;
    const blockedC  = tasks.filter(i=>i.state==="Blocked").length;
    const activeC   = tasks.filter(i=>ACTIVE_STATES.includes(i.state)).length;
    const newC      = tasks.filter(i=>["New","To Do"].includes(i.state)).length;
    const finishedC = doneC + warrantyC;
    const pct       = finishedC / tasks.length;
    // All tasks finished
    if(finishedC===tasks.length){
      return warrantyC>=doneC ? "Warranty" : "Done";
    }
    // Majority finished and no actives → treat as Done or Warranty
    if(pct>=0.5&&activeC===0&&blockedC===0){
      return warrantyC>=doneC ? "Warranty" : "Done";
    }
    // Any blocked
    if(blockedC>0) return "Blocked";
    // Any active
    if(activeC>0) return "Active";
    // Mostly new/todo
    return "New";
  }

  // displayEpicOrder = epicOrder directly so manual moves persist
  // The sort button re-applies sort to epicOrder via setEpicOrder
  const displayEpicOrder = epicOrder;

  const filteredEpicOrder=displayEpicOrder.filter(key=>{
    if(epicStateFilter==="all") return true;
    const syn=getEpicState(key);
    if(epicStateFilter==="new") return ["New","Approved"].includes(syn);
    if(epicStateFilter==="done_warranty") return ["Done","Warranty","Removed"].includes(syn);
    if(epicStateFilter==="active") return ["In Progress","Blocked","Active","Committed"].includes(syn);
    return true;
  });

  const epicMetrics={
    epicas:filteredEpicOrder.filter(k=>k!=="Sin épica").length,
    tareas:filteredEpicOrder.reduce((s,k)=>s+(epicData[k]?.tasks?.length||0),0),
    enCurso:filteredEpicOrder.reduce((s,k)=>s+(epicData[k]?.tasks?.filter(i=>ACTIVE_STATES.includes(i.state)).length||0),0),
    completadas:filteredEpicOrder.reduce((s,k)=>s+(epicData[k]?.tasks?.filter(i=>DONE_STATES.includes(i.state)).length||0),0),
    bloqueadas:filteredEpicOrder.reduce((s,k)=>s+(epicData[k]?.tasks?.filter(i=>i.state==="Blocked").length||0),0),
    horas:filteredEpicOrder.reduce((s,k)=>s+(epicData[k]?.tasks?.reduce((ss,i)=>ss+i.completed,0)||0),0),
  };

  // Iteration grouping
  const iterMap={};
  f.forEach(item=>{
    const path=item.iteration||"Sin iteración";
    const label=path.includes("\\")?path.split("\\").slice(-2).join(" › "):path;
    if(!iterMap[label]) iterMap[label]=[];
    iterMap[label].push(item);
  });
  const iterOrder=Object.keys(iterMap).sort((a,b)=>{
    if(a==="Sin iteración") return 1; if(b==="Sin iteración") return -1;
    // Extract sprint number from patterns like "S12", "Sprint 12", "S 12"
    const sprintNum = s => { const m=s.match(/[Ss]\s*(\d+)/); return m?parseInt(m[1],10):null; };
    const na=sprintNum(a), nb=sprintNum(b);
    if(na!==null&&nb!==null) return nb-na; // desc: newest first
    return b.localeCompare(a);
  });

  // Role breakdown for overview
  const ROLE_COLORS={"Desarrollo":"#3B82F6","QA":"#22C55E","Management":"#F59E0B","Otro":"#6B7280"};
  const roleHours={"Desarrollo":0,"QA":0,"Management":0,"Otro":0};
  people.forEach(p=>{ const r=roles[p.name]||"Otro"; roleHours[r]=(roleHours[r]||0)+p.comp; });
  const totalRoleHours=Object.values(roleHours).reduce((s,v)=>s+v,0);

  const currentProject=allProjects.find(p=>p.id===currentProjectId);
  const visibleProjects=allProjects.filter(p=>selectedProjectIds.includes(p.id));
  const sel={background:"#1E293B",border:"1px solid #334155",color:"#E2E8F0",borderRadius:8,padding:"6px 14px",fontSize:13,cursor:"pointer"};
  const anyOpen=displayEpicOrder.some(k=>openEpics[k]);

  return (
    <div style={{minHeight:"100vh",background:"#0F172A",color:"#F9FAFB",fontFamily:"system-ui,sans-serif",padding:"1.5rem"}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        tr:hover td{background:rgba(59,130,246,0.04)}
        .pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:4px 10px;border-radius:20px;border:1px solid #334155;background:#1E293B;color:#9CA3AF;cursor:pointer;user-select:none;transition:all .1s}
        .pill.active{background:rgba(59,130,246,0.15);border-color:#3B82F6;color:#93C5FD}
        .pill:hover{border-color:#4B5563}
      `}</style>

      {showRoleModal&&<RoleClassifierModal people={people} roles={roles} onSave={handleSaveRoles} onClose={()=>setShowRoleModal(false)}/>}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="logo-horizontal.png" alt="ATIO" style={{height:28,objectFit:"contain"}}/>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#22C55E",boxShadow:"0 0 0 3px rgba(34,197,94,.2)",marginLeft:4}}/>
          <span style={{fontSize:12,color:"#3B82F6",background:"rgba(59,130,246,0.1)",padding:"2px 10px",borderRadius:20,fontFamily:"monospace"}}>{ORG}</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {/* Project selector dropdown */}
          <select
            value={currentProjectId||""}
            onChange={e=>{
              const newId=e.target.value;
              if(newId==="__change__"){ setShowProjectPanel(true); return; }
              setCurrentProjectId(newId);
              setWorkItems([]); setEpicData({}); setEpicOrder([]);
              setFilterType([]); setFilterAssigned([]); setFilterState([]);
            }}
            style={{...sel,minWidth:160,maxWidth:220}}
          >
            {visibleProjects.map(p=>(
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="__change__">⊕ Cambiar proyectos…</option>
          </select>
          <button onClick={()=>setShowGlobal(true)} style={{...sel,background:"rgba(124,58,237,0.15)",borderColor:"rgba(124,58,237,0.4)",color:"#C4B5FD",fontWeight:600}}>⊞ Vista Global</button>
          <button onClick={()=>setShowAtione(true)} style={{...sel,background:"rgba(34,197,94,0.1)",borderColor:"rgba(34,197,94,0.3)",color:"#86EFAC",fontWeight:600}}>🧪 Ationet QA</button>
          <button onClick={()=>{ const proj=allProjects.find(p=>p.id===currentProjectId); if(proj) fetchWorkItems(proj); }} style={sel}>↻</button>
          {lastRefresh&&<span style={{fontSize:11,color:"#4B5563"}}>{lastRefresh.toLocaleTimeString()}</span>}
          <button onClick={()=>{sessionStorage.removeItem("azdo_pat");setPat("");setAllProjects([]);setWorkItems([]);}} style={{...sel,color:"#EF4444",borderColor:"#7F1D1D"}}>Salir</button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:"1.25rem"}}>
        <MetricCard label="Tareas totales" value={f.length} sub={currentProject?.name}/>
        <MetricCard label="Épicas" value={Object.keys(epicData).filter(k=>k!=="Sin épica").length} color="#7C3AED" sub={`${epicData["Sin épica"]?.tasks?.length||0} sin épica`}/>
        <MetricCard label="En curso" value={active.length} color="#3B82F6"/>
        <MetricCard label="Completadas" value={done.length} color="#22C55E" sub={`${f.length?Math.round(done.length/f.length*100):0}%`}/>
        <MetricCard label="Bloqueadas" value={blocked.length} color={blocked.length>0?"#EF4444":"#22C55E"}/>
        <MetricCard label="Hs. completadas" value={totalComp>0?`${totalComp}h`:"—"} color="#22C55E" sub="total del proyecto"/>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:2,marginBottom:"1.25rem",background:"#1E293B",borderRadius:10,padding:4,width:"fit-content"}}>
        {[["epics","Por épica"],["iterations","Iteraciones"],["tasks","Lista plana"],["people","Personas"],["overview","Resumen"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:"7px 18px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,background:tab===k?"#334155":"transparent",color:tab===k?"#F9FAFB":"#6B7280"}}>{l}</button>
        ))}
      </div>

      {loadingItems?<Spinner text={typeof loadingItems==="string"?loadingItems:"Consultando Azure DevOps…"}/>:(<>

        {/* ── EPICS TAB ── */}
        {tab==="epics"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:4}}>
                {[["all","Todas"],["new","New"],["active","En curso"],["done_warranty","Done / Warranty"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setEpicStateFilter(v)} style={{
                    fontSize:12,padding:"5px 12px",borderRadius:20,border:"1px solid",cursor:"pointer",fontWeight:500,
                    background:epicStateFilter===v?"rgba(59,130,246,0.15)":"transparent",
                    color:epicStateFilter===v?"#93C5FD":"#6B7280",
                    borderColor:epicStateFilter===v?"#3B82F6":"#334155"
                  }}>{l}</button>
                ))}
              </div>
              <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                <button onClick={()=>{
                  const newDir = epicSortDir==="desc"?"asc":"desc";
                  setEpicSortDir(newDir);
                  setEpicOrder(prev=>[...prev].sort((a,b)=>{
                    if(a==="Sin épica") return 1; if(b==="Sin épica") return -1;
                    const da=epicData[a]?.createdDate||""; const db=epicData[b]?.createdDate||"";
                    return newDir==="desc" ? db.localeCompare(da) : da.localeCompare(db);
                  }));
                }} style={{...sel,fontSize:12,padding:"5px 12px"}}
                  title={epicSortDir==="desc"?"Más recientes primero (click para invertir)":"Más antiguas primero (click para invertir)"}>
                  📅 {epicSortDir==="desc"?"↓ Más recientes":"↑ Más antiguas"}
                </button>
                <button onClick={toggleAll} style={{...sel,fontSize:12,padding:"5px 12px"}}>
                  {anyOpen?"↑ Colapsar":"↓ Expandir"}
                </button>
              </div>
            </div>
            {/* Reactive metrics bar */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:12,padding:"10px 14px",background:"#1E293B",border:"1px solid #334155",borderRadius:12}}>
              {[["Épicas",epicMetrics.epicas,"#7C3AED"],["Tareas",epicMetrics.tareas,"#F9FAFB"],["En curso",epicMetrics.enCurso,"#3B82F6"],["Completadas",epicMetrics.completadas,"#22C55E"],["Bloqueadas",epicMetrics.bloqueadas,epicMetrics.bloqueadas>0?"#EF4444":"#22C55E"],["Hs. comp",epicMetrics.horas>0?`${Math.round(epicMetrics.horas)}h`:"—","#22C55E"]].map(([label,value,color])=>(
                <div key={label} style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#4B5563",marginBottom:3}}>{label}</div>
                  <div style={{fontSize:17,fontWeight:700,color}}>{value}</div>
                </div>
              ))}
            </div>
            {filteredEpicOrder.length===0&&<div style={{padding:"3rem",textAlign:"center",color:"#4B5563"}}>Sin épicas con este filtro</div>}
            {filteredEpicOrder.map((epicTitle)=>{
              const globalIdx=displayEpicOrder.indexOf(epicTitle);
              const data=epicData[epicTitle]||{tasks:[],createdDate:null};
              return (
                <EpicGroup
                  key={epicTitle}
                  epic={epicTitle}
                  tasks={data.tasks}
                  usMap={{}}
                  epicIdx={epicTitle==="Sin épica"?99:globalIdx}
                  people={people}
                  isOpen={!!openEpics[epicTitle]}
                  onToggle={()=>toggleEpic(epicTitle)}
                  onMoveUp={()=>moveEpic(epicTitle,-1)}
                  onMoveDown={()=>moveEpic(epicTitle,1)}
                  canMoveUp={epicOrder.indexOf(epicTitle)>0}
                  canMoveDown={epicOrder.indexOf(epicTitle)<epicOrder.length-1}
                  epicState={getEpicState(epicTitle)}
                  createdDate={data.createdDate}
                  isMoving={movingEpic===epicTitle}
                />
              );
            })}
          </div>
        )}

        {/* ── ITERATIONS TAB ── */}
        {tab==="iterations"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#4B5563"}}>{iterOrder.length} iteraciones · {f.length} tareas</span>
              <button onClick={()=>setOpenIters({})} style={{...sel,fontSize:12,padding:"5px 12px",marginLeft:"auto"}}>↑ Colapsar todo</button>
              <button onClick={()=>{const n={};iterOrder.forEach(k=>{n[k]=true;});setOpenIters(n);}} style={{...sel,fontSize:12,padding:"5px 12px"}}>↓ Expandir todo</button>
            </div>
            {iterOrder.map((iterTitle,idx)=>{
              const items=iterMap[iterTitle]||[];
              const iterDone=items.filter(i=>DONE_STATES.includes(i.state));
              const iterActive=items.filter(i=>ACTIVE_STATES.includes(i.state));
              const iterBlocked=items.filter(i=>i.state==="Blocked");
              const iterComp=Math.round(items.reduce((s,i)=>s+i.completed,0));
              const iterEst=Math.round(items.reduce((s,i)=>s+i.estimated,0));
              const pct=items.length?Math.round(iterDone.length/items.length*100):0;
              const color=epicColor(idx);
              const isOpen=!!openIters[iterTitle];
              const stateCounts=items.reduce((acc,i)=>{acc[i.state]=(acc[i.state]||0)+1;return acc;},{});
              const assigneeMap={};
              items.forEach(i=>{
                if(!assigneeMap[i.assignedTo]) assigneeMap[i.assignedTo]={name:i.assignedTo,comp:0,tasks:0};
                assigneeMap[i.assignedTo].comp+=i.completed; assigneeMap[i.assignedTo].tasks++;
              });
              const topAssignees=Object.values(assigneeMap).sort((a,b)=>b.comp-a.comp).slice(0,5);
              return (
                <div key={iterTitle} style={{marginBottom:8,border:"1px solid #334155",borderRadius:14,overflow:"hidden"}}>
                  <div onClick={()=>setOpenIters(prev=>({...prev,[iterTitle]:!prev[iterTitle]}))}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"#1E293B",cursor:"pointer",userSelect:"none"}}>
                    <div style={{width:4,alignSelf:"stretch",borderRadius:2,background:color,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                        <span style={{fontWeight:600,fontSize:14,color:"#F9FAFB"}}>{iterTitle}</span>
                        <span style={{fontSize:11,color,background:`${color}22`,padding:"2px 8px",borderRadius:20,fontWeight:600}}>{items.length} tareas</span>
                        {iterBlocked.length>0&&<span style={{fontSize:11,color:"#EF4444",background:"rgba(239,68,68,0.1)",padding:"2px 8px",borderRadius:20,fontWeight:600}}>⚠ {iterBlocked.length} bloq.</span>}
                        <span style={{fontSize:11,color:"#22C55E",fontWeight:600,marginLeft:"auto"}}>{iterComp>0?`${iterComp}h comp.`:"—"}{iterEst>0?` / ${iterEst}h est.`:""}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:140}}><ProgressBar pct={pct} color={color}/></div>
                        <span style={{fontSize:11,color:"#6B7280"}}>{pct}% · {iterDone.length} hechas · {iterActive.length} activas</span>
                      </div>
                    </div>
                    <div style={{fontSize:16,color:"#4B5563",transform:isOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform .2s",flexShrink:0}}>›</div>
                  </div>
                  {isOpen&&(
                    <div style={{background:"#0F172A",padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                      <div>
                        <div style={{fontSize:11,color:"#4B5563",fontWeight:600,letterSpacing:".05em",marginBottom:8}}>ESTADO</div>
                        {Object.entries(stateCounts).sort((a,b)=>b[1]-a[1]).map(([state,count])=>{
                          const col=stateColors[state]||"#6B7280";
                          return (
                            <div key={state} style={{marginBottom:8}}>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                                <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:2,background:col,display:"inline-block"}}/><span style={{color:"#E2E8F0"}}>{state}</span></span>
                                <span style={{color:"#6B7280",fontFamily:"monospace"}}>{count}</span>
                              </div>
                              <ProgressBar pct={items.length?Math.round(count/items.length*100):0} color={col}/>
                            </div>
                          );
                        })}
                      </div>
                      <div>
                        <div style={{fontSize:11,color:"#4B5563",fontWeight:600,letterSpacing:".05em",marginBottom:8}}>PERSONAS</div>
                        {topAssignees.map((p,pi)=>{
                          const colors=[["#DBEAFE","#1E40AF"],["#D1FAE5","#065F46"],["#FEF3C7","#92400E"],["#FCE7F3","#9D174D"],["#EDE9FE","#5B21B6"]];
                          const [bg,fg]=colors[pi%colors.length];
                          const ini=p.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
                          return (
                            <div key={p.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                              <div style={{width:24,height:24,borderRadius:"50%",background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,flexShrink:0}}>{ini}</div>
                              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div><div style={{fontSize:10,color:"#4B5563"}}>{p.tasks} tareas</div></div>
                              <span style={{fontSize:12,fontWeight:600,color:"#22C55E"}}>{p.comp>0?`${Math.round(p.comp)}h`:"—"}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{gridColumn:"1/-1",overflowX:"auto"}}>
                        <div style={{fontSize:11,color:"#4B5563",fontWeight:600,letterSpacing:".05em",marginBottom:8}}>TAREAS</div>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                          <thead><tr style={{borderBottom:"1px solid #1E293B"}}>{["#","Tipo","Épica","Título","Estado","Asignado","Hs. comp"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:10,color:"#4B5563",fontWeight:600,letterSpacing:".05em",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                          <tbody>{items.slice(0,50).map((item,ri)=>{
                            const eidx=displayEpicOrder.indexOf(item.epicTitle);
                            const ecol=epicColor(item.epicTitle==="Sin épica"?99:eidx);
                            return <tr key={item.id} style={{borderBottom:"1px solid #1E293B",background:ri%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                              <td style={{padding:"6px 10px",color:"#4B5563",fontFamily:"monospace",fontSize:10}}>{item.id}</td>
                              <td style={{padding:"6px 10px",color:"#6B7280",fontSize:11,whiteSpace:"nowrap"}}>{typeIcon[item.type]||"○"} {item.type}</td>
                              <td style={{padding:"6px 10px"}}><span style={{fontSize:10,color:ecol,background:`${ecol}20`,padding:"1px 6px",borderRadius:10,fontWeight:600,whiteSpace:"nowrap"}}>{item.epicTitle.length>16?item.epicTitle.slice(0,14)+"…":item.epicTitle}</span></td>
                              <td style={{padding:"6px 10px",maxWidth:220}}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#E2E8F0"}}>{item.title}</div></td>
                              <td style={{padding:"6px 10px",whiteSpace:"nowrap"}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:10,background:(stateColors[item.state]||"#6B7280")+"22",color:stateColors[item.state]||"#6B7280",fontWeight:600}}>{item.state}</span></td>
                              <td style={{padding:"6px 10px",color:"#9CA3AF",fontSize:11,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{item.assignedTo}</td>
                              <td style={{padding:"6px 10px",color:item.completed>0?"#22C55E":"#4B5563",textAlign:"right",fontFamily:"monospace",fontWeight:item.completed>0?600:400}}>{item.completed>0?`${item.completed}h`:"—"}</td>
                            </tr>;
                          })}</tbody>
                        </table>
                        {items.length>50&&<div style={{padding:"8px 10px",fontSize:11,color:"#4B5563"}}>Mostrando 50 de {items.length} tareas</div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── FLAT LIST TAB ── */}
        {tab==="tasks"&&(
          <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #334155"}}>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:11,color:"#4B5563",marginBottom:6,fontWeight:600,letterSpacing:".05em"}}>ASIGNADO</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {allAssignees.map(a=><span key={a} className={`pill${filterAssigned.includes(a)?" active":""}`} onClick={()=>toggleFilter(setFilterAssigned,a)}>{filterAssigned.includes(a)&&"✓ "}{a}</span>)}
                  {filterAssigned.length>0&&<span className="pill" onClick={()=>setFilterAssigned([])} style={{color:"#EF4444",borderColor:"#7F1D1D"}}>✕ Limpiar</span>}
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:11,color:"#4B5563",marginBottom:6,fontWeight:600,letterSpacing:".05em"}}>ESTADO</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {allStates.map(s=><span key={s} className={`pill${filterState.includes(s)?" active":""}`} onClick={()=>toggleFilter(setFilterState,s)} style={filterState.includes(s)?{background:(stateColors[s]||"#3B82F6")+"22",borderColor:stateColors[s]||"#3B82F6",color:stateColors[s]||"#93C5FD"}:{}}>{filterState.includes(s)&&"✓ "}{s}</span>)}
                  {filterState.length>0&&<span className="pill" onClick={()=>setFilterState([])} style={{color:"#EF4444",borderColor:"#7F1D1D"}}>✕ Limpiar</span>}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,color:"#4B5563",marginBottom:6,fontWeight:600,letterSpacing:".05em"}}>TIPO</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {allTypes.map(t=><span key={t} className={`pill${filterType.includes(t)?" active":""}`} onClick={()=>toggleFilter(setFilterType,t)}>{filterType.includes(t)&&"✓ "}{typeIcon[t]||"○"} {t}</span>)}
                  {filterType.length>0&&<span className="pill" onClick={()=>setFilterType([])} style={{color:"#EF4444",borderColor:"#7F1D1D"}}>✕ Limpiar</span>}
                </div>
              </div>
            </div>
            {/* Dynamic summary bar */}
            <div style={{display:"flex",gap:0,borderBottom:"1px solid #334155",background:"#0F172A"}}>
              {[["Items",flatSummary.items,"#F9FAFB"],["Hs. comp",flatSummary.horas>0?`${flatSummary.horas}h`:"—","#22C55E"],["Effort",flatSummary.effort>0?`${flatSummary.effort}h`:"—","#9CA3AF"],["% comp",flatSummary.pct!==null?`${flatSummary.pct}%`:"—",flatSummary.pct>=80?"#22C55E":flatSummary.pct>=50?"#F59E0B":"#9CA3AF"],["Bloqueados",flatSummary.bloqueados,flatSummary.bloqueados>0?"#EF4444":"#22C55E"]].map(([label,value,color],i,arr)=>(
                <div key={label} style={{flex:1,padding:"10px 14px",borderRight:i<arr.length-1?"1px solid #334155":"none",textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#4B5563",marginBottom:3}}>{label}</div>
                  <div style={{fontSize:18,fontWeight:700,color}}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{borderBottom:"1px solid #334155"}}>{["#","Tipo","Épica","Título","Estado","Asignado","Effort","Hs. comp","Actualizado"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:11,color:"#4B5563",fontWeight:600,letterSpacing:".05em",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.slice(0,150).map((item,ri)=>{
                    const eidx=displayEpicOrder.indexOf(item.epicTitle);
                    const color=epicColor(item.epicTitle==="Sin épica"?99:eidx);
                    return <tr key={item.id} style={{borderBottom:"1px solid #1E293B"}}>
                      <td style={{padding:"8px 14px",color:"#4B5563",fontFamily:"monospace",fontSize:11}}>{item.id}</td>
                      <td style={{padding:"8px 14px",whiteSpace:"nowrap",color:"#6B7280",fontSize:12}}>{typeIcon[item.type]||"○"} {item.type}</td>
                      <td style={{padding:"8px 14px",whiteSpace:"nowrap"}}><span style={{fontSize:11,color,background:`${color}20`,padding:"2px 8px",borderRadius:20,fontWeight:600}}>{item.epicTitle.length>18?item.epicTitle.slice(0,16)+"…":item.epicTitle}</span></td>
                      <td style={{padding:"8px 14px",maxWidth:240}}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#E2E8F0"}}>{item.title}</div></td>
                      <td style={{padding:"8px 14px",whiteSpace:"nowrap"}}><StatusBadge state={item.state}/></td>
                      <td style={{padding:"8px 14px",whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <Avatar name={item.assignedTo} size={20} colorIdx={people.findIndex(p=>p.name===item.assignedTo)}/>
                          <span style={{color:"#9CA3AF",fontSize:12,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis"}}>{item.assignedTo}</span>
                        </div>
                      </td>
                      <td style={{padding:"8px 14px",color:"#6B7280",textAlign:"right",fontFamily:"monospace"}}>{item.estimated>0?item.estimated:"—"}</td>
                      <td style={{padding:"8px 14px",color:item.completed>item.estimated&&item.estimated>0?"#EF4444":"#10B981",textAlign:"right",fontFamily:"monospace"}}>{item.completed>0?item.completed:"—"}</td>
                      <td style={{padding:"8px 14px",color:"#4B5563",fontSize:11,whiteSpace:"nowrap"}}>{item.changed?new Date(item.changed).toLocaleDateString("es-AR"):"—"}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {filtered.length===0&&<div style={{padding:"3rem",textAlign:"center",color:"#4B5563"}}>Sin items con estos filtros</div>}
            </div>
          </div>
        )}

        {/* ── PEOPLE TAB ── */}
        {tab==="people"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {[["all","Todos"],["Desarrollo","Desarrollo"],["QA","QA"],["Management","Management"],["Otro","Otro"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setFilterRole(v)} style={{
                    fontSize:12,padding:"5px 12px",borderRadius:20,border:"1px solid",cursor:"pointer",fontWeight:500,
                    background:filterRole===v?"rgba(59,130,246,0.15)":"transparent",
                    color:filterRole===v?"#93C5FD":"#6B7280",
                    borderColor:filterRole===v?"#3B82F6":"#334155"
                  }}>{l}</button>
                ))}
              </div>
              <button onClick={()=>setShowRoleModal(true)} style={{...sel,fontSize:12,marginLeft:"auto"}}>⊞ Clasificar roles</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
              {people.filter(p=>filterRole==="all"||(roles[p.name]||"Otro")===filterRole).map((person,idx)=>{
                const pct=person.est>0?Math.round(person.comp/person.est*100):0;
                const barColor=pct>100?"#EF4444":pct>80?"#F59E0B":"#3B82F6";
                const pi=f.filter(i=>i.assignedTo===person.name);
                const personRole=roles[person.name]||"—";
                const roleColor={"Desarrollo":"#3B82F6","QA":"#22C55E","Management":"#F59E0B","Otro":"#6B7280"}[personRole]||"#6B7280";
                return (
                  <div key={person.name} style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1.25rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                      <Avatar name={person.name} size={40} colorIdx={idx}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:14,color:"#F9FAFB",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{person.name}</div>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                          <span style={{fontSize:11,padding:"1px 7px",borderRadius:10,background:roleColor+"22",color:roleColor,fontWeight:600}}>{personRole}</span>
                          <span style={{fontSize:11,color:"#4B5563"}}>{person.tasks} tareas</span>
                        </div>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                      {[["Activas",pi.filter(i=>ACTIVE_STATES.includes(i.state)).length,"#3B82F6"],["Hechas",pi.filter(i=>DONE_STATES.includes(i.state)).length,"#22C55E"],["Total",person.tasks,"#9CA3AF"]].map(([l,v,c])=>(
                        <div key={l} style={{background:"#0F172A",borderRadius:8,padding:"8px",textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:700,color:c}}>{v}</div>
                          <div style={{fontSize:10,color:"#4B5563",marginTop:2}}>{l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{background:"#0F172A",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:"#4B5563"}}>Hs. completadas</span><span style={{fontSize:14,fontWeight:700,color:"#22C55E"}}>{fmt(person.comp)}</span></div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:"#4B5563"}}>Effort estimado</span><span style={{fontSize:14,fontWeight:700,color:"#9CA3AF"}}>{fmt(person.est)}</span></div>
                      {person.est>0&&<><ProgressBar pct={pct} color={barColor}/><div style={{fontSize:11,color:barColor,fontWeight:600,textAlign:"right",marginTop:4}}>{pct}%</div></>}
                    </div>
                    <div style={{borderTop:"1px solid #334155",paddingTop:10}}>
                      <div style={{fontSize:11,color:"#4B5563",marginBottom:6}}>Épicas</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        {[...new Set(pi.map(i=>i.epicTitle))].slice(0,4).map(et=>{
                          const eidx=displayEpicOrder.indexOf(et);
                          const c=epicColor(et==="Sin épica"?99:eidx);
                          return <span key={et} style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:`${c}20`,color:c,fontWeight:600}}>{et.length>18?et.slice(0,16)+"…":et}</span>;
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {tab==="overview"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1.25rem"}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:14,color:"#9CA3AF"}}>Por estado</div>
              {Object.entries(f.reduce((acc,i)=>{acc[i.state]=(acc[i.state]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]).map(([state,count])=>(
                <div key={state} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                    <span style={{display:"flex",alignItems:"center",gap:7}}><span style={{width:8,height:8,borderRadius:2,background:stateColors[state]||"#6B7280",display:"inline-block"}}/><span style={{color:"#E2E8F0"}}>{state}</span></span>
                    <span style={{color:"#9CA3AF",fontFamily:"monospace"}}>{count}</span>
                  </div>
                  <ProgressBar pct={f.length?Math.round(count/f.length*100):0} color={stateColors[state]||"#6B7280"}/>
                </div>
              ))}
            </div>
            <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1.25rem"}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:14,color:"#9CA3AF"}}>Épicas — horas y avance</div>
              {displayEpicOrder.filter(k=>k!=="Sin épica").slice(0,8).map((epicTitle,idx)=>{
                const data=epicData[epicTitle]||{tasks:[]};
                const d=data.tasks.filter(i=>DONE_STATES.includes(i.state)).length;
                const pct=data.tasks.length?Math.round(d/data.tasks.length*100):0;
                const comp=Math.round(data.tasks.reduce((s,i)=>s+i.completed,0));
                const est=Math.round(data.tasks.reduce((s,i)=>s+i.estimated,0));
                const color=epicColor(idx);
                return (
                  <div key={epicTitle} style={{marginBottom:12,paddingBottom:12,borderBottom:"1px solid #334155"}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5,alignItems:"baseline"}}>
                      <span style={{color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"60%",fontWeight:500}}>{epicTitle}</span>
                      <span style={{color:"#6B7280",fontSize:11,flexShrink:0}}><span style={{color:"#22C55E",fontWeight:600}}>{fmt(comp)}</span>{est>0?` / ${fmt(est)}`:""}<span style={{color,fontWeight:600,marginLeft:8}}>{pct}%</span></span>
                    </div>
                    <ProgressBar pct={pct} color={color}/>
                  </div>
                );
              })}
            </div>
            <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1.25rem"}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:14,color:"#9CA3AF"}}>Horas por persona</div>
              {people.slice(0,10).map((person,idx)=>{
                const pct=person.est>0?Math.round(person.comp/person.est*100):0;
                const barColor=pct>100?"#EF4444":pct>80?"#F59E0B":"#3B82F6";
                return (
                  <div key={person.name} style={{marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                    <Avatar name={person.name} size={26} colorIdx={idx}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                        <span style={{color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{person.name}</span>
                        <span style={{flexShrink:0,fontSize:11,color:"#6B7280"}}><span style={{color:"#22C55E",fontWeight:600}}>{fmt(person.comp)}</span>{person.est>0?` / ${fmt(person.est)}`:""}</span>
                      </div>
                      <ProgressBar pct={person.est>0?pct:0} color={barColor}/>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Role breakdown */}
            <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1.25rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:600,color:"#9CA3AF"}}>Horas por sector</div>
                <button onClick={()=>setShowRoleModal(true)} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",padding:0}}>Editar roles</button>
              </div>
              {Object.entries(roleHours).filter(([,v])=>v>0).map(([role,hours])=>{
                const pct=totalRoleHours>0?Math.round(hours/totalRoleHours*100):0;
                const color=ROLE_COLORS[role]||"#6B7280";
                return (
                  <div key={role} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}>
                      <span style={{display:"flex",alignItems:"center",gap:7}}><span style={{width:10,height:10,borderRadius:3,background:color,display:"inline-block"}}/><span style={{color:"#E2E8F0",fontWeight:500}}>{role}</span></span>
                      <span style={{color:"#9CA3AF",fontSize:12}}><span style={{color:color,fontWeight:600}}>{fmt(hours)}</span> · {pct}%</span>
                    </div>
                    <ProgressBar pct={pct} color={color} height={8}/>
                  </div>
                );
              })}
              {totalRoleHours===0&&<div style={{fontSize:12,color:"#4B5563",textAlign:"center",paddingTop:8}}>Clasificá las personas en "Editar roles" para ver este gráfico</div>}
            </div>
            {/* Burndown — compact card in grid */}
            <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:"1rem"}}>
              <BurndownChart iterMap={iterMap} iterOrder={iterOrder} compact={true}/>
            </div>
          </div>
        )}

      </>)}
    </div>
  );
}
