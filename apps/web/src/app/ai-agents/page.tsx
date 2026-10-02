'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Agent={id:string;key:string;name:string;role:string;status:string;defaultHandlingMode:string};
type Version={id:string;version:number;status:string;model:string;instructions:string};
type Tool={id:string;key:string;name:string;description:string;riskLevel:string};
type Policy={toolKey:string;mode:'AUTO'|'APPROVAL'|'DISABLED';riskLevel:string};
type Run={id:string;status:string;model:string;totalTokens:number;estimatedCostUsd?:string|null;latencyMs?:number|null;output?:{text?:string}|null;startedAt:string};
type Approval={approval:{id:string;status:string};execution:{arguments:Record<string,unknown>;riskLevel:string};toolKey:string;toolName:string};
type KnowledgeBase={id:string;key:string;name:string;status:string};
type SearchResult={id:string;content:string;distance:number|string};
type Usage={model:string;operation:string;inputTokens:number;outputTokens:number;estimatedCostUsd:number;records:number};
type Tab='agents'|'playground'|'approvals'|'knowledge'|'usage';

const field='h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-violet-400/60';

async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch('/api/ai/'+path,{...init,headers:{...(init?.body?{'content-type':'application/json'}:{}),...init?.headers},cache:'no-store'});
  const body=(await response.json().catch(()=>({}))) as T&{message?:string|string[]};
  if(!response.ok){const message=Array.isArray(body.message)?body.message.join(' '):body.message;throw new Error(message??'Request failed.');}
  return body;
}

export default function AiAgentsPage(){
  const [tab,setTab]=useState<Tab>('agents');
  const [agents,setAgents]=useState<Agent[]>([]);
  const [versions,setVersions]=useState<Version[]>([]);
  const [tools,setTools]=useState<Tool[]>([]);
  const [policies,setPolicies]=useState<Policy[]>([]);
  const [runs,setRuns]=useState<Run[]>([]);
  const [approvals,setApprovals]=useState<Approval[]>([]);
  const [bases,setBases]=useState<KnowledgeBase[]>([]);
  const [usage,setUsage]=useState<Usage[]>([]);
  const [selectedAgentId,setSelectedAgentId]=useState<string>();
  const [selectedVersionId,setSelectedVersionId]=useState<string>();
  const [selectedBaseId,setSelectedBaseId]=useState<string>();
  const [latestRun,setLatestRun]=useState<Run>();
  const [searchResults,setSearchResults]=useState<SearchResult[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const selectedAgent=agents.find(x=>x.id===selectedAgentId);
  const selectedVersion=versions.find(x=>x.id===selectedVersionId);
  const policyMap=useMemo(()=>new Map(policies.map(x=>[x.toolKey,x])),[policies]);

  const load=useCallback(async()=>{
    try{
      const result=await Promise.all([
        api<Agent[]>('agents'),api<Tool[]>('tools'),api<Run[]>('runs?limit=100'),
        api<Approval[]>('approvals'),api<KnowledgeBase[]>('knowledge-bases'),api<Usage[]>('usage')
      ]);
      setAgents(result[0]);setTools(result[1]);setRuns(result[2]);setApprovals(result[3]);setBases(result[4]);setUsage(result[5]);
      setSelectedAgentId(v=>v??result[0][0]?.id);setSelectedBaseId(v=>v??result[4][0]?.id);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Unable to load AI control plane.');}
  },[]);

  useEffect(()=>{const id=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(id);},[load]);

  const loadVersions=useCallback(async(agentId:string)=>{
    const rows=await api<Version[]>('agents/'+agentId+'/versions');setVersions(rows);
    const active=rows.find(x=>x.status==='ACTIVE');setSelectedVersionId(v=>v&&rows.some(x=>x.id===v)?v:(active?.id??rows[0]?.id));
  },[]);

  useEffect(()=>{if(!selectedAgentId)return;const id=window.setTimeout(()=>void loadVersions(selectedAgentId).catch((e:Error)=>setError(e.message)),0);return()=>window.clearTimeout(id);},[selectedAgentId,loadVersions]);

  useEffect(()=>{if(!selectedAgentId||!selectedVersionId)return;const id=window.setTimeout(()=>void api<Policy[]>('agents/'+selectedAgentId+'/versions/'+selectedVersionId+'/tools').then(setPolicies).catch((e:Error)=>setError(e.message)),0);return()=>window.clearTimeout(id);},[selectedAgentId,selectedVersionId]);

  async function createAgent(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const element=event.currentTarget;const f=new FormData(element);setBusy(true);
    try{
      const created=await api<{agent:Agent;version:Version}>('agents',{method:'POST',body:JSON.stringify({
        name:f.get('name'),key:f.get('key'),role:f.get('role'),defaultHandlingMode:f.get('mode'),
        model:f.get('model')||undefined,instructions:f.get('instructions')
      })});
      element.reset();await load();setSelectedAgentId(created.agent.id);setSelectedVersionId(created.version.id);
    }catch(e){setError(e instanceof Error?e.message:'Unable to create agent.');}finally{setBusy(false);}
  }

  async function activateVersion(id:string){
    if(!selectedAgentId)return;setBusy(true);
    try{await api('agents/'+selectedAgentId+'/versions/'+id+'/activate',{method:'POST'});await loadVersions(selectedAgentId);await load();}
    catch(e){setError(e instanceof Error?e.message:'Activation failed.');}finally{setBusy(false);}
  }

  async function setPolicy(toolKey:string,mode:'AUTO'|'APPROVAL'|'DISABLED'){
    if(!selectedAgentId||!selectedVersionId)return;setBusy(true);
    try{
      await api('agents/'+selectedAgentId+'/versions/'+selectedVersionId+'/tools',{method:'PUT',body:JSON.stringify({toolKey,mode,dataScope:'ORGANIZATION'})});
      setPolicies(await api<Policy[]>('agents/'+selectedAgentId+'/versions/'+selectedVersionId+'/tools'));
    }catch(e){setError(e instanceof Error?e.message:'Policy update failed.');}finally{setBusy(false);}
  }

  async function runAgent(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selectedAgentId)return;const f=new FormData(event.currentTarget);setBusy(true);
    try{
      const result=await api<Run>('agents/'+selectedAgentId+'/run',{method:'POST',body:JSON.stringify({input:f.get('input'),routing:f.get('routing')})});
      setLatestRun(result);await load();
    }catch(e){setError(e instanceof Error?e.message:'Agent run failed.');}finally{setBusy(false);}
  }

  async function decide(id:string,status:'APPROVED'|'REJECTED'){
    setBusy(true);try{await api('approvals/'+id+'/decision',{method:'POST',body:JSON.stringify({status})});await load();}
    catch(e){setError(e instanceof Error?e.message:'Decision failed.');}finally{setBusy(false);}
  }

  async function createBase(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const element=event.currentTarget;const f=new FormData(element);setBusy(true);
    try{
      const created=await api<KnowledgeBase>('knowledge-bases',{method:'POST',body:JSON.stringify({name:f.get('name'),key:f.get('key')})});
      element.reset();await load();setSelectedBaseId(created.id);
    }catch(e){setError(e instanceof Error?e.message:'Unable to create knowledge base.');}finally{setBusy(false);}
  }

  async function ingest(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selectedBaseId)return;const element=event.currentTarget;const f=new FormData(element);setBusy(true);
    try{
      await api('knowledge-bases/'+selectedBaseId+'/documents/text',{method:'POST',body:JSON.stringify({title:f.get('title'),content:f.get('content')})});
      element.reset();await load();
    }catch(e){setError(e instanceof Error?e.message:'Knowledge ingestion failed.');}finally{setBusy(false);}
  }

  async function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selectedBaseId)return;const f=new FormData(event.currentTarget);setBusy(true);
    try{setSearchResults(await api<SearchResult[]>('knowledge-bases/'+selectedBaseId+'/search',{method:'POST',body:JSON.stringify({query:f.get('query'),limit:5})}));}
    catch(e){setError(e instanceof Error?e.message:'Search failed.');}finally{setBusy(false);}
  }

  const pending=approvals.filter(x=>x.approval.status==='PENDING').length;

  return <main className="min-h-screen bg-[#07090d] text-zinc-100">
    <div className="mx-auto grid min-h-screen max-w-[1900px] lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
        <div className="mb-8 px-2"><div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">Business OS</div><div className="mt-2 text-lg font-semibold">AI Control Plane</div></div>
        <nav className="space-y-1 text-sm">
          <Link href="/dashboard" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">Command Center</Link>
          <Link href="/crm" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">CRM</Link>
          <Link href="/whatsapp" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">WhatsApp</Link>
          <div className="rounded-xl bg-white/10 px-3 py-2.5 text-white">AI Agents</div>
          <Link href="/automations" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">Automations</Link>
          {['Attendance','Billing','Analytics'].map(x=><div key={x} className="rounded-xl px-3 py-2.5 text-zinc-600">{x}</div>)}
        </nav>
      </aside>
      <section className="min-w-0 p-4 sm:p-7 lg:p-9">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div><div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Governed OpenAI Runtime</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">AI Agents</h1><p className="mt-2 max-w-3xl text-sm text-zinc-500">Versioned prompts, controlled tools, human approvals, tenant knowledge and usage telemetry.</p></div>
          <button onClick={()=>void load()} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">Refresh</button>
        </header>
        {error?<div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>:null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Agents" value={agents.length}/><Metric label="Active" value={agents.filter(x=>x.status==='ACTIVE').length}/><Metric label="Pending approvals" value={pending}/><Metric label="Runs" value={runs.length}/>
        </div>
        <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025] p-1">
          {(['agents','playground','approvals','knowledge','usage'] as Tab[]).map(x=><button key={x} onClick={()=>setTab(x)} className={'rounded-lg px-4 py-2 text-sm capitalize '+(tab===x?'bg-white/10 text-white':'text-zinc-500')}>{x}</button>)}
        </div>

        {tab==='agents'?<div className="mt-6 grid gap-5 2xl:grid-cols-[390px_1fr]">
          <form onSubmit={createAgent} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <h2 className="font-semibold">Create AI agent</h2>
            <div className="mt-4 grid gap-3">
              <input className={field} name="name" placeholder="Agent name" required/>
              <input className={field} name="key" placeholder="agent-key" required/>
              <input className={field} name="role" placeholder="Role e.g. SALES_ASSISTANT" required/>
              <select className={field} name="mode" defaultValue="AI_ASSIST"><option>AI_ASSIST</option><option>AI</option><option>HUMAN</option></select>
              <input className={field} name="model" placeholder="Model (blank = platform default)"/>
              <textarea name="instructions" rows={9} required placeholder="System instructions…" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-violet-400/60"/>
              <button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">Create draft</button>
            </div>
          </form>
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Agents</h2>
                <select value={selectedAgentId??''} onChange={e=>setSelectedAgentId(e.target.value)} className={field}>
                  <option value="">Select agent</option>{agents.map(x=><option key={x.id} value={x.id}>{x.name} · {x.status}</option>)}
                </select>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {agents.map(x=><button key={x.id} onClick={()=>setSelectedAgentId(x.id)} className={'rounded-xl border p-4 text-left '+(selectedAgentId===x.id?'border-violet-400/40 bg-violet-400/[0.08]':'border-white/[0.07]')}>
                  <div className="font-medium">{x.name}</div><div className="mt-1 text-xs text-zinc-500">{x.role}</div><div className="mt-3 text-xs text-violet-300">{x.status} · {x.defaultHandlingMode}</div>
                </button>)}
              </div>
            </div>
            {selectedAgent?<div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-semibold">Versions & governed tools</h2><div className="mt-1 text-xs text-zinc-500">{selectedAgent.name}</div></div>
                <select value={selectedVersionId??''} onChange={e=>setSelectedVersionId(e.target.value)} className={field}>
                  <option value="">Select version</option>{versions.map(x=><option key={x.id} value={x.id}>v{x.version} · {x.status} · {x.model}</option>)}
                </select>
              </div>
              {selectedVersion?<div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] p-4">
                  <div><div className="text-sm font-medium">Version {selectedVersion.version} · {selectedVersion.model}</div><div className="mt-1 text-xs text-zinc-500">{selectedVersion.status}</div></div>
                  {selectedVersion.status==='DRAFT'?<button onClick={()=>void activateVersion(selectedVersion.id)} disabled={busy} className="rounded-xl bg-violet-400 px-4 py-2 text-xs font-semibold text-zinc-950">Activate version</button>:null}
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.07]">
                  {tools.map(toolItem=>{const policy=policyMap.get(toolItem.key);return <div key={toolItem.id} className="grid gap-3 border-b border-white/[0.05] p-4 last:border-0 md:grid-cols-[1fr_70px_150px]">
                    <div><div className="text-sm font-medium">{toolItem.name}</div><div className="mt-1 text-xs leading-5 text-zinc-600">{toolItem.description}</div></div>
                    <span className="text-xs text-zinc-400">{toolItem.riskLevel}</span>
                    <select value={policy?.mode??'DISABLED'} disabled={busy||selectedVersion.status==='ARCHIVED'} onChange={e=>void setPolicy(toolItem.key,e.target.value as 'AUTO'|'APPROVAL'|'DISABLED')} className={field}>
                      <option>DISABLED</option><option>AUTO</option><option>APPROVAL</option>
                    </select>
                  </div>;})}
                </div>
              </div>:null}
            </div>:null}
          </div>
        </div>:null}

        {tab==='playground'?<div className="mt-6 grid gap-5 xl:grid-cols-[430px_1fr]">
          <form onSubmit={runAgent} className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5">
            <h2 className="font-semibold">Agent playground</h2><p className="mt-1 text-xs text-zinc-500">Runs the active version through the same governed runtime used by production.</p>
            <div className="mt-4 grid gap-3">
              <select value={selectedAgentId??''} onChange={e=>setSelectedAgentId(e.target.value)} className={field} required><option value="">Select agent</option>{agents.map(x=><option key={x.id} value={x.id}>{x.name} · {x.status}</option>)}</select>
              <select className={field} name="routing" defaultValue="AGENT_DEFAULT"><option value="AGENT_DEFAULT">Agent default</option><option value="FAST">Fast route</option><option value="REASONING">Reasoning route</option></select>
              <textarea name="input" rows={10} required placeholder="Test input…" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-violet-400/60"/>
              <button disabled={busy||!selectedAgentId} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">Run governed agent</button>
            </div>
          </form>
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-semibold">Latest output</h2>
              {latestRun?<><div className="mt-4 flex flex-wrap gap-2 text-xs"><Pill>{latestRun.status}</Pill><Pill>{latestRun.model}</Pill><Pill>{latestRun.totalTokens} tokens</Pill></div><div className="mt-4 whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-black/20 p-4 text-sm leading-6 text-zinc-300">{latestRun.output?.text??'No text output.'}</div></>:<div className="mt-8 text-sm text-zinc-600">Run an active agent to inspect output.</div>}
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-semibold">Recent runs</h2><div className="mt-4 space-y-2">
              {runs.slice(0,15).map(x=><div key={x.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] px-4 py-3"><div><div className="text-sm font-medium">{x.model}</div><div className="mt-1 text-xs text-zinc-600">{new Date(x.startedAt).toLocaleString()}</div></div><div className="text-right text-xs text-zinc-400"><div>{x.status}</div><div className="mt-1">{x.totalTokens} tokens</div></div></div>)}
            </div></div>
          </div>
        </div>:null}

        {tab==='approvals'?<div className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
          <h2 className="font-semibold">Human approval queue</h2><p className="mt-1 text-xs text-zinc-500">APPROVAL-mode tools and high-risk actions stop here before execution.</p>
          <div className="mt-5 space-y-3">
            {approvals.map(x=><article key={x.approval.id} className="rounded-xl border border-white/[0.07] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><div className="font-medium">{x.toolName}</div><div className="mt-1 text-xs text-zinc-500">{x.toolKey} · {x.execution.riskLevel} · {x.approval.status}</div><pre className="mt-3 max-w-3xl overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-zinc-600">{JSON.stringify(x.execution.arguments,null,2)}</pre></div>
                {x.approval.status==='PENDING'?<div className="flex gap-2"><button onClick={()=>void decide(x.approval.id,'REJECTED')} className="rounded-xl border border-red-400/20 px-4 py-2 text-xs text-red-300">Reject</button><button onClick={()=>void decide(x.approval.id,'APPROVED')} className="rounded-xl bg-violet-400 px-4 py-2 text-xs font-semibold text-zinc-950">Approve</button></div>:null}
              </div>
            </article>)}
            {!approvals.length?<div className="py-14 text-center text-sm text-zinc-600">No approval requests.</div>:null}
          </div>
        </div>:null}

        {tab==='knowledge'?<div className="mt-6 grid gap-5 2xl:grid-cols-[360px_1fr]">
          <div className="space-y-5">
            <form onSubmit={createBase} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-semibold">New knowledge base</h2><div className="mt-4 grid gap-3"><input className={field} name="name" placeholder="Name" required/><input className={field} name="key" placeholder="knowledge-key" required/><button disabled={busy} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950">Create</button></div></form>
            <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-semibold">Knowledge bases</h2><div className="mt-4 space-y-2">{bases.map(x=><button key={x.id} onClick={()=>setSelectedBaseId(x.id)} className={'block w-full rounded-xl border p-3 text-left '+(selectedBaseId===x.id?'border-violet-400/40 bg-violet-400/[0.08]':'border-white/[0.07]')}><div className="text-sm font-medium">{x.name}</div><div className="mt-1 text-xs text-zinc-600">{x.status}</div></button>)}</div></div>
          </div>
          <div className="space-y-5">
            <form onSubmit={ingest} className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-semibold">Ingest approved knowledge</h2><p className="mt-1 text-xs text-zinc-500">Text is chunked, embedded and stored tenant-isolated in pgvector.</p><div className="mt-4 grid gap-3"><input className={field} name="title" placeholder="Document title" required/><textarea name="content" rows={9} required placeholder="Approved business knowledge…" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-violet-400/60"/><button disabled={busy||!selectedBaseId} className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60">Ingest & embed</button></div></form>
            <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-semibold">Retrieval test</h2><form onSubmit={search} className="mt-4 flex gap-3"><input className={field+' flex-1'} name="query" placeholder="Ask the knowledge base…" required/><button disabled={busy||!selectedBaseId} className="rounded-xl bg-violet-400 px-5 text-sm font-semibold text-zinc-950">Search</button></form><div className="mt-4 space-y-2">{searchResults.map(x=><div key={x.id} className="rounded-xl border border-white/[0.07] p-4"><div className="text-sm leading-6 text-zinc-300">{x.content}</div><div className="mt-2 text-[11px] text-zinc-600">distance {Number(x.distance).toFixed(4)}</div></div>)}</div></div>
          </div>
        </div>:null}

        {tab==='usage'?<div className="mt-6 grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-semibold">AI usage</h2><div className="mt-4 overflow-x-auto"><div className="min-w-[720px] overflow-hidden rounded-xl border border-white/[0.07]">
            <div className="grid grid-cols-[1.3fr_1fr_.8fr_.8fr_.8fr] gap-3 border-b border-white/[0.07] px-4 py-3 text-xs uppercase text-zinc-600"><span>Model / operation</span><span>Records</span><span>Input</span><span>Output</span><span>Est. cost</span></div>
            {usage.map(x=><div key={x.model+x.operation} className="grid grid-cols-[1.3fr_1fr_.8fr_.8fr_.8fr] gap-3 border-b border-white/[0.05] px-4 py-3 text-sm last:border-0"><div><div className="font-medium">{x.model}</div><div className="text-xs text-zinc-600">{x.operation}</div></div><span>{x.records}</span><span>{x.inputTokens.toLocaleString()}</span><span>{x.outputTokens.toLocaleString()}</span><span>{'$'+Number(x.estimatedCostUsd).toFixed(6)}</span></div>)}
          </div></div></div>
          <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"><h2 className="font-semibold">Cost governance</h2><div className="mt-4 space-y-3 text-sm leading-6 text-zinc-500"><p>Displayed cost is telemetry only. Subscription billing is driven by entitlements and metering, not hard-coded model prices.</p><p>Fast/reasoning model IDs are configuration, so provider model upgrades do not require CRM schema changes.</p><p>Phase 4A will attach WhatsApp AI usage to the paid AI WhatsApp add-on.</p></div></div>
        </div>:null}
      </section>
    </div>
  </main>;
}

function Metric({label,value}:{label:string;value:number|string}){return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div><div className="mt-3 text-2xl font-semibold">{value}</div></article>;}
function Pill({children}:{children:React.ReactNode}){return <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-zinc-400">{children}</span>;}
