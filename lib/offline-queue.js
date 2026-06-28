/* النعمان — طبقة العمل دون اتصال (موحّدة)
   مسح:     NumanQueue.record(sb, code, date, checkinISO)
   عمليات:  NumanQueue.addOp(op) / removeOp(pred) / ops()
   مساعدات: NumanQueue.identity(sb, uid, key) , load(key, fetchFn) , banner(on) ,
            insertOrQueue(sb, table, payload) , delOrQueue(sb, table, col, val) ,
            cacheGet(key) , cacheSet(key, val)
   مراجع:   window.__numanSb = sb ، window.__numanToast = toast */
(function () {
  function cacheGet(k){ try{ const v=localStorage.getItem('numan_c_'+k); return v?JSON.parse(v):null; }catch(e){ return null; } }
  function cacheSet(k,v){ try{ localStorage.setItem('numan_c_'+k, JSON.stringify(v)); }catch(e){} }

  /* طابور المسح */
  const KEY='numan_scan_queue';
  function read(){ try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return [];} }
  function write(a){ try{localStorage.setItem(KEY,JSON.stringify(a));}catch(e){} updateBadge(); }
  function add(s){ const a=read(); a.push(s); write(a); }
  function count(){ return read().length; }

  /* طابور العمليات */
  const OPKEY='numan_op_queue';
  function readOps(){ try{return JSON.parse(localStorage.getItem(OPKEY)||'[]');}catch(e){return [];} }
  function writeOps(a){ try{localStorage.setItem(OPKEY,JSON.stringify(a));}catch(e){} updateBadge(); }
  function addOp(op){ const a=readOps(); a.push(op); writeOps(a); }
  function opCount(){ return readOps().length; }
  function removeOp(pred){ writeOps(readOps().filter(o=>!pred(o))); }

  let flushingScan=false, flushingOps=false;
  async function flush(sb){
    if(flushingScan||!sb||!navigator.onLine){ updateBadge(); return; }
    const a=read(); if(!a.length){ updateBadge(); return; }
    flushingScan=true; const remain=[];
    for(const it of a){ try{ const {error}=await sb.rpc('scan_attendance',{p_code:it.code,p_date:it.date,p_checkin:it.checkin}); if(error) remain.push(it); }catch(e){ remain.push(it); } }
    write(remain); flushingScan=false;
    const d=a.length-remain.length; if(d>0&&typeof window.__numanToast==='function') window.__numanToast('تمت مزامنة '+d+' عملية مسح');
  }
  async function flushOps(sb){
    if(flushingOps||!sb||!navigator.onLine){ updateBadge(); return; }
    const a=readOps(); if(!a.length){ updateBadge(); return; }
    flushingOps=true; const remain=[];
    for(const op of a){
      try{
        let error=null;
        if(op.kind==='dr'){ const r=await sb.from('daily_record').upsert(op.payload,{onConflict:'student_code,record_date'}); error=r.error; }
        else if(op.kind==='rec_add'){ const r=await sb.from('recitation').insert(op.payload); error=r.error; }
        else if(op.kind==='rec_del'){ const r=await sb.from('recitation').delete().eq('id',op.id); error=r.error; }
        else if(op.kind==='insert'){ const r=await sb.from(op.table).insert(op.payload); error=r.error; }
        else if(op.kind==='del'){ const r=await sb.from(op.table).delete().eq(op.col,op.val); error=r.error; }
        if(error) remain.push(op);
      }catch(e){ remain.push(op); }
    }
    writeOps(remain); flushingOps=false;
    const d=a.length-remain.length; if(d>0&&typeof window.__numanToast==='function') window.__numanToast('تمت مزامنة '+d+' تعديلا محليا');
  }
  async function flushAll(sb){ await flush(sb); await flushOps(sb); }

  /* الشارة + لافتة عدم الاتصال */
  function badge(){
    let b=document.getElementById('numanQBadge');
    if(!b){ b=document.createElement('div'); b.id='numanQBadge';
      b.style.cssText='position:fixed;bottom:74px;left:20px;z-index:69;background:#B5872B;color:#fff;border-radius:50px;padding:7px 14px;font-family:inherit;font-weight:700;font-size:13px;box-shadow:0 4px 14px rgba(22,41,77,.3);display:none;cursor:pointer';
      b.title='بيانات بانتظار الرفع — اضغط للرفع الآن'; b.onclick=()=>{ if(window.__numanSb) flushAll(window.__numanSb); };
      (document.body||document.documentElement).appendChild(b);
    }
    return b;
  }
  function updateBadge(){ const n=count()+opCount(); const b=badge(); if(n>0){ b.textContent='⏳ بانتظار الرفع: '+n; b.style.display='inline-block'; } else b.style.display='none'; }
  function banner(on){
    let b=document.getElementById('numanOffBanner');
    if(!b){ b=document.createElement('div'); b.id='numanOffBanner';
      b.style.cssText='position:sticky;top:0;z-index:60;background:#B5872B;color:#fff;text-align:center;padding:7px 10px;font-weight:700;font-size:12.5px;line-height:1.5;display:none';
      b.textContent='📴 وضع عدم الاتصال — البيانات من آخر مزامنة، وتعديلاتك تحفظ محليا وترفع عند عودة النت';
      (document.body||document.documentElement).insertBefore(b,(document.body||document.documentElement).firstChild);
    }
    b.style.display=on?'block':'none';
  }

  /* هوية المستخدم (أونلاين تُجلب وتُكاش، أوفلاين من الكاش) */
  async function identity(sb, uid, key){
    if(navigator.onLine){
      try{ const r=await sb.from('staff').select('*').eq('auth_uid',uid).maybeSingle(); if(r.data){ cacheSet('me_'+key, r.data); return r.data; } }catch(e){}
    }
    return cacheGet('me_'+key);
  }
  /* تحميل مكاش: أونلاين يجلب ويكاش، أوفلاين/فشل يرجّع الكاش */
  async function load(key, fetchFn){
    if(navigator.onLine){
      try{ const data=await fetchFn(); cacheSet('d_'+key, data); return { data, offline:false }; }catch(e){}
    }
    return { data: cacheGet('d_'+key), offline:true };
  }
  /* كتابة: أونلاين تُدرج، أوفلاين تُحفظ بالطابور */
  async function insertOrQueue(sb, table, payload){
    if(navigator.onLine){
      try{ const {data,error}=await sb.from(table).insert(payload).select(); if(!error) return { online:true, data }; }catch(e){}
    }
    addOp({ kind:'insert', table, payload }); return { online:false };
  }
  async function delOrQueue(sb, table, col, val){
    if(navigator.onLine){
      try{ const {error}=await sb.from(table).delete().eq(col,val); if(!error) return { online:true }; }catch(e){}
    }
    addOp({ kind:'del', table, col, val }); return { online:false };
  }

  /* تهيئة صفحة لجنة: هوية + لجنة + عضوية (مع كاش للأوفلاين) */
  async function committeeBoot(sb, session, committeeName, key){
    const me=await identity(sb, session.user.id, key);
    if(!me) return { err:'تحتاج اتصالا بالانترنت اول مرة لتحميل بياناتك.' };
    const isAdmin=(me.role==='admin');
    let com, mem;
    if(navigator.onLine){
      try{
        const c=await sb.from('committees').select('id').eq('name',committeeName).maybeSingle(); com=c.data; cacheSet('com_'+key, com||null);
        if(com){ const m=await sb.from('committee_members').select('role').eq('committee_id',com.id).eq('staff_code',me.code).maybeSingle(); mem=m.data||null; cacheSet('mem_'+key, mem); }
      }catch(e){ com=cacheGet('com_'+key); mem=cacheGet('mem_'+key); }
    } else { com=cacheGet('com_'+key); mem=cacheGet('mem_'+key); }
    if(!com) return { err:'تحتاج اتصالا اول مرة لتحميل بيانات اللجنة.' };
    if(!isAdmin && !mem) return { err:'لست عضوا في هذه اللجنة.' };
    return { me, com, mem, isAdmin, isLead: isAdmin||(mem&&mem.role==='lead') };
  }

  window.NumanQueue={
    add, count, flush, updateBadge, addOp, opCount, removeOp, flushOps, flushAll, ops: readOps,
    cacheGet, cacheSet, banner, identity, load, insertOrQueue, delOrQueue, committeeBoot,
    async record(sb, code, date, checkin){
      if(navigator.onLine){ try{ const {data,error}=await sb.rpc('scan_attendance',{p_code:code,p_date:date,p_checkin:checkin}); if(!error) return { online:true, data }; }catch(e){} }
      add({ code, date, checkin }); return { online:false };
    }
  };

  window.addEventListener('online', ()=>{ if(window.__numanSb) flushAll(window.__numanSb); });
  window.addEventListener('load', ()=>{ updateBadge(); setTimeout(()=>{ if(window.__numanSb) flushAll(window.__numanSb); },1500); });
  if(document.readyState!=='loading') updateBadge(); else document.addEventListener('DOMContentLoaded', updateBadge);
})();
