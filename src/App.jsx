import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { t as T, fmt } from './i18n'
import * as XLSX from 'xlsx'

const QUARTERS = ['Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027', '2028']
const OPEX = ['opex_people', 'opex_training', 'opex_consumables', 'opex_maintenance', 'opex_licences', 'opex_other']
const opexYear = (a) => OPEX.reduce((s, k) => s + Number(a[k] || 0), 0)
const capex = (a) => Number(a.capex_amount || 0)
const colorOf = (tot) => (tot == null ? '' : tot >= 10 ? 'green' : tot >= 6 ? 'yellow' : 'gate')

function useToast() {
  const [msg, setMsg] = useState(null)
  const show = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(null), 2600) }, [])
  return [msg, show]
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [lang, setLang] = useState(localStorage.getItem('sb_lang') || 'en')
  const t = useCallback((k) => T(lang, k), [lang])
  useEffect(() => { document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang; localStorage.setItem('sb_lang', lang) }, [lang])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*, departments(*), directorates(*)').eq('user_id', session.user.id).maybeSingle().then(({ data }) => { setProfile(data); if (data && !data.last_seen_at) supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id).then(() => {}) })
  }, [session])

  if (session === undefined) return null
  if (!session) return <Login t={t} lang={lang} setLang={setLang} />
  if (!profile) return <Shell t={t} lang={lang} setLang={setLang} profile={null}><div className="wrap"><div className="card">…</div></div></Shell>
  if (profile.role === 'pending') return <Shell t={t} lang={lang} setLang={setLang} profile={profile}><div className="wrap"><div className="card o"><h2>{t('pending_title')}</h2><p>{t('pending_text')}</p><p className="m">{profile.email}</p></div></div></Shell>
  return <Main t={t} lang={lang} setLang={setLang} profile={profile} />
}

function Shell({ t, lang, setLang, profile, children, tabs, tab, setTab }) {
  return <>
    <div className="top">
      <img src="/logo.png" alt="" />
      <div className="brand">smart<span>Budget</span> <span className="m" style={{ color: '#C9D6DF', fontWeight: 400 }}>· {t('tagline')}</span></div>
      <div className="sp" />
      {profile && <div className="who">{profile.name || profile.email}<br />{(profile.departments || profile.directorates)?.[lang === 'ar' ? 'name_ar' : 'name_en'] || ''}</div>}
      <button className="btn ghost" style={{ color: '#fff', borderColor: '#4B6A80' }} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t('lang')}</button>
      {profile && <button className="btn ghost" style={{ color: '#fff', borderColor: '#4B6A80' }} onClick={() => supabase.auth.signOut()}>{t('sign_out')}</button>}
    </div>
    {tabs && <div className="tabs">{tabs.map(x => <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>{x.label}</button>)}</div>}
    {children}
  </>
}

function Login({ t, lang, setLang }) {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false)
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } })
    setBusy(false); if (error) setErr(error.message); else setSent(true)
  }
  return <Shell t={t} lang={lang} setLang={setLang}>
    <div className="wrap login">
      <div className="card center">
        <img src="/logo.png" alt="Al Manar" />
        <h1>{t('login_title')}</h1>
        {sent ? <p className="m">{t('link_sent')}</p> : <form onSubmit={go}>
          <p className="m">{t('login_hint')}</p>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@almanargroup.com" />
          <div className="btns" style={{ justifyContent: 'center' }}><button className="btn p" disabled={busy}>{t('send_link')}</button></div>
          {err && <p className="err">{err}</p>}
        </form>}
      </div>
    </div>
  </Shell>
}

function Main({ t, lang, setLang, profile }) {
  const isStaff = profile.role === 'admin' || profile.role === 'excom'
  const inRoom = isStaff || profile.in_room
  const tabs = [
    ...(profile.role !== 'excom' ? [{ id: 'asks', label: t('nav_asks') }] : []),
    ...(inRoom ? [{ id: 'room', label: t('nav_room') }] : []),
    ...(isStaff ? [{ id: 'out', label: t('nav_outputs') }] : []),
    ...(profile.role === 'admin' ? [{ id: 'people', label: t('nav_people') }] : []),
  ]
  const [tab, setTab] = useState(tabs[0].id)
  const [ref, setRef] = useState({ departments: [], directorates: [], register: [], cycle: null })
  useEffect(() => {
    Promise.all([
      supabase.from('departments').select('*').order('sort'),
      supabase.from('register_rows').select('*').order('sort'),
      supabase.from('cycles').select('*').order('id', { ascending: false }).limit(1),
      supabase.from('directorates').select('*').order('sort'),
    ]).then(([d, r, c, g]) => {
      const dirs = g.data || []; const ord = Object.fromEntries(dirs.map((x, i) => [x.id, i]))
      const deps = (d.data || []).slice().sort((a, b) => (ord[a.directorate_id] ?? 99) - (ord[b.directorate_id] ?? 99) || a.sort - b.sort)
      setRef({ departments: deps, directorates: dirs, register: r.data || [], cycle: (c.data || [])[0] || null })
    })
  }, [])
  const [toast, show] = useToast()
  return <Shell t={t} lang={lang} setLang={setLang} profile={profile} tabs={tabs} tab={tab} setTab={setTab}>
    <div className="wrap">
      {tab === 'asks' && ref.cycle && <Asks t={t} lang={lang} profile={profile} refd={ref} show={show} />}
      {tab === 'room' && ref.cycle && <Room t={t} lang={lang} profile={profile} refd={ref} show={show} />}
      {tab === 'out' && ref.cycle && <Outputs t={t} lang={lang} profile={profile} refd={ref} />}
      {tab === 'people' && <People t={t} lang={lang} refd={ref} show={show} />}
    </div>
    {toast && <div className="toast">{toast}</div>}
  </Shell>
}

/* ---------------- MY ASKS ---------------- */
const myDirectorate = (profile, refd) => profile.directorate_id || refd.departments.find(d => d.id === profile.department_id)?.directorate_id || null
const myDeps = (profile, refd) => profile.role === 'admin' ? refd.departments
  : profile.role === 'director' ? refd.departments.filter(d => d.directorate_id === myDirectorate(profile, refd))
  : refd.departments.filter(d => d.id === profile.department_id)
function DeptSelect({ value, onChange, deps, refd, lang, disabled, blank }) {
  const nm = (x) => x?.[lang === 'ar' ? 'name_ar' : 'name_en']
  const groups = refd.directorates.map(g => [g, deps.filter(d => d.directorate_id === g.id)]).filter(([, ds]) => ds.length)
  const loose = deps.filter(d => !d.directorate_id)
  return <select value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
    {blank && <option value="">—</option>}
    {groups.map(([g, ds]) => <optgroup key={g.id} label={nm(g)}>{ds.map(d => <option key={d.id} value={d.id}>{nm(d)}</option>)}</optgroup>)}
    {loose.map(d => <option key={d.id} value={d.id}>{nm(d)}</option>)}
  </select>
}

function AskRow({ a, t, lang, onOpen, showDept }) {
  return <div className="card ask" onClick={() => onOpen(a)}>
    <div style={{ flex: 1 }}><div className="t">{a.title}</div><div className="sub">{showDept ? (a.departments?.[lang === 'ar' ? 'name_ar' : 'name_en'] + ' · ') : ''}{a.register_code || a.lane_other || ''} {a.quarter ? '· ' + a.quarter : ''}</div><span className={'pill ' + a.status}>{t(a.status)}</span></div>
    <div className="amt"><b>{a.quote_decides ? t('quote_decides').split('—')[0] : fmt(capex(a))}</b><span className="m">{t('opex_lbl')} {fmt(opexYear(a))}</span></div>
  </div>
}

function Asks({ t, lang, profile, refd, show }) {
  const [list, setList] = useState([]); const [edit, setEdit] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('asks').select('*, departments(name_en,name_ar,directorate_id)').eq('cycle_id', refd.cycle.id).neq('status', 'withdrawn').order('created_at')
    setList(data || [])
  }, [refd.cycle.id])
  useEffect(() => { load() }, [load])
  const sums = list.reduce((s, a) => ({ capex: s.capex + capex(a), opex: s.opex + opexYear(a) }), { capex: 0, opex: 0 })
  if (edit) return <AskForm t={t} lang={lang} profile={profile} refd={refd} ask={edit} show={show} onDone={() => { setEdit(null); load() }} />
  const head = profile.role === 'head'
  const early = ['draft', 'returned']
  const groups = head ? [[null, list]] : [
    [t('waiting_you'), list.filter(a => a.status === 'with_director')],
    [t('in_progress'), list.filter(a => early.includes(a.status))],
    [t('in_room_lbl'), list.filter(a => !early.includes(a.status) && a.status !== 'with_director')],
  ]
  return <>
    <div className="hero"><p className="k">{refd.cycle.name}{!head && (profile.directorates || profile.departments) ? ' · ' + (profile.directorates || profile.departments)[lang === 'ar' ? 'name_ar' : 'name_en'] : ''}</p><h2>{head ? t('nav_asks') : t('all_asks')}</h2>
      <p className="m">{list.length === 0 ? t('no_asks') : head ? t('flow_head') : t('flow_dir')}</p>
      <div className="btns"><button className="btn p" onClick={() => setEdit({})}>＋ {t('new_ask')}</button></div></div>
    {list.length > 0 && <div className="tot"><div><span>{t('sum_capex')}</span><b>{fmt(sums.capex)}</b></div><div className="o"><span>{t('sum_opex')}</span><b>{fmt(sums.opex)}</b></div><div><span>{t('sum_year1')}</span><b>{fmt(sums.capex + sums.opex)}</b></div></div>}
    {groups.map(([label, items], gi) => items.length > 0 && <div key={gi}>
      {label && <p className="k" style={{ marginTop: 18 }}>{label} · {items.length}</p>}
      {!label && <div style={{ height: 12 }} />}
      {items.map(a => <AskRow key={a.id} a={a} t={t} lang={lang} onOpen={setEdit} showDept={!head} />)}
    </div>)}
  </>
}

// defined outside AskForm so inputs keep focus while typing
function Field({ a, set, canEdit, k, label, hint, type = 'text', area }) {
  return <label className="f"><span>{label}{hint ? ' — ' + hint : ''}</span>{area ? <textarea value={a[k] || ''} disabled={!canEdit} onChange={e => set(k, e.target.value)} /> : <input type={type} value={a[k] ?? ''} disabled={!canEdit} onChange={e => set(k, e.target.value)} />}</label>
}

// words that hint an ask belongs to an ExCom consolidated idea (EN + AR)
const REG_WORDS = {
  ENGINE: ['brake fluid', 'فرامل', 'engine coolant', 'antifreeze'],
  F1: ['pdpl', 'data protection', 'privacy', 'حماية البيانات', 'خصوصية'],
  F2: ['trademark', 'forma', 'فورما', 'علامة تجارية'],
  F3: ['tracker', 'lab record', 'lims', 'تتبع', 'سجلات المعمل'],
  F4: ['mechanic database', 'trader database', 'site map', 'قاعدة بيانات', 'خريطة'],
  P1: ['marine', 'ship', 'vessel', 'مارين', 'سفن', 'بحري'],
  P2: ['industrial coolant', 'كولانت صناعي'],
  P3: ['rust', 'sensor cleaner', 'صدأ', 'حساسات'],
  P4: ['motorcycle', '4t', 'موتوسيكل'],
  P5: ['turbo', 'cvt', 'تربو'],
  P6: ['vii', 'viscosity index', 'لزوجة'],
  P7: ['raw material', 'base oil trading', 'خامات'],
  P8: ['ev coolant', 'heat lab', 'electric vehicle', 'كهربائية', 'هيت لاب'],
  B1: ['credit', 'ائتمان'],
  B2: ['certified mechanic', 'mechanics programme', 'ميكانيكي'],
  B3: ['workshop portal', 'b2b portal', 'بوابة', 'ورش'],
  B4: ['filter', 'batter', 'فلاتر', 'بطاري'],
  B5: ['academy', 'أكاديمية'],
  B6: ['qr', 'authentic', 'counterfeit', 'consumer app', 'تقليد', 'أصلي'],
  A1: ['site scoring', 'site-scoring', 'تقييم المواقع'],
  A2: ['pilot site', 'مواقع تجريبية'],
  A3: ['ev charg', 'charging', 'charger', 'شحن', 'شاحن'],
  A4: ['hard discount', 'hard-discount', 'خصم'],
  A5: ['e-bike', 'ebike', 'دراجة', 'دراجات'],
  A6: ['behind the chargers', 'خلف الشواحن'],
  B7: ['home service', 'home-service', 'خدمة منزلية', 'منزل'],
  B8: ['predictive', 'fluid-care', 'تنبؤ'],
  E1: ['east africa', 'bonded hub', 'أفريقيا', 'افريقيا'],
}
function matchRegister(rows, text) {
  const s = (text || '').toLowerCase()
  if (s.trim().length < 3) return []
  return rows.map(r => ({ r, n: (REG_WORDS[r.code] || []).filter(w => s.includes(w)).length })).filter(x => x.n).sort((x, y) => y.n - x.n).slice(0, 2).map(x => x.r)
}

function AskForm({ t, lang, profile, refd, ask, show, onDone }) {
  const blank = { title: '', lane: '', register_code: '', lane_other: '', what_text: '', capex_class: 'light', capex_amount: '', quote_decides: false, quarter: 'Q1 2027', opex_people: '', opex_training: '', opex_consumables: '', opex_maintenance: '', opex_licences: '', opex_other: '', opex_notes: '', return_text: '', return_when: '', measure_text: '', measure_when: '', if_not_funded: '', what_we_stop: '', status: 'draft', department_id: profile.role === 'head' ? profile.department_id : null }
  const [a, setA] = useState({ ...blank, ...ask })
  const [files, setFiles] = useState([]); const [hist, setHist] = useState([]); const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(false)
  const set = (k, v) => setA(x => ({ ...x, [k]: v }))
  const deps = myDeps(profile, refd)
  const mine = deps.some(d => d.id === a.department_id)
  const st = a.status || 'draft'
  const isDir = profile.role === 'director' || profile.role === 'admin'
  const canEdit = profile.role === 'admin' || (mine && (profile.role === 'director' ? ['draft', 'with_director', 'returned', 'submitted', 'yellow'] : ['draft', 'returned', 'yellow']).includes(st))
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!a.id) return
    supabase.from('attachments').select('*').eq('ask_id', a.id).then(({ data }) => setFiles(data || []))
    supabase.from('ask_events').select('*, profiles(name,email)').eq('ask_id', a.id).order('at', { ascending: false }).then(({ data }) => setHist(data || []))
  }, [a.id])
  const num = (v) => (v === '' || v == null ? null : Number(v))
  const payload = (status) => ({
    cycle_id: refd.cycle.id, department_id: a.department_id, owner_id: profile.id, title: a.title.trim(), lane: a.register_code === 'ENGINE' ? 'engine' : a.register_code ? 'station' : 'other', register_code: a.register_code || null, lane_other: (a.lane_other || '').trim() || null,
    what_text: a.what_text, capex_class: a.capex_class, capex_amount: a.quote_decides ? null : num(a.capex_amount), quote_decides: !!a.quote_decides, quarter: a.quarter,
    ...Object.fromEntries(OPEX.map(k => [k, num(a[k]) ?? 0])), opex_notes: a.opex_notes, return_text: a.return_text, return_when: a.return_when, measure_text: a.measure_text, measure_when: a.measure_when,
    if_not_funded: a.if_not_funded, what_we_stop: a.what_we_stop, status, submitted_at: status === 'submitted' ? new Date().toISOString() : a.submitted_at || null,
    ...(status === 'returned' ? { director_note: note.trim() } : {}),
  })
  const save = async (status) => {
    if (!a.title.trim()) { show(t('missing') + ': ' + t('s_title')); return }
    if (!a.department_id) { show(t('missing') + ': ' + t('department')); return }
    if (status === 'submitted' || status === 'with_director') {
      const need = [['what_text', 's_what'], ['return_text', 's_return'], ['measure_text', 's_measure'], ['if_not_funded', 's_ifnot']].filter(([k]) => !a[k]).map(([, l]) => t(l))
      if (!a.register_code && !(a.lane_other || '').trim()) need.push(t('s_other'))
      if (!a.quote_decides && !a.capex_amount) need.push(t('capex_amount'))
      if (need.length) { show(t('missing_send') + ': ' + need.join(', ')); return }
    }
    if (status === 'returned' && !note.trim()) { show(t('note_needed')); return }
    setBusy(true)
    let res
    if (a.id) res = await supabase.from('asks').update(payload(status)).eq('id', a.id).select().single()
    else res = await supabase.from('asks').insert(payload(status)).select().single()
    setBusy(false)
    if (res.error) { show(res.error.message); return }
    const moved = status !== st || !a.id
    await supabase.from('ask_events').insert({ ask_id: res.data.id, actor_id: profile.id, event: moved && a.id ? 'status' : (a.id ? 'saved' : 'created'), detail: moved ? { status, ...(status === 'returned' ? { note: note.trim() } : {}) } : null })
    const done = ['submitted', 'with_director', 'returned'].includes(status) && status !== st
    show(status === 'submitted' ? t('submitted_ok') : status === 'with_director' ? t('sent_director_ok') : '✓'); if (done) onDone(); else setA(x => ({ ...x, ...res.data }))
  }
  const upload = async (e) => {
    const f = e.target.files[0]; if (!f) return
    let id = a.id
    if (!id) { const r = await supabase.from('asks').insert(payload('draft')).select().single(); if (r.error) { show(r.error.message); return } id = r.data.id; setA(x => ({ ...x, ...r.data })) }
    const path = `${id}/${Date.now()}_${f.name}`
    const { error } = await supabase.storage.from('quotes').upload(path, f); if (error) { show(error.message); return }
    await supabase.from('attachments').insert({ ask_id: id, path, name: f.name, uploaded_by: profile.id })
    const { data } = await supabase.from('attachments').select('*').eq('ask_id', id); setFiles(data || [])
  }
  const open = async (p) => { const { data } = await supabase.storage.from('quotes').createSignedUrl(p, 600); if (data) window.open(data.signedUrl, '_blank') }
  const del = async () => { if (!a.id || !confirm('?')) return; await supabase.from('asks').delete().eq('id', a.id); onDone() }
  const withdraw = async () => { if (!confirm('?')) return; await supabase.from('asks').update({ status: 'withdrawn' }).eq('id', a.id); await supabase.from('ask_events').insert({ ask_id: a.id, actor_id: profile.id, event: 'withdrawn' }); onDone() }
  const oy = opexYear(a), cx = a.quote_decides ? 0 : capex(a)
  const regLabel = r => (r.code === 'ENGINE' ? '' : r.code + ' · ') + (lang === 'ar' && r.title_ar ? r.title_ar : r.title_en)
  const linked = refd.register.find(r => r.code === a.register_code)
  const hints = linked ? [] : matchRegister(refd.register, [a.lane_other, a.title, a.what_text].join(' '))
  return <>
    <div className="btns" style={{ marginTop: 0 }}><button className="btn" onClick={onDone}>← {t('back')}</button>{a.status && <span className={'pill ' + a.status} style={{ alignSelf: 'center' }}>{t(a.status)}</span>}</div>
    {a.director_note && ['returned', 'draft', 'with_director'].includes(st) && <div className="card o"><p className="k">{t('director_note')}</p><p>{a.director_note}</p></div>}
    <div className="card"><Field a={a} set={set} canEdit={canEdit} k="title" label={t('s_title')} hint={t('s_title_h')} />
      {profile.role !== 'head' && <label className="f"><span>{t('department')}</span><DeptSelect value={a.department_id} onChange={v => set('department_id', v)} deps={deps} refd={refd} lang={lang} disabled={!canEdit} blank /></label>}
    </div>
    <div className="card"><p className="k">{t('s_lane')}</p>
      <Field a={a} set={set} canEdit={canEdit} k="lane_other" label={t('s_other')} hint={t('s_other_hint')} />
      {linked ? <div className="row" style={{ alignItems: 'center', gap: 8 }}><span className="pill">{t('linked_to')}: {regLabel(linked)}</span>{canEdit && <button className="btn" onClick={() => set('register_code', '')}>{t('unlink')}</button>}</div>
        : <>
          {canEdit && hints.map(r => <div key={r.code} className="card o" style={{ margin: '6px 0', padding: 10 }}>💡 {t('looks_like')} <b>{regLabel(r)}</b> <button className="btn" style={{ marginInlineStart: 8 }} onClick={() => set('register_code', r.code)}>{t('link_it')}</button></div>)}
          {canEdit && !pick && <button className="btn" onClick={() => setPick(true)}>{t('link_excom')}</button>}
          {canEdit && pick && <label className="f"><span>{t('s_register')}</span><select value="" onChange={e => { set('register_code', e.target.value); setPick(false) }}><option value="">—</option>{refd.register.map(r => <option key={r.code} value={r.code}>{regLabel(r)}</option>)}</select></label>}
        </>}
      <Field a={a} set={set} canEdit={canEdit} k="what_text" label={t('s_what')} area />
    </div>
    <div className="card"><p className="k">{t('s_ask')}</p>
      <div className="row">
        <label className="f"><span>{t('capex_class')}</span><select value={a.capex_class} disabled={!canEdit} onChange={e => set('capex_class', e.target.value)}><option value="none">{t('c_none')}</option><option value="light">{t('c_light')}</option><option value="significant">{t('c_significant')}</option></select></label>
        <label className="f"><span>{t('capex_amount')}</span><input type="number" min="0" value={a.quote_decides ? '' : (a.capex_amount ?? '')} disabled={!canEdit || a.quote_decides} onChange={e => set('capex_amount', e.target.value)} /></label>
        <label className="f"><span>{t('quarter')}</span><select value={a.quarter || ''} disabled={!canEdit} onChange={e => set('quarter', e.target.value)}>{QUARTERS.map(q => <option key={q}>{q}</option>)}</select></label>
      </div>
      <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={!!a.quote_decides} disabled={!canEdit} onChange={e => set('quote_decides', e.target.checked)} /> {t('quote_decides')}</label>
      <label className="f"><span>{t('quote')}</span>{canEdit && <input type="file" accept=".pdf,image/*" onChange={upload} />}</label>
      {files.map(f => <div key={f.id}><a href="#" onClick={e => { e.preventDefault(); open(f.path) }}>📎 {f.name}</a></div>)}
    </div>
    <div className="card o"><p className="k">{t('s_tcd')}</p><p className="m">{t('tcd_hint')}</p>
      <div className="row">{OPEX.map(k => <Field a={a} set={set} canEdit={canEdit} key={k} k={k} label={t(k)} type="number" />)}</div>
      <Field a={a} set={set} canEdit={canEdit} k="opex_notes" label={t('opex_notes')} area />
      <div className="tot"><div><span>{t('capex_lbl')}</span><b>{a.quote_decides ? '—' : fmt(cx)}</b></div><div className="o"><span>{t('opex_lbl')}</span><b>{fmt(oy)}</b></div><div><span>{t('year_one')} · {t('yearly_after')}</span><b>{fmt(cx + oy)} · {fmt(oy)}</b></div></div>
    </div>
    <div className="card"><p className="k">{t('s_return')}</p><Field a={a} set={set} canEdit={canEdit} k="return_text" label={t('return_h')} area /><Field a={a} set={set} canEdit={canEdit} k="return_when" label={t('return_when')} /></div>
    <div className="card"><p className="k">{t('s_measure')}</p><Field a={a} set={set} canEdit={canEdit} k="measure_text" label={t('measure_h')} area /><Field a={a} set={set} canEdit={canEdit} k="measure_when" label={t('measure_when')} /></div>
    <div className="card"><p className="k">{t('s_ifnot')}</p><Field a={a} set={set} canEdit={canEdit} k="if_not_funded" label={t('ifnot_h')} area /><Field a={a} set={set} canEdit={canEdit} k="what_we_stop" label={t('stop_h')} area /></div>
    {canEdit && isDir && a.id && st === 'with_director' && <div className="card"><label className="f"><span>{t('send_back')}</span><textarea value={note} onChange={e => setNote(e.target.value)} /></label></div>}
    {canEdit && <div className="btns">
      <button className="btn" disabled={busy} onClick={() => save(st === 'returned' ? 'returned' : st)}>{t('save')}</button>
      {!isDir && ['draft', 'returned', 'yellow'].includes(st) && <button className="btn p" disabled={busy} onClick={() => save('with_director')}>{t('send_director')} →</button>}
      {isDir && ['draft', 'with_director', 'returned', 'yellow'].includes(st) && <button className="btn p" disabled={busy} onClick={() => save('submitted')}>{t('submit_room')} →</button>}
      {isDir && a.id && st === 'with_director' && <button className="btn y" disabled={busy} onClick={() => save('returned')}>↩ {t('send_back')}</button>}
      {a.id && st === 'draft' && <button className="btn ghost" onClick={del}>{t('delete')}</button>}
      {a.id && st === 'submitted' && <button className="btn ghost" onClick={withdraw}>{t('withdraw')}</button>}
    </div>}
    {hist.length > 0 && <div className="card hist"><p className="k">{t('history')}</p>{hist.map(h => <div key={h.id}>{new Date(h.at).toLocaleString()} · {h.detail?.status ? t(h.detail.status) : h.event}{h.detail?.note ? ' — ' + h.detail.note : ''} · {h.profiles?.name || h.profiles?.email || ''}</div>)}</div>}
  </>
}

/* ---------------- THE ROOM ---------------- */
function Room({ t, lang, profile, refd, show }) {
  const [list, setList] = useState([]); const [i, setI] = useState(0); const [mine, setMine] = useState({}); const [totals, setTotals] = useState({})
  const load = useCallback(async () => {
    const { data } = await supabase.from('asks').select('*, departments(name_en,name_ar), attachments(*)').eq('cycle_id', refd.cycle.id).in('status', ['submitted', 'pitched', 'green', 'yellow', 'gate']).order('department_id').order('created_at')
    setList(data || [])
    const { data: tt } = await supabase.from('ask_totals').select('*'); setTotals(Object.fromEntries((tt || []).map(x => [x.ask_id, x])))
    const { data: ms } = await supabase.from('scores').select('*').eq('scorer_id', profile.id); setMine(Object.fromEntries((ms || []).map(x => [x.ask_id, x])))
  }, [refd.cycle.id, profile.id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('room').on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => load()).on('postgres_changes', { event: '*', schema: 'public', table: 'asks' }, () => load()).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])
  const a = list[i]
  if (!a) return <div className="card"><h2>{t('room_title')}</h2><p className="m">{t('no_room')}</p></div>
  const my = mine[a.id] || {}; const tot = totals[a.id] || {}
  const setQ = async (k, v) => {
    const row = { ask_id: a.id, scorer_id: profile.id, q_fit: my.q_fit ?? null, q_evidence: my.q_evidence ?? null, q_reversible: my.q_reversible ?? null, q_payback: my.q_payback ?? null, [k]: v }
    const { error } = await supabase.from('scores').upsert(row, { onConflict: 'ask_id,scorer_id' }); if (error) show(error.message); else load()
  }
  const decide = async (status) => {
    await supabase.from('asks').update({ status }).eq('id', a.id)
    await supabase.from('ask_events').insert({ ask_id: a.id, actor_id: profile.id, event: 'decision', detail: { status, total: tot.total, scorers: tot.scorers } })
    show(t(status)); load()
  }
  const myTotal = ['q_fit', 'q_evidence', 'q_reversible', 'q_payback'].every(k => my[k] != null) ? ['q_fit', 'q_evidence', 'q_reversible', 'q_payback'].reduce((s, k) => s + my[k], 0) : null
  const oy = opexYear(a)
  return <>
    <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
      <div><h1 style={{ margin: 0 }}>{t('room_title')}</h1><p className="m" style={{ margin: 0 }}>{t('room_hint')}</p></div>
      <div style={{ flex: 'none', display: 'flex', gap: 8, alignItems: 'center' }}><button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>‹ {t('prev')}</button><span className="pill">{i + 1} / {list.length}</span><button className="btn" disabled={i >= list.length - 1} onClick={() => setI(i + 1)}>{t('next')} ›</button></div>
    </div>
    <div className="hero">
      <p className="k">{a.departments?.[lang === 'ar' ? 'name_ar' : 'name_en']} · {a.register_code || a.lane_other || ''} · {a.quarter || ''} · <span className={'pill ' + a.status}>{t(a.status)}</span></p>
      <h2>{a.title}</h2>
      <p>{a.what_text}</p>
      <div className="tot"><div style={{ background: '#115585', color: '#fff' }}><span style={{ color: '#C9D6DF' }}>{t('capex_lbl')} · {t(`c_${a.capex_class}`)}</span><b style={{ color: '#fff' }}>{a.quote_decides ? t('quote_decides').split('—')[1] : fmt(capex(a))}</b></div><div style={{ background: '#C4500F', color: '#fff' }}><span style={{ color: '#FDEEE4' }}>{t('opex_lbl')}</span><b style={{ color: '#fff' }}>{fmt(oy)}</b></div><div style={{ background: '#115585', color: '#fff' }}><span style={{ color: '#C9D6DF' }}>{t('year_one')}</span><b style={{ color: '#fff' }}>{fmt(capex(a) + oy)}</b></div></div>
    </div>
    <div className="grid2" style={{ marginTop: 12 }}>
      <div className="card"><p className="k">{t('s_return')}</p><p>{a.return_text}</p><p className="m">{a.return_when}</p><p className="k">{t('s_measure')}</p><p>{a.measure_text}</p><p className="m">{a.measure_when}</p></div>
      <div className="card"><p className="k">{t('ifnot_h')}</p><p>{a.if_not_funded}</p><p className="k">{t('stop_h')}</p><p>{a.what_we_stop}</p>{a.opex_notes && <><p className="k">{t('opex_notes')}</p><p className="m">{a.opex_notes}</p></>}{a.attachments?.length > 0 && <p className="m">📎 {a.attachments.map(f => f.name).join(', ')}</p>}</div>
    </div>
    <div className="grid2">
      <div className="card"><p className="k">{t('your_score')}</p>
        <div className="score">{[['q_fit'], ['q_evidence'], ['q_reversible'], ['q_payback']].map(([k]) => <><div className="q" key={k + 'l'}>{t(k)}</div><div className="seg" key={k}>{[0, 1, 2, 3].map(v => <button key={v} className={my[k] === v ? 'on' : ''} onClick={() => setQ(k, v)}>{v}</button>)}</div></>)}</div>
        <p className="m" style={{ marginTop: 10 }}>{t('total')}: <b>{myTotal ?? '—'}</b> / 12</p>
      </div>
      <div className={'card ' + (colorOf(tot.total) === 'green' ? 'g' : colorOf(tot.total) === 'yellow' ? '' : 'o')} style={colorOf(tot.total) === 'yellow' ? { background: 'var(--yt)', borderColor: 'transparent' } : {}}>
        <p className="k">{t('room_avg')} · {tot.scorers || 0} {t('scorers')}</p>
        <div className={'big ' + colorOf(tot.total)}>{tot.total ?? '—'}<span style={{ fontSize: 18, color: 'var(--mut)' }}> / 12</span></div>
        <div className="m" style={{ marginTop: 8 }}>{t('q_fit')} {tot.fit ?? '—'} · {t('q_evidence')} {tot.evidence ?? '—'} · {t('q_reversible')} {tot.reversible ?? '—'} · {t('q_payback')} {tot.payback ?? '—'}</div>
        <p className="m" style={{ fontSize: 13 }}>{t('legend')}</p>
        {profile.role === 'admin' && <><p className="k">{t('decide')}</p><div className="btns" style={{ marginTop: 4 }}>
          <button className="btn" onClick={() => decide('pitched')}>{t('set_pitched')}</button>
          <button className="btn g" onClick={() => decide('green')}>{t('set_green')}</button>
          <button className="btn y" onClick={() => decide('yellow')}>{t('set_yellow')}</button>
          <button className="btn" onClick={() => decide('gate')}>{t('set_gate')}</button></div></>}
      </div>
    </div>
  </>
}

/* ---------------- OUTPUTS ---------------- */
function Outputs({ t, lang, refd }) {
  const [rows, setRows] = useState([])
  useEffect(() => { Promise.all([supabase.from('asks').select('*, departments(name_en,name_ar,code,directorates(name_en))').eq('cycle_id', refd.cycle.id).neq('status', 'withdrawn').order('department_id'), supabase.from('ask_totals').select('*')]).then(([a, tt]) => { const m = Object.fromEntries((tt.data || []).map(x => [x.ask_id, x])); setRows((a.data || []).map(x => ({ ...x, ask_totals: m[x.id] || {} }))) }) }, [refd.cycle.id])
  const sums = rows.reduce((s, a) => { const g = a.status === 'green'; return { capex: s.capex + capex(a), opex: s.opex + opexYear(a), gc: s.gc + (g ? capex(a) : 0), go: s.go + (g ? opexYear(a) : 0) } }, { capex: 0, opex: 0, gc: 0, go: 0 })
  const xlsx = () => {
    const data = rows.map(a => { const tt = a.ask_totals || {}; const oy = opexYear(a); return {
      Directorate: a.departments?.directorates?.name_en, Department: a.departments?.name_en, Title: a.title, Lane: a.lane, Register: a.register_code, 'Goal (own words)': a.lane_other, Quarter: a.quarter, 'Capex class': a.capex_class, 'CAPEX (EGP)': a.quote_decides ? null : capex(a), 'Quote decides': a.quote_decides ? 'yes' : '',
      'OPEX people': a.opex_people, 'OPEX training': a.opex_training, 'OPEX consumables': a.opex_consumables, 'OPEX maintenance': a.opex_maintenance, 'OPEX licences': a.opex_licences, 'OPEX other': a.opex_other, 'OPEX / year': oy, 'Year-one total': capex(a) + oy,
      'What': a.what_text, 'Return': a.return_text, 'Return when': a.return_when, 'Measure': a.measure_text, 'Measure when': a.measure_when, 'If not funded': a.if_not_funded, 'What we stop': a.what_we_stop,
      'Score fit': tt.fit, 'Score evidence': tt.evidence, 'Score reversible': tt.reversible, 'Score payback': tt.payback, 'Score total': tt.total, 'Scorers': tt.scorers, Status: a.status, 'Submitted': a.submitted_at,
    } })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Asks')
    const sum = Object.entries(rows.reduce((m, a) => { const d = a.departments?.name_en; m[d] = m[d] || { Department: d, Asks: 0, 'CAPEX (EGP)': 0, 'OPEX / year': 0, 'Funded CAPEX': 0, 'Funded OPEX / year': 0 }; m[d].Asks++; m[d]['CAPEX (EGP)'] += capex(a); m[d]['OPEX / year'] += opexYear(a); if (a.status === 'green') { m[d]['Funded CAPEX'] += capex(a); m[d]['Funded OPEX / year'] += opexYear(a) } return m }, {})).map(([, v]) => v)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sum), 'By department')
    XLSX.writeFile(wb, `smartBudget_${refd.cycle.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }
  return <>
    <div className="hero"><p className="k">{refd.cycle.name}</p><h2>{t('outputs_title')}</h2><p className="m">{t('outputs_hint')}</p>
      <div className="btns"><button className="btn p" onClick={xlsx}>⬇ {t('export_xlsx')}</button></div></div>
    <div className="tot" style={{ marginTop: 12 }}><div><span>{t('sum_capex')} · {rows.length} {t('count_asks')}</span><b>{fmt(sums.capex)}</b></div><div className="o"><span>{t('sum_opex')}</span><b>{fmt(sums.opex)}</b></div><div style={{ background: 'var(--gt)' }}><span>{t('green')}: {t('capex_lbl')} · {t('opex_lbl')}</span><b>{fmt(sums.gc)} · {fmt(sums.go)}</b></div></div>
    <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}><table className="tb"><thead><tr><th>{t('department')}</th><th>{t('s_title')}</th><th>{t('capex_lbl')}</th><th>{t('opex_lbl')}</th><th>{t('total')}</th><th>{t('stage')}</th></tr></thead><tbody>
      {rows.map(a => { const tt = a.ask_totals || {}; return <tr key={a.id}><td>{a.departments?.[lang === 'ar' ? 'name_ar' : 'name_en']}</td><td>{a.title}</td><td>{a.quote_decides ? '?' : fmt(capex(a))}</td><td>{fmt(opexYear(a))}</td><td><b className={colorOf(tt.total)}>{tt.total ?? '—'}</b></td><td><span className={'pill ' + a.status}>{t(a.status)}</span></td></tr> })}
    </tbody></table></div>
  </>
}

/* ---------------- PEOPLE ---------------- */
function People({ t, lang, refd, show }) {
  const empty = { email: '', name: '', role: 'head', department_id: null, directorate_id: null, in_room: false }
  const [list, setList] = useState([]); const [n, setN] = useState(empty); const [busy, setBusy] = useState(false)
  const nm = (x) => x?.[lang === 'ar' ? 'name_ar' : 'name_en']
  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [])
  const clean = ({ id, user_id, created_at, invited_at, last_seen_at, ...x }) => ({ ...x, department_id: x.role === 'head' ? x.department_id : null, directorate_id: x.role === 'director' ? x.directorate_id : (x.role === 'admin' ? x.directorate_id : null) })
  const add = async (e) => {
    e.preventDefault()
    if (n.role === 'head' && !n.department_id) { show(t('missing') + ': ' + t('department')); return }
    if (n.role === 'director' && !n.directorate_id) { show(t('missing') + ': ' + t('directorate')); return }
    const { error } = await supabase.from('profiles').insert(clean({ ...n, email: n.email.trim().toLowerCase() }))
    if (error) show(error.message); else { setN(empty); load() }
  }
  const upd = async (p, patch) => { const { error } = await supabase.from('profiles').update(clean({ ...p, ...patch })).eq('id', p.id); if (error) show(error.message); else load() }
  const invite = async (p) => {
    const { error } = await supabase.auth.signInWithOtp({ email: p.email, options: { emailRedirectTo: window.location.origin } })
    if (error) { show(error.message); return false }
    await supabase.from('profiles').update({ invited_at: new Date().toISOString() }).eq('id', p.id); return true
  }
  const one = async (p) => { setBusy(true); if (await invite(p)) show(t('invite_ok') + ' ' + p.email); setBusy(false); load() }
  const all = async () => { setBusy(true); for (const p of list.filter(x => !x.last_seen_at && !x.invited_at && x.role !== 'pending')) { if (!(await invite(p))) break } setBusy(false); load() }
  const place = (x, set) => x.role === 'head'
    ? <DeptSelect value={x.department_id} onChange={v => set({ department_id: v })} deps={refd.departments} refd={refd} lang={lang} blank />
    : (x.role === 'director' || x.role === 'admin')
      ? <select value={x.directorate_id || ''} onChange={e => set({ directorate_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{refd.directorates.map(g => <option key={g.id} value={g.id}>{nm(g)}</option>)}</select>
      : <span className="m">—</span>
  const roles = (v, on) => <select value={v} onChange={e => on(e.target.value)}>{v === 'pending' && <option value="pending">{t('r_pending')}</option>}<option value="head">{t('r_head')}</option><option value="director">{t('r_director')}</option><option value="excom">{t('r_excom')}</option><option value="admin">{t('r_admin')}</option></select>
  const waiting = list.filter(x => !x.last_seen_at && !x.invited_at && x.role !== 'pending').length
  return <>
    <div className="card"><h2>{t('people_title')}</h2><p className="m">{t('people_hint')}</p>
      <form onSubmit={add} className="row">
        <label className="f"><span>{t('email')}</span><input type="email" required value={n.email} onChange={e => setN({ ...n, email: e.target.value })} /></label>
        <label className="f"><span>{t('name')}</span><input type="text" value={n.name} onChange={e => setN({ ...n, name: e.target.value })} /></label>
        <label className="f"><span>{t('role')}</span>{roles(n.role, v => setN({ ...n, role: v }))}</label>
        <label className="f"><span>{n.role === 'head' ? t('department') : t('directorate')}</span>{place(n, patch => setN({ ...n, ...patch }))}</label>
        <label className="f" style={{ flex: 'none', display: 'flex', gap: 8, alignItems: 'center', alignSelf: 'end' }}><input type="checkbox" checked={n.in_room} onChange={e => setN({ ...n, in_room: e.target.checked })} /> {t('sits_room')}</label>
        <div style={{ flex: 'none', alignSelf: 'end', marginBottom: 10 }}><button className="btn p">＋ {t('add_person')}</button></div>
      </form></div>
    {waiting > 0 && <div className="btns"><button className="btn p" disabled={busy} onClick={all}>✉ {t('invite_all')} ({waiting})</button></div>}
    <div className="card" style={{ overflowX: 'auto' }}><table className="tb"><thead><tr><th>{t('email')}</th><th>{t('name')}</th><th>{t('role')}</th><th>{t('directorate')} / {t('department')}</th><th>{t('sits_room')}</th><th></th></tr></thead><tbody>
      {list.map(p => <tr key={p.id}><td>{p.email}</td><td><input type="text" defaultValue={p.name || ''} onBlur={e => e.target.value !== (p.name || '') && upd(p, { name: e.target.value })} /></td>
        <td>{roles(p.role, v => upd(p, { role: v }))}</td>
        <td>{place(p, patch => upd(p, patch))}</td>
        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.in_room} onChange={e => upd(p, { in_room: e.target.checked })} /></td>
        <td style={{ whiteSpace: 'nowrap' }}>{p.last_seen_at ? <span className="pill green">✓ {t('signed_in')}</span> : <button className="btn" disabled={busy} onClick={() => one(p)}>✉ {p.invited_at ? t('reinvite') : t('invite')}</button>}</td></tr>)}
    </tbody></table></div>
  </>
}
