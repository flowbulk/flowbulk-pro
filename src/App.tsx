import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

const FN = import.meta.env.VITE_FUNCTION_URL as string | undefined;
const ADMIN_MODE = import.meta.env.VITE_MODE === 'admin';
type Brand = { name: string; logo: string };

async function api(action: string, body: Record<string, unknown> = {}): Promise<any> {
  if (!FN) return { error: 'config' };
  try {
    const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    return await r.json();
  } catch { return { error: 'network' }; }
}
const copy = (t: string) => navigator.clipboard.writeText(t).catch(() => {});

function BrandHead({ b }: { b: Brand }) {
  return <div className="brand">{b.logo ? <img src={b.logo} alt="" /> : <div className="logo">FB</div>}<h1>{b.name}</h1></div>;
}

export default function App() {
  const [brand, setBrand] = useState<Brand>({ name: 'FlowBulk Pro', logo: '' });
  const [user, setUser] = useState<{ name: string; expiry: string } | null>(null);
  const [master, setMaster] = useState('');
  const loadBrand = () => api('config').then((c) => { if (c.app_name) setBrand({ name: c.app_name, logo: c.logo_url || '' }); });
  useEffect(() => { loadBrand(); }, []);
  useEffect(() => { document.title = brand.name; }, [brand.name]);
  if (!FN) return <div className="center"><div className="card">VITE_FUNCTION_URL set nahi hai. README ke step 3 dekho.</div></div>;
  if (ADMIN_MODE) return master ? <Admin brand={brand} master={master} onSaved={loadBrand} /> : <MasterGate brand={brand} onOk={setMaster} />;
  return user ? <Editor brand={brand} user={user} /> : <Login brand={brand} onOk={setUser} />;
}

function MasterGate({ brand, onOk }: { brand: Brand; onOk: (m: string) => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    const r = await api('admin_check', { master: pw });
    setBusy(false);
    if (r.ok) onOk(pw); else setErr(r.error === 'network' ? 'Internet / server problem.' : 'Master password galat hai.');
  };
  return <div className="center"><div className="card narrow"><BrandHead b={brand} /><h2>Admin: Master Password</h2>
    <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="Master password" autoFocus />
    <div className="row"><button className="primary" disabled={busy || !pw} onClick={go}>{busy ? 'Check ho raha hai...' : 'Open Admin Dashboard'}</button></div>
    {err && <div className="err">{err}</div>}</div></div>;
}

function Admin({ brand, master, onSaved }: { brand: Brand; master: string; onSaved: () => void }) {
  const [tab, setTab] = useState<'settings' | 'create' | 'list'>('settings');
  const [name, setName] = useState(brand.name); const [logo, setLogo] = useState(brand.logo); const [msg, setMsg] = useState('');
  const [f, setF] = useState({ name: '', email: '', plan: '1 Month' }); const [res, setRes] = useState<any>(null); const [err, setErr] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const saveCfg = async () => {
    const r = await api('admin_set_config', { master, app_name: name, logo_url: logo });
    setMsg(r.ok ? 'Save ho gaya. Sab users ko naya naam/logo agli baar app kholne par dikhega.' : 'Save nahi hua: ' + (r.error || 'unknown')); if (r.ok) onSaved();
  };
  const create = async () => {
    setErr(''); setRes(null);
    const r = await api('admin_create', { master, ...f });
    if (r.ok) setRes(r); else setErr(r.error || 'Fail');
  };
  const loadList = async () => { const r = await api('admin_list', { master }); if (r.ok) setRows(r.rows); };
  useEffect(() => { if (tab === 'list') loadList(); }, [tab]);
  return <div className="wrap"><BrandHead b={brand} /><div className="tabs">
    {([['settings', 'App Settings'], ['create', 'Share Tool / Create User'], ['list', 'Licenses']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'settings' && <div className="card"><h2>App Settings</h2>
      <label>App Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>App Logo URL (https link)<input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://..." /></label>
      {logo && <div className="row"><img src={logo} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} /></div>}
      <div className="row"><button className="primary" onClick={saveCfg}>Save branding</button></div>{msg && <div className="ok">{msg}</div>}</div>}
    {tab === 'create' && <div className="card"><h2>Create License</h2><div className="grid">
      <label>Customer Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Customer Email<input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label>Plan<select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option>1 Month</option><option>6 Months</option><option>1 Year</option></select></label></div>
      <div className="row"><button className="primary" onClick={create} disabled={!f.name || !f.email}>Generate License</button></div>
      {err && <div className="err">{err}</div>}
      {res && <div className="ok"><b>Customer ko ye bhejo (password dobara nahi dikhega):</b>
        <p>Email: {f.email}<br />Password: <b>{res.password}</b><br />Plan: {f.plan}, expiry: {new Date(res.expiry).toLocaleDateString()}<br />Download: {res.download_link}</p>
        <button onClick={() => copy(`Email: ${f.email}\nPassword: ${res.password}\nDownload: ${res.download_link}`)}>Copy all</button></div>}</div>}
    {tab === 'list' && <div className="card"><h2>Licenses</h2><table><thead><tr><th>Name</th><th>Email</th><th>Plan</th><th>Expiry</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.download_id}><td>{r.name}</td><td>{r.email}</td><td>{r.plan}</td><td>{new Date(r.expiry).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
  </div>;
}

function Login({ brand, onOk }: { brand: Brand; onOk: (u: { name: string; expiry: string }) => void }) {
  const [email, setEmail] = useState(localStorage.getItem('fb_email') || ''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    const r = await api('login', { email, password: pw });
    setBusy(false);
    if (r.ok) { localStorage.setItem('fb_email', email); onOk({ name: r.name, expiry: r.expiry }); return; }
    setErr(({ expired: 'License Expired', locked: 'Bohot zyada galat koshish. 15 minute baad try karo.', network: 'Internet / server problem.' } as Record<string, string>)[r.error] || 'Email ya password galat hai.');
  };
  return <div className="center"><div className="card narrow"><BrandHead b={brand} /><h2>Login</h2>
    <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="FB-XXXX-XX" /></label>
    <div className="row"><button className="primary" disabled={busy || !email || !pw} onClick={go}>{busy ? 'Check ho raha hai...' : 'Login'}</button></div>
    {err && <div className="err">{err}</div>}</div></div>;
}

type Prog = { phase: string; total: number; generated: number; failed: number; regenerating: number; saved: number };
function Editor({ brand, user }: { brand: Brand; user: { name: string; expiry: string } }) {
  const [prompts, setPrompts] = useState<string[]>([]); const [folder, setFolder] = useState('');
  const [parallel, setParallel] = useState(3); const [url, setUrl] = useState('https://flow.google.com/'); const [hide, setHide] = useState(false);
  const [ready, setReady] = useState<{ host: string; hasBox: boolean } | null>(null);
  const [p, setP] = useState<Prog | null>(null); const [logs, setLogs] = useState<string[]>([]); const [missing, setMissing] = useState<number[]>([]);
  const addLog = (m: string) => setLogs((l) => [...l.slice(-150), new Date().toLocaleTimeString() + '  ' + m]);
  useEffect(() => {
    const un = listen<any>('flow-report', (e) => {
      const d = e.payload;
      if (d.type === 'ready') setReady(d); else if (d.type === 'progress') setP(d);
      else if (d.type === 'log') setLogs((l) => [...l.slice(-150), d.msg]); else if (d.type === 'missing') setMissing(d.list);
    });
    return () => { un.then((f) => f()); };
  }, []);
  const ev = (js: string) => invoke('flow_eval', { js }).catch((e) => addLog('Flow window: ' + e));
  const loadFile = async (f?: File) => { if (!f) return; setPrompts((await f.text()).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)); };
  const pick = async () => { const d = await open({ directory: true }); if (typeof d === 'string') { await invoke('set_folder', { path: d }); setFolder(d); } };
  const openFlow = async () => { await invoke('open_flow', { url, visible: true }).catch((e) => addLog(String(e))); setTimeout(() => ev('window.__fb&&window.__fb.ping()'), 4000); };
  const start = async () => {
    setMissing([]); setP(null);
    await ev(`window.__fb&&window.__fb.run(${JSON.stringify({ prompts, parallel, retries: 2, timeout: 300, gap: 4 })})`);
    if (hide) invoke('flow_visible', { visible: false });
  };
  const running = !!p && ['generating', 'downloading'].includes(p.phase);
  const total = p?.total ?? prompts.length; const pct = p ? Math.round(((p.phase === 'downloading' || p.phase === 'done' ? p.saved : p.generated) / Math.max(1, p.total)) * 100) : 0;
  return <div className="wrap"><BrandHead b={brand} />
    <div className="muted small">Welcome {user.name}. License expiry: {new Date(user.expiry).toLocaleDateString()}</div>
    <div className="grid" style={{ marginTop: 14 }}>
      <div className="card"><h2>1. Flow</h2>
        <label>Flow URL<input value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <div className="row"><button onClick={openFlow}>Open Flow (login + project kholo)</button><button onClick={() => ev('window.__fb&&window.__fb.ping()')}>Check</button></div>
        {ready && <div className={ready.hasBox ? 'ok' : 'warn'}>{ready.hasBox ? `Flow ready (${ready.host}). Prompt box mil gaya.` : `Page: ${ready.host}. Login karo, project kholo, Image mode chuno, phir Check dabao.`}</div>}
        <p className="muted small">Pehli baar Flow window mein apne Google account se login karo. Login us window mein yaad rehta hai.</p></div>
      <div className="card"><h2>2. Prompts aur folder</h2>
        <label>Prompts .txt file (har line ek prompt)<input type="file" accept=".txt" onChange={(e) => loadFile(e.target.files?.[0])} /></label>
        <div className="muted small">{prompts.length ? `${prompts.length} prompts load hue` : 'Abhi koi file nahi'}</div>
        <div className="row"><button onClick={pick}>Save folder chuno</button><span className="small muted">{folder || 'koi folder nahi'}</span></div>
        <div className="grid"><label>Ek saath kitni (1-4)<select value={parallel} onChange={(e) => setParallel(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label><input type="checkbox" style={{ width: 'auto' }} checked={hide} onChange={(e) => setHide(e.target.checked)} /> Start ke baad Flow window chhupao (experimental)</label></div></div></div>
    <div className="card"><h2>3. Generate</h2>
      <div className="status">{p ? `Generating ${p.generated}/${total} | Failed: ${p.failed}${p.regenerating ? ' (Regenerating)' : ''} | Downloaded: ${p.saved}/${total}` : `Ready | ${prompts.length} prompts`}</div>
      <div className="bar"><div style={{ width: pct + '%' }} /></div>
      <div className="row"><button className="go" disabled={running || !prompts.length || !folder || !ready?.hasBox} onClick={start}>Start Generate</button>
        <button className="stop" disabled={!running} onClick={() => ev('window.__fb&&window.__fb.stop()')}>Stop</button>
        <button onClick={() => invoke('flow_visible', { visible: true })}>Flow window dikhao</button></div>
      {p?.phase === 'done' && <div className="ok">Complete. {p.saved}/{total} images {folder} mein save hui (1.jpg, 2.jpg...).{missing.length ? ` Missing: ${missing.join(', ')}` : ''}</div>}</div>
    <div className="card"><h2>Log</h2><pre>{logs.join('\n')}</pre></div></div>;
}
