import { Fragment, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { t as T, fmt, approx } from './i18n'
import * as XLSX from 'xlsx'
import { readWorkbook, notice, planToDate } from './finance'
import { HELP } from './help'
import { GUIDE } from './guide'
import Budgootee from './Budgootee'
import { RatifyCard, Rulebook, useRatifier } from './Ratifier'
import { chime, soundOn, setSound } from './cinema'

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
  const [welcome, setWelcome] = useState(location.hash === '#welcome')
  const [tick, setTick] = useState(0)
  const [guide, setGuide] = useState(location.hash === '#guide')
  // sign-in links land on #confirm…&token_hash=…: a person presses one button to sign in, so Outlook's link scanner cannot use the link up first
  const [confirm] = useState(() => { const h = new URLSearchParams(location.hash.slice(1)); return h.get('token_hash') ? { token_hash: h.get('token_hash'), type: h.get('type') || 'email' } : null })
  const [expired] = useState(() => /error_code=otp_expired|access_denied/.test(location.hash))
  useEffect(() => { const on = () => { setWelcome(location.hash === '#welcome'); setGuide(location.hash === '#guide') }; window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on) }, [])
  useEffect(() => { document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang; localStorage.setItem('sb_lang', lang) }, [lang])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*, departments(*), directorates(*)').eq('user_id', session.user.id).maybeSingle().then(({ data }) => { setProfile(data); if (data && !data.last_seen_at) { try { sessionStorage.removeItem('sb_intro') } catch { /* private mode */ } setWelcome(true) } if (data && !data.last_seen_at) supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id).then(() => {}) })
  }, [session, tick])
  // a pending person waits for Tee to give them a role: look again when they come back to the tab, and every 20 s
  const waiting = profile?.role === 'pending'
  useEffect(() => {
    if (!waiting) return
    const again = () => { if (!document.hidden) setTick(x => x + 1) }
    const id = setInterval(again, 20000); document.addEventListener('visibilitychange', again); window.addEventListener('focus', again)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again) }
  }, [waiting])

  if (session === undefined) return null
  if (confirm && !session) return <Confirm t={t} lang={lang} setLang={setLang} confirm={confirm} />
  if (guide) return <Guide t={t} lang={lang} setLang={setLang} onBack={() => { history.replaceState(null, '', ' '); setGuide(false) }} />
  if (!session || welcome) return <Login t={t} lang={lang} setLang={setLang} expired={expired} preview={!!session} onBack={() => { history.replaceState(null, '', ' '); setWelcome(false) }} />
  if (!profile) return <Shell t={t} lang={lang} setLang={setLang} profile={null}><div className="wrap"><div className="card">…</div></div></Shell>
  if (profile.role === 'pending') return <Shell t={t} lang={lang} setLang={setLang} profile={profile}><div className="wrap"><div className="card o"><h2>{t('pending_title')}</h2><p>{t('pending_text')}</p><p className="m">{profile.email}</p><div className="btns"><button className="btn p" onClick={() => setTick(x => x + 1)}>↻ {t('pending_again')}</button></div></div></div></Shell>
  return <Main t={t} lang={lang} setLang={setLang} profile={profile} />
}

/* "فهمني" mode: a side panel that explains whatever field or button you touch (anything with data-help) */
function HelpPanel({ lang, onClose }) {
  const [key, setKey] = useState('intro')
  useEffect(() => {
    const pick = (e) => { const el = e.target.closest?.('[data-help]'); if (el && el.closest('.helpp') == null) { const k = el.getAttribute('data-help'); if (HELP[lang][k]) setKey(k) } }
    document.addEventListener('focusin', pick); document.addEventListener('click', pick, true); document.addEventListener('mouseover', pick)
    return () => { document.removeEventListener('focusin', pick); document.removeEventListener('click', pick, true); document.removeEventListener('mouseover', pick) }
  }, [lang])
  const h = HELP[lang][key] || HELP[lang].intro
  return <aside className="helpp" aria-live="polite">
    <div className="rh"><b>💡 {lang === 'ar' ? 'فهمني' : 'Explain'}</b><button className="btn ghost sm" onClick={onClose}>✕</button></div>
    <h3>{h.t}</h3><p>{h.b}</p>{h.how && <p className="how">👉 {h.how}</p>}
    {key !== 'intro' && <button className="btn ghost sm" onClick={() => setKey('intro')}>{lang === 'ar' ? 'إزاي أستخدم الوضع ده؟' : 'How does this mode work?'}</button>}
  </aside>
}

// two looks: the business one (default) and the dark metallic "arena" one; remembered per browser
const THEME0 = (() => { try { return localStorage.getItem('sb_theme') || 'biz' } catch { return 'biz' } })()
if (typeof document !== 'undefined') document.documentElement.dataset.theme = THEME0
function Shell({ t, lang, setLang, profile, children, tabs, tab, setTab }) {
  const [theme, setTheme] = useState(THEME0)
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('sb_theme', theme) } catch { /* private mode */ } }, [theme])
  const [explain, setExplain] = useState(() => { try { return localStorage.getItem('sb_explain') === '1' } catch { return false } })
  useEffect(() => { document.body.classList.toggle('explain', explain); try { localStorage.setItem('sb_explain', explain ? '1' : '0') } catch { /* private mode */ } }, [explain])
  return <>
    <div className="top">
      <img src="/logo.png" alt="" />
      <a className="brand" href="#welcome" title="Welcome" onClick={() => { try { sessionStorage.removeItem('sb_intro') } catch { /* private mode */ } }}>smart<span>Budget</span> <span className="m" style={{ color: '#C9D6DF', fontWeight: 400 }}>· {t('tagline')}</span></a>
      <div className="sp" />
      {profile && <div className="who">{profile.name || profile.email}<br />{(profile.departments || profile.directorates)?.[lang === 'ar' ? 'name_ar' : 'name_en'] || ''}</div>}
      <a className="btn glass" href="#guide" data-help="guide">📖 {t('guide')}</a>
      <button className={'btn glass' + (explain ? ' on' : '')} aria-pressed={explain} onClick={() => setExplain(!explain)}>? {t('explain')}</button>
      <button className="btn glass" data-help="theme" title={t(theme === 'arena' ? 'theme_biz' : 'theme_arena')} aria-pressed={theme === 'arena'} onClick={() => setTheme(theme === 'arena' ? 'biz' : 'arena')}>{theme === 'arena'
        ? <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="#FFE08A" /><g stroke="#FFE08A" strokeWidth="2" strokeLinecap="round"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></g></svg>
        : <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="#E8EEF3" /><circle cx="17" cy="5" r="1.2" fill="#FFE08A" /><circle cx="20" cy="9" r=".8" fill="#FFE08A" /></svg>}</button>
      <button className="btn glass" data-help="lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t('lang')}</button>
      {profile && <button className="btn glass" data-help="pw" title={t('pw_set')} onClick={async () => {
        const p1 = prompt(t('pw_set') + ' (8+)'); if (!p1) return; if (p1.length < 8) { alert(t('pw_short')); return }
        const p2 = prompt(t('pw_again')); if (p1 !== p2) { alert(t('pw_nomatch')); return }
        const { error } = await supabase.auth.updateUser({ password: p1 }); alert(error ? error.message : '✓ ' + t('pw_ok'))
      }}>🔑 <span className="pwl">{t('pw')}</span></button>}
      {profile && <button className="btn glass" onClick={() => supabase.auth.signOut()}>{t('sign_out')}</button>}
    </div>
    {tabs && <div className="tabs">{tabs.map(x => <button key={x.id} data-help={'tab_' + x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>{x.label}</button>)}</div>}
    {children}
    {explain && <HelpPanel lang={lang} onClose={() => setExplain(false)} />}
    {profile && profile.role !== 'pending' && <Budgootee t={t} lang={lang} profile={profile} screen={tab || ''} />}
  </>
}

// one page that explains the whole journey; opens from the top bar or the landing (#guide), signed in or not
const md = (x) => x.split(/(\*\*[^*]+\*\*)/).map((p, i) => p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p)
function Guide({ t, lang, setLang, onBack }) {
  const g = GUIDE[lang] || GUIDE.en
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return <>
    <div className="top"><img src="/logo.png" alt="" /><span className="brand">smart<span>Budget</span></span><div className="sp" />
      <button className="btn glass" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t('lang')}</button>
      <button className="btn glass" onClick={onBack}>{t('back_app')}</button></div>
    <div className="wrap guide">
      <div className="hero"><p className="k">📖 {t('guide')}</p><h2>{g.title}</h2><p>{g.lead}</p></div>
      <nav className="gtoc">{g.sections.map((x, i) => <a key={i} href={'#g' + i} onClick={e => { e.preventDefault(); document.getElementById('g' + i)?.scrollIntoView({ behavior: 'smooth' }) }}>{x.icon} {x.h}</a>)}</nav>
      {g.sections.map((x, i) => <section key={i} id={'g' + i} className="card gsec">
        <h3><span>{x.icon}</span> {x.h}</h3>
        {(x.p || []).map((p, j) => <p key={j}>{md(p)}</p>)}
        {x.steps && <ol>{x.steps.map((p, j) => <li key={j}>{md(p)}</li>)}</ol>}
        {x.qa && x.qa.map(([q, a], j) => <details key={j}><summary>{q}</summary><p>{a}</p></details>)}
        {x.tip && <div className="gtip">💡 {x.tip}</div>}
      </section>)}
      <div className="btns"><button className="btn p" onClick={onBack}>{t('back_app')}</button></div>
    </div>
  </>
}

function Confirm({ t, lang, setLang, confirm }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState(null)
  const go = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.verifyOtp({ token_hash: confirm.token_hash, type: confirm.type })
    setBusy(false)
    if (error) setErr(t('link_dead')); else history.replaceState(null, '', ' ')
  }
  return <Shell t={t} lang={lang} setLang={setLang}><div className="wrap login"><div className="card center">
    <img src="/logo.png" alt="Al Manar Group" /><h1>{t('confirm_title')}</h1><p className="m">{t('confirm_hint')}</p>
    <div className="btns" style={{ justifyContent: 'center' }}><button className="btn p" disabled={busy} onClick={go}>{busy ? '…' : t('confirm_btn')} {lang === 'ar' ? '←' : '→'}</button></div>
    {err && <><p className="err">{err}</p><p><a href="/">{t('link_new')}</a></p></>}
  </div></div></Shell>
}

function Login({ t, lang, setLang, preview, onBack, expired }) {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false)
  // two ways in: the e-mail link (always works), or a password the person set once from the 🔑 button
  const [code, setCode] = useState(''); const [usePw, setUsePw] = useState(() => { try { return localStorage.getItem('sb_pw') === '1' } catch { return false } }); const [pw, setPw] = useState('')
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null)
    if (usePw) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
      setBusy(false); if (error) setErr(t('pw_wrong')); else { try { localStorage.setItem('sb_pw', '1') } catch { /* private mode */ } }
      return
    }
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } })
    setBusy(false); if (error) setErr(error.message); else setSent(true)
  }
  // the opening: a golden drop of oil falls onto the Al Manar mark and ripples out, once per visit (skipped for people who turn motion off)
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [intro, setIntro] = useState(() => { try { return !calm && !sessionStorage.getItem('sb_intro') } catch { return !calm } })
  const [sound, setSnd] = useState(soundOn())
  useEffect(() => { if (!intro) return; const id = setTimeout(() => endIntro(), 6200); return () => clearTimeout(id) }, [intro]) // eslint-disable-line react-hooks/exhaustive-deps
  const endIntro = () => { setIntro(false); try { sessionStorage.setItem('sb_intro', '1') } catch { /* private mode */ } }
  // sound is never automatic: it plays on the visitor's first click if they turned it on before
  useEffect(() => { if (!sound) return; const once = () => chime(); window.addEventListener('pointerdown', once, { once: true }); return () => window.removeEventListener('pointerdown', once) }, [sound])
  const toggleSound = () => { const v = !sound; setSnd(v); setSound(v); if (v) chime() }
  return <Shell t={t} lang={lang} setLang={setLang}>
    {intro && <div className="stage" onClick={endIntro}>
      <div className="gold" /><div className="ripple" /><div className="ripple r2" /><div className="ripple r3" /><div className="drop" /><div className="mark"><img src="/mark.png" alt="" /></div>
      <div className="title">smart<span>Budget</span></div><div className="sub">{t('tagline')}</div>
      <div className="stage-btns"><button className="btn glass" onClick={e => { e.stopPropagation(); if (!sound) { setSnd(true); setSound(true) } chime() }}>🔊 {t('land_sound')}</button><button className="btn glass" onClick={endIntro}>{t('land_skip')} ›</button></div>
    </div>}
    <div className="landing">
      <div className="hero land">
        <div className="land-mark" aria-hidden="true"><div className="ripple" /><div className="ripple r2" /><div className="ripple r3" /><img src="/mark.png" alt="" /></div>
        <p className="k rise" style={{ '--d': '0s' }}>{t('land_kicker')}</p><h1 className="rise" style={{ '--d': '.1s' }}>{t('land_title')}</h1><p className="lead rise" style={{ '--d': '.2s' }}>{t('land_lead')}</p>
        <div className="btns rise" style={{ '--d': '.3s', marginTop: 0, marginBottom: 18 }}><button className="btn p" onClick={() => { if (preview) { onBack(); return } const el = document.querySelector('.login input[type=email]'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => el?.focus(), 400) }}>{preview ? t('back_app') : t('login_title')} {lang === 'ar' ? '←' : '→'}</button><a className="btn glass" href="#guide">📖 {t('land_guide')}</a></div>
        <button className="btn glass snd" aria-pressed={sound} title={t('land_sound')} onClick={toggleSound}>{sound ? '🔊' : '🔈'}</button>
        <div className="feats">{[['🧭', 'land_f1'], ['💰', 'land_f2'], ['🗳️', 'land_f3'], ['💡', 'land_f4']].map(([i, k], n) => <div key={k} className="feat rise" style={{ '--d': (0.35 + n * 0.12) + 's' }}><span>{i}</span><b>{t(k + '_t')}</b><p>{t(k)}</p></div>)}</div></div>
    </div>
    {preview ? <div className="wrap login"><div className="card center rise" style={{ '--d': '.8s' }}><img src="/logo.png" alt="Al Manar Group" /><div className="btns" style={{ justifyContent: 'center' }}><button className="btn p" onClick={onBack}>{t('back_app')} {lang === 'ar' ? '←' : '→'}</button></div></div></div> : <div className="wrap login">
      <div className="card center rise" style={{ '--d': '.8s' }}>
        <img src="/logo.png" alt="Al Manar Group" />
        <h1>{t('login_title')}</h1>
        {expired && !sent && <p className="card o" style={{ padding: 10, fontSize: 15 }}>⏰ {t('link_dead')}</p>}
        {sent ? <form onSubmit={async e => { e.preventDefault(); setBusy(true); setErr(null); const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }); setBusy(false); if (error) setErr(t('code_bad')); else history.replaceState(null, '', ' ') }}>
          <p className="m">{t('link_sent')}</p>
          <p className="m" style={{ marginTop: 14 }}><b>{t('code_or')}</b></p>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8, maxWidth: 260 }} />
          <div className="btns" style={{ justifyContent: 'center' }}><button className="btn p" disabled={busy || code.length < 6}>{t('login_title')}</button><button type="button" className="btn ghost" onClick={() => { setSent(false); setCode('') }}>{t('code_again')}</button></div>
          {err && <p className="err">{err}</p>}
        </form> : <form onSubmit={go}>
          <div className="seg wide loginway" role="tablist">{[[false, '📧 ' + t('way_link')], [true, '🔑 ' + t('pw')]].map(([v, l]) => <button key={l} type="button" role="tab" aria-selected={usePw === v} className={usePw === v ? 'on' : ''} onClick={() => { setUsePw(v); setErr(null) }}>{l}</button>)}</div>
          <p className="m">{usePw ? t('pw_hint') : t('login_hint')}</p>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@almanargroup.com" autoComplete="username" />
          {usePw && <input type="password" required value={pw} onChange={e => setPw(e.target.value)} placeholder={t('pw')} autoComplete="current-password" style={{ marginTop: 10, width: '100%', padding: '11px 12px', border: '1px solid #D3DCE3', borderRadius: 10 }} />}
          <div className="btns" style={{ justifyContent: 'center' }}><button className="btn p" disabled={busy}>{usePw ? t('login_title') : t('send_link')}</button></div>
          {usePw && <p className="m" style={{ fontSize: 13 }}>{t('pw_first')}</p>}
          {err && <p className="err">{err}</p>}
        </form>}
      </div>
    </div>}
  </Shell>
}

function Main({ t, lang, setLang, profile }) {
  const isStaff = profile.role === 'admin' || profile.role === 'excom'
  const inRoom = isStaff || profile.in_room
  const tabs = [
    ...(profile.role !== 'excom' ? [{ id: 'asks', label: t('nav_asks') }] : []),
    ...(inRoom ? [{ id: 'room', label: t('nav_room') }] : []),
    { id: 'budget', label: t('nav_budget') },
    ...(isStaff ? [{ id: 'out', label: t('nav_outputs') }] : []),
    ...(profile.role === 'admin' ? [{ id: 'people', label: t('nav_people') }, { id: 'ideas', label: t('nav_ideas') }] : []),
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
    <div className={'wrap' + (tab === 'people' ? ' wide' : '')}>
      {tab === 'asks' && ref.cycle && <Asks t={t} lang={lang} profile={profile} refd={ref} show={show} />}
      {tab === 'room' && ref.cycle && <Room t={t} lang={lang} profile={profile} refd={ref} show={show} />}
      {tab === 'budget' && <Budget t={t} lang={lang} profile={profile} refd={ref} show={show} />}
      {tab === 'out' && ref.cycle && <Outputs t={t} lang={lang} profile={profile} refd={ref} />}
      {tab === 'people' && <People t={t} lang={lang} refd={ref} show={show} />}
      {tab === 'ideas' && <Ideas t={t} lang={lang} refd={ref} />}
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
    <div className="amt"><span className="m">{t('capex_lbl')}</span><b>{a.quote_decides ? t('quote_decides').split('—')[0] : fmt(capex(a))}</b><span className="m">{t('opex_lbl')} {fmt(opexYear(a))}</span></div>
  </div>
}

// one row per department in the director's scope, grouped by directorate (own directorate first, open).
// Other directorates start folded into one summary line; a click opens them.
function Board({ t, lang, profile, refd, list, pick, onPick }) {
  const [heads, setHeads] = useState([])
  useEffect(() => { supabase.from('profiles').select('name,email,department_id,last_seen_at').eq('role', 'head').then(({ data }) => setHeads(data || [])) }, [])
  const nm = (x) => x?.[lang === 'ar' ? 'name_ar' : 'name_en']
  const deps = myDeps(profile, refd)
  const mine = myDirectorate(profile, refd)
  const rows = deps.map(d => {
    const as = list.filter(a => a.department_id === d.id)
    return { d, head: heads.find(h => h.department_id === d.id), n: as.length, draft: as.filter(a => ['draft', 'returned'].includes(a.status)).length, you: as.filter(a => a.status === 'with_director').length, room: as.filter(a => !['draft', 'returned', 'with_director'].includes(a.status)).length, capex: as.reduce((s, a) => s + capex(a), 0) }
  })
  const dirs = [...refd.directorates].sort((a, b) => (b.id === mine) - (a.id === mine))
  const groups = dirs.map(g => ({ g, rows: rows.filter(r => r.d.directorate_id === g.id) })).filter(x => x.rows.length)
  const loose = rows.filter(r => !r.d.directorate_id); if (loose.length) groups.push({ g: { id: 0, name_en: '—', name_ar: '—' }, rows: loose })
  const many = groups.length > 1
  const [open, setOpen] = useState(() => new Set([mine]))
  const flip = (id) => setOpen(o => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n })
  const max = Math.max(1, ...rows.map(r => r.capex))
  const sum = (rs, k) => rs.reduce((s, r) => s + r[k], 0)
  const cell = (v, cls) => v ? <span className={'pill ' + cls}>{v}</span> : '·'
  return <div className="card" style={{ overflowX: 'auto', marginTop: 12 }}><p className="k">{t('board_title')}</p><p className="m" style={{ marginTop: -4 }}>{t('board_hint')}</p>
    {many && <div className="btns" style={{ marginTop: 0 }}><button className="btn" onClick={() => setOpen(new Set(groups.map(x => x.g.id)))}>{t('board_open_all')}</button><button className="btn" onClick={() => setOpen(new Set([mine]))}>{t('board_fold')}</button></div>}
    <table className="tb board"><thead><tr><th>{t('department')}</th><th>{t('board_head')}</th><th>{t('board_draft')}</th><th>{t('board_with_you')}</th><th>{t('board_room')}</th><th>{t('board_capex')}</th></tr></thead><tbody>
      {groups.map(({ g, rows: rs }) => { const on = !many || open.has(g.id), n = sum(rs, 'n'), c = sum(rs, 'capex'); return <Fragment key={g.id}>
        {many && <tr className="grp" onClick={() => flip(g.id)}><td colSpan={2}><b>{on ? '▾' : lang === 'ar' ? '◂' : '▸'} {nm(g)}</b> <span className="m">· {rs.length} {t(rs.length === 1 ? 'board_dep' : 'board_deps')}</span></td>
          {n ? <><td>{cell(sum(rs, 'draft'), 'draft')}</td><td>{cell(sum(rs, 'you'), 'with_director')}</td><td>{cell(sum(rs, 'room'), 'submitted')}</td></> : <td colSpan={3}><span className="m">{t('board_not_started')}</span></td>}
          <td>{c ? <b>{fmt(c)}</b> : ''}</td></tr>}
        {on && rs.map(r => <tr key={r.d.id} className={(r.n ? '' : 'idle') + ' pickable' + (pick === r.d.id ? ' picked' : '')} title={t('board_pick')} onClick={() => onPick(pick === r.d.id ? null : r.d.id)}><td><b>{nm(r.d)}</b></td>
          <td>{r.head ? (r.head.name || r.head.email.split('@')[0]) : '—'}{r.head && !r.head.last_seen_at && <span className="m"> · {t('invite')}?</span>}</td>
          {r.n ? <><td>{cell(r.draft, 'draft')}</td><td>{cell(r.you, 'with_director')}</td><td>{cell(r.room, 'submitted')}</td></> : <td colSpan={3}><span className="pill draft">{t('board_not_started')}</span></td>}
          <td style={{ minWidth: 140 }}>{r.capex ? <><div>{fmt(r.capex)}</div><div className="bar"><i style={{ width: (100 * r.capex / max) + '%' }} /></div></> : ''}</td></tr>)}
      </Fragment> })}
    </tbody></table></div>
}

function Asks({ t, lang, profile, refd, show }) {
  const [list, setList] = useState([]); const [edit, setEdit] = useState(null)
  const [queue, setQueue] = useState(null) // review one by one: { ids, i }
  const [pick, setPick] = useState(null) // a department clicked in the board: show only its cards
  const [book, setBook] = useState(false) // the director's rulebook and ownership map
  const load = useCallback(async () => {
    const { data } = await supabase.from('asks').select('*, departments(name_en,name_ar,directorate_id)').eq('cycle_id', refd.cycle.id).neq('status', 'withdrawn').order('created_at')
    setList(data || [])
  }, [refd.cycle.id])
  useEffect(() => { load() }, [load])
  const goto = (q) => { if (!q || q.i >= q.ids.length) { setQueue(null); setEdit(null); if (q) show(t('review_done')); load(); return } const a = list.find(x => x.id === q.ids[q.i]); if (!a) return goto({ ...q, i: q.i + 1 }); setQueue(q); setEdit(a) }
  if (book) return <Rulebook t={t} lang={lang} refd={refd} show={show} onBack={() => setBook(false)} />
  if (edit) return <>
    {queue && <div className="review-bar"><b>▶ {t('review_one')}</b><span className="pill">{queue.i + 1} / {queue.ids.length}</span>
      <button className="btn" onClick={() => goto({ ...queue, i: queue.i + 1 })}>{t('review_skip')} {lang === 'ar' ? '‹' : '›'}</button>
      <button className="btn" onClick={() => goto(null)}>✕ {t('review_stop')}</button></div>}
    <AskForm key={edit.id || 'new'} t={t} lang={lang} profile={profile} refd={refd} ask={edit} show={show} onDone={() => queue ? goto({ ...queue, i: queue.i + 1 }) : (setEdit(null), load())} />
  </>
  const head = profile.role === 'head'
  const early = ['draft', 'returned']
  const byDept = (items) => refd.departments.map(d => [d, items.filter(a => a.department_id === d.id)]).filter(([, as]) => as.length)
    .concat(items.some(a => !refd.departments.find(d => d.id === a.department_id)) ? [[null, items.filter(a => !refd.departments.find(d => d.id === a.department_id))]] : [])
  const shown = pick ? list.filter(a => a.department_id === pick) : list
  const ss = shown.reduce((s, a) => ({ capex: s.capex + capex(a), opex: s.opex + opexYear(a) }), { capex: 0, opex: 0 })
  const groups = head ? [[null, list]] : [
    [t('waiting_you'), shown.filter(a => a.status === 'with_director')],
    [t('in_progress'), shown.filter(a => early.includes(a.status))],
    [t('in_room_lbl'), shown.filter(a => !early.includes(a.status) && a.status !== 'with_director')],
  ]
  return <>
    <div className="hero"><p className="k">{refd.cycle.name}{!head && (profile.directorates || profile.departments) ? ' · ' + (profile.directorates || profile.departments)[lang === 'ar' ? 'name_ar' : 'name_en'] : ''}</p><h2>{head ? t('nav_asks') : t('all_asks')}</h2>
      <p className="m">{list.length === 0 ? t('no_asks') : head ? t('flow_head') : t('flow_dir')}</p>
      <div className="btns"><button className="btn p" data-help="new_ask" onClick={() => setEdit({})}>＋ {t('new_ask')}</button>{!head && <button className="btn" data-help="rulebook" onClick={() => setBook(true)}>📜 {t('rat_book')}</button>}</div></div>
    {!head && <Board t={t} lang={lang} profile={profile} refd={refd} list={list} pick={pick} onPick={(id) => { setPick(id); if (id) setTimeout(() => document.querySelector('.pick-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />}
    {!head && pick && <div className="pick-bar"><span>{t('board_showing')} <b>{refd.departments.find(d => d.id === pick)?.[lang === 'ar' ? 'name_ar' : 'name_en']}</b> · {shown.length}</span><button className="btn" onClick={() => setPick(null)}>✕ {t('board_show_all')}</button></div>}
    {list.length > 0 && <div className="tot"><div><span>{t('sum_capex')}</span><b>{fmt(ss.capex)}</b></div><div className="o"><span>{t('sum_opex')}</span><b>{fmt(ss.opex)}</b></div><div><span>{t('sum_year1')}</span><b>{fmt(ss.capex + ss.opex)}</b></div></div>}
    {groups.map(([label, items], gi) => items.length > 0 && <div key={gi}>
      {label && <div className="grp-h"><p className="k">{label} · {items.length}</p>
        {gi === 0 && items.length > 1 && <button className="btn p" data-help="review_one" onClick={() => goto({ ids: byDept(items).flatMap(([, as]) => as.map(a => a.id)), i: 0 })}>▶ {t('review_one')}</button>}</div>}
      {!label && <div style={{ height: 12 }} />}
      {head ? items.map(a => <AskRow key={a.id} a={a} t={t} lang={lang} onOpen={setEdit} />)
        : byDept(items).map(([d, as]) => <div key={d?.id || 0} className="dep-grp"><p className="dep-h">{d ? d[lang === 'ar' ? 'name_ar' : 'name_en'] : '—'} <span className="m">· {as.length} · {fmt(as.reduce((s, a) => s + capex(a), 0))}</span></p>
          {as.map(a => <AskRow key={a.id} a={a} t={t} lang={lang} onOpen={setEdit} />)}</div>)}
    </div>)}
  </>
}

// defined outside AskForm so inputs keep focus while typing.
// need = required before sending: a ✓ shows once filled, a red hint only after the person leaves the box empty
function Field({ a, set, canEdit, k, label, hint, type = 'text', area, need, t }) {
  const [left, setLeft] = useState(false)
  const filled = String(a[k] ?? '').trim() !== ''
  const bad = need && canEdit && left && !filled
  const props = { value: a[k] ?? '', disabled: !canEdit, onChange: e => set(k, e.target.value), onBlur: () => setLeft(true), className: bad ? 'bad' : '' }
  return <label className="f" data-help={k}><span>{label}{hint ? ' — ' + hint : ''}{need && filled && <b className="ok"> ✓</b>}</span>
    {area ? <textarea {...props} /> : <input type={type} {...props} />}
    {bad && <small className="need">{t('needed')}</small>}</label>
}

// typed digits (Latin or Arabic-Indic) → plain number string; shown back with thousands separators
const digits = (v) => String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, '')
// OPEX as a list of costs, each of its own kind with its own fields (Ahmed, QC, 2026-11-01).
// The yearly totals still roll up into the six opex_* columns, so the room, outputs and Excel stay as they are.
const HAS_ITEMS = { on: false }
supabase.from('asks').select('opex_items').limit(1).then(({ error }) => { HAS_ITEMS.on = !error })
const KINDS = {
  people: { icon: '👷', col: 'opex_people' }, training: { icon: '🎓', col: 'opex_training' }, tools: { icon: '🛠️', col: 'opex_other' },
  place: { icon: '🏢', col: 'opex_other' }, consumables: { icon: '⚡', col: 'opex_consumables' }, maintenance: { icon: '🔧', col: 'opex_maintenance' },
  licences: { icon: '💳', col: 'opex_licences' }, other: { icon: '➕', col: 'opex_other' },
}
const N = (v) => Number(v) || 0
const itemYear = (x) => x.kind === 'people' ? N(x.count) * (N(x.salary) + N(x.extra)) * (13 - (N(x.from) || 1))
  : x.kind === 'training' ? N(x.count) * N(x.price)
  : x.kind === 'tools' ? N(x.count) * N(x.price)
  : x.kind === 'place' ? N(x.monthly) * (13 - (N(x.from) || 1))
  : N(x.amount)
const COL_KIND = { opex_people: 'people', opex_training: 'training', opex_consumables: 'consumables', opex_maintenance: 'maintenance', opex_licences: 'licences', opex_other: 'other' }
function OpexItems({ t, lang, a, setA, dirty, canEdit }) {
  // older cards only have the six totals: show each as one simple item
  const items = Array.isArray(a.opex_items) && a.opex_items.length ? a.opex_items
    : OPEX.filter(k => N(a[k])).map(k => ({ kind: COL_KIND[k], what: '', amount: N(a[k]) }))
  const write = (next) => {
    dirty.current = true
    const cols = Object.fromEntries(OPEX.map(k => [k, 0])); next.forEach(x => { cols[KINDS[x.kind].col] += itemYear(x) })
    setA(p => ({ ...p, opex_items: next, ...Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, String(Math.round(v))])) }))
  }
  const upd = (i, k, v) => write(items.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const months = (v, i) => <select value={v || 1} disabled={!canEdit} onChange={e => upd(i, 'from', Number(e.target.value))}>{Array.from({ length: 12 }, (_, m) => <option key={m} value={m + 1}>{new Date(2027, m, 1).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en', { month: 'long' })} · {12 - m} {t('ox_months')}</option>)}</select>
  const numIn = (x, i, k, label) => <label className="f" key={k}><span>{label}</span><input type="text" inputMode="numeric" dir="ltr" disabled={!canEdit} placeholder="0" value={x[k] ? Number(x[k]).toLocaleString('en') : ''} onChange={e => upd(i, k, digits(e.target.value))} />{N(x[k]) >= 1000 && <small className="words">{approx(lang, x[k])}</small>}</label>
  const fields = (x, i) => ({
    people: [numIn(x, i, 'count', t('ox_count')), numIn(x, i, 'salary', t('ox_salary')), numIn(x, i, 'extra', t('ox_extra')), <label className="f" key="f"><span>{t('ox_from')}</span>{months(x.from, i)}</label>],
    training: [numIn(x, i, 'count', t('ox_trainees')), numIn(x, i, 'price', t('ox_per_person'))],
    tools: [numIn(x, i, 'count', t('ox_qty')), numIn(x, i, 'price', t('ox_unit_year'))],
    place: [numIn(x, i, 'monthly', t('ox_monthly')), <label className="f" key="f"><span>{t('ox_from')}</span>{months(x.from, i)}</label>],
  }[x.kind] || [numIn(x, i, 'amount', t('ox_amount'))])
  const sum = (x) => ({ people: `${N(x.count)} × ${fmt(N(x.salary) + N(x.extra))} × ${13 - (N(x.from) || 1)}`, training: `${N(x.count)} × ${fmt(N(x.price))}`, tools: `${N(x.count)} × ${fmt(N(x.price))}`, place: `${fmt(N(x.monthly))} × ${13 - (N(x.from) || 1)}` }[x.kind])
  return <div data-help="opex">
    {items.length === 0 && <p className="m">{t('ox_empty')}</p>}
    {items.map((x, i) => <div key={i} className="oxi">
      <div className="oxh"><b>{KINDS[x.kind].icon} {t('ox_' + x.kind)}</b><span className="sp" /><b className="oxt">{fmt(itemYear(x))} <small>{t('ox_per_year')}</small></b>{canEdit && <button type="button" className="btn ghost sm" title={t('ox_remove')} onClick={() => write(items.filter((_, j) => j !== i))}>✕</button>}</div>
      {t('ox_hint_' + x.kind) !== 'ox_hint_' + x.kind && <p className="m">{t('ox_hint_' + x.kind)}</p>}
      <label className="f"><span>{t('ox_what_' + x.kind) !== 'ox_what_' + x.kind ? t('ox_what_' + x.kind) : t('ox_what')}</span><input type="text" value={x.what || ''} disabled={!canEdit} onChange={e => upd(i, 'what', e.target.value)} /></label>
      <div className="row">{fields(x, i)}</div>
      {sum(x) && itemYear(x) > 0 && <p className="m oxs">{sum(x)} = <b>{fmt(itemYear(x))}</b></p>}
    </div>)}
    {canEdit && <><p className="k" style={{ marginTop: 12 }}>{t('ox_add')}</p><div className="btns oxadd">{Object.entries(KINDS).map(([k, v]) => <button type="button" key={k} className="btn" onClick={() => write([...items, { kind: k, from: 1 }])}>{v.icon} {t('ox_' + k)}</button>)}</div></>}
  </div>
}

function MoneyInput({ a, set, canEdit, k, label, lang, disabled, need, t, help }) {
  const v = a[k] === '' || a[k] == null ? '' : Number(a[k]).toLocaleString('en')
  const filled = !!Number(a[k])
  return <label className="f" data-help={help || k}><span>{label}{need && filled && <b className="ok"> ✓</b>}</span>
    <input type="text" inputMode="numeric" dir="ltr" value={disabled ? '' : v} disabled={!canEdit || disabled} placeholder="0" onChange={e => { const d = digits(e.target.value); set(k, d === '' ? '' : String(Number(d))) }} />
    {!disabled && filled && <small className="words">{approx(lang, a[k])}</small>}</label>
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

const STEPS = ['step_goal', 'step_money', 'step_return', 'step_ifnot', 'step_review']

function AskForm({ t: tt, lang, profile, refd, ask, show, onDone }) {
  // section labels carried old card numbers ("4 · The return"); the steps now do the numbering
  const t = (k) => tt(k).replace(/^[0-9٠-٩]+\s*·\s*/, '')
  const NX = lang === 'ar' ? '←' : '→', BK = lang === 'ar' ? '→' : '←'
  const blank = { title: '', lane: '', register_code: '', lane_other: '', what_text: '', capex_class: 'light', capex_amount: '', quote_decides: false, quarter: 'Q1 2027', opex_people: '', opex_training: '', opex_consumables: '', opex_maintenance: '', opex_licences: '', opex_other: '', opex_notes: '', return_text: '', return_when: '', measure_text: '', measure_when: '', if_not_funded: '', what_we_stop: '', status: 'draft', department_id: profile.role === 'head' ? profile.department_id : null }
  const [a, setA] = useState({ ...blank, ...ask })
  const [files, setFiles] = useState([]); const [hist, setHist] = useState([]); const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(false)
  const [savedAt, setSavedAt] = useState(null); const [autoBusy, setAutoBusy] = useState(false)
  const dirty = useRef(false); const lock = useRef(false)
  const set = (k, v) => { dirty.current = true; setA(x => ({ ...x, [k]: v, ...((k === 'register_code' || k === 'budget_line_id') && v ? { link_none: false } : {}) })) }
  const deps = myDeps(profile, refd)
  // a card with no department yet is still the author's own (directors pick the department on the card)
  const mine = a.department_id ? deps.some(d => d.id === a.department_id) : true
  const st = a.status || 'draft'
  const isDir = profile.role === 'director' || profile.role === 'admin'
  const canEdit = profile.role === 'admin' || (mine && (profile.role === 'director' ? ['draft', 'with_director', 'returned', 'submitted', 'yellow'] : ['draft', 'returned', 'yellow']).includes(st))
  const authoring = canEdit && ['draft', 'returned', 'yellow'].includes(st) && !(isDir && st === 'with_director')
  const [step, setStep] = useState(authoring ? 0 : 4)
  const [note, setNote] = useState('')
  const [moveTo, setMoveTo] = useState(null); const [moveNote, setMoveNote] = useState('')
  const ratReady = useRatifier(profile.role === 'director' || profile.role === 'admin')
  // director or admin: the card belongs to another department (a pump is blending's, a sealing machine is filling's).
  // It goes to that department's head as "sent back", with a note, so they own it from here.
  const nmOf = (id) => refd.departments.find(d => d.id === id)?.[lang === 'ar' ? 'name_ar' : 'name_en'] || ''
  const moveDeps = (profile.role === 'admin' ? refd.departments : myDeps(profile, refd)).filter(d => d.id !== a.department_id)
  const move = async () => {
    if (!moveTo || busy) return; setBusy(true)
    const from = a.department_id, why = moveNote.trim()
    const msg = `${t('moved_from')} ${nmOf(from)}${why ? ': ' + why : ''}`
    const { error } = await supabase.from('asks').update({ department_id: moveTo, status: 'returned', director_note: msg, budget_line_id: null }).eq('id', a.id)
    if (error) { setBusy(false); show(error.message); return }
    await supabase.from('ask_events').insert({ ask_id: a.id, actor_id: profile.id, event: 'moved', detail: { from: nmOf(from), to: nmOf(moveTo), note: why || undefined } })
    setBusy(false); show('✓ ' + t('moved_ok') + ' ' + nmOf(moveTo)); onDone()
  }
  useEffect(() => {
    if (!a.id) return
    supabase.from('attachments').select('*').eq('ask_id', a.id).then(({ data }) => setFiles(data || []))
    supabase.from('ask_events').select('*, profiles(name,email)').eq('ask_id', a.id).order('at', { ascending: false }).then(({ data }) => setHist(data || []))
  }, [a.id])
  const num = (v) => (v === '' || v == null ? null : Number(v))
  const payload = (status) => ({
    cycle_id: refd.cycle.id, department_id: a.department_id, owner_id: profile.id, title: a.title.trim(), lane: a.register_code === 'ENGINE' ? 'engine' : a.register_code ? 'station' : 'other', register_code: a.register_code || null, lane_other: (a.lane_other || '').trim() || null,
    what_text: a.what_text, capex_class: a.capex_class, capex_amount: a.quote_decides ? null : num(a.capex_amount), quote_decides: !!a.quote_decides, quarter: a.quarter,
    ...Object.fromEntries(OPEX.map(k => [k, num(a[k]) ?? 0])), opex_notes: a.opex_notes, ...(HAS_ITEMS.on ? { opex_items: a.opex_items || [] } : {}), return_text: a.return_text, return_when: a.return_when, measure_text: a.measure_text, measure_when: a.measure_when,
    if_not_funded: a.if_not_funded, what_we_stop: a.what_we_stop, budget_line_id: a.budget_line_id || null, link_none: !!a.link_none && !a.register_code && !a.budget_line_id, status, submitted_at: status === 'submitted' ? new Date().toISOString() : a.submitted_at || null,
    ...(status === 'returned' ? { director_note: note.trim() } : {}),
  })
  // what is still empty before the card can be sent, with the step it lives on
  const missing = [
    !a.title.trim() && ['s_title', 0], !a.department_id && ['department', 0],
    !a.register_code && !(a.lane_other || '').trim() && ['s_other', 0], !String(a.what_text || '').trim() && ['s_what', 0],
    !a.quote_decides && !Number(a.capex_amount) && !opexYear(a) && ['capex_amount', 1],
    !String(a.return_text || '').trim() && ['s_return', 2], !String(a.measure_text || '').trim() && ['s_measure', 2],
    !String(a.if_not_funded || '').trim() && ['s_ifnot', 3],
  ].filter(Boolean)

  // auto-save drafts quietly, 1.5 s after the last keystroke
  useEffect(() => {
    if (!dirty.current || !authoring || !a.title.trim() || !a.department_id) return
    const h = setTimeout(async () => {
      if (lock.current) return
      lock.current = true; setAutoBusy(true); dirty.current = false
      const res = a.id ? await supabase.from('asks').update(payload(st)).eq('id', a.id).select('id').single() : await supabase.from('asks').insert(payload(st)).select('id').single()
      if (!res.error) {
        if (!a.id) { setA(x => ({ ...x, id: res.data.id })); await supabase.from('ask_events').insert({ ask_id: res.data.id, actor_id: profile.id, event: 'created' }) }
        setSavedAt(new Date())
      } else dirty.current = true
      lock.current = false; setAutoBusy(false)
    }, 1500)
    return () => clearTimeout(h)
  }, [a]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (status) => {
    if (!a.title.trim()) { show(t('missing') + ': ' + t('s_title')); return }
    if (!a.department_id) { show(t('missing') + ': ' + t('department')); return }
    if ((status === 'submitted' || status === 'with_director') && missing.length) { show(t('missing_send') + ': ' + missing.map(([k]) => t(k)).join(', ')); setStep(4); return }
    if (status === 'returned' && !note.trim()) { show(t('note_needed')); return }
    while (lock.current) await new Promise(r => setTimeout(r, 100))
    setBusy(true); dirty.current = false
    let res
    if (a.id) res = await supabase.from('asks').update(payload(status)).eq('id', a.id).select().single()
    else res = await supabase.from('asks').insert(payload(status)).select().single()
    setBusy(false)
    if (res.error) { show(res.error.message); return }
    const moved = status !== st || !a.id
    await supabase.from('ask_events').insert({ ask_id: res.data.id, actor_id: profile.id, event: moved && a.id ? 'status' : (a.id ? 'saved' : 'created'), detail: moved ? { status, ...(status === 'returned' ? { note: note.trim() } : {}) } : null })
    const done = ['submitted', 'with_director', 'returned'].includes(status) && status !== st
    setSavedAt(new Date())
    show(status === 'submitted' ? t('submitted_ok') : status === 'with_director' ? t('sent_director_ok') : '✓'); if (done) onDone(); else setA(x => ({ ...x, ...res.data }))
  }
  const upload = async (e) => {
    const f = e.target.files[0]; if (!f) return
    let id = a.id
    if (!id) { const r = await supabase.from('asks').insert(payload('draft')).select().single(); if (r.error) { show(r.error.message); return } id = r.data.id; setA(x => ({ ...x, id: r.data.id })) }
    const path = `${id}/${Date.now()}_${f.name}`
    const { error } = await supabase.storage.from('quotes').upload(path, f); if (error) { show(error.message); return }
    await supabase.from('attachments').insert({ ask_id: id, path, name: f.name, uploaded_by: profile.id })
    const { data } = await supabase.from('attachments').select('*').eq('ask_id', id); setFiles(data || [])
  }
  const open = async (p) => { const { data } = await supabase.storage.from('quotes').createSignedUrl(p, 600); if (data) window.open(data.signedUrl, '_blank') }
  const del = async () => { if (!a.id || !confirm('?')) return; await supabase.from('asks').delete().eq('id', a.id); onDone() }
  const withdraw = async () => { if (!confirm('?')) return; await supabase.from('asks').update({ status: 'withdrawn' }).eq('id', a.id); await supabase.from('ask_events').insert({ ask_id: a.id, actor_id: profile.id, event: 'withdrawn' }); onDone() }
  const oy = opexYear(a), cx = a.quote_decides ? 0 : capex(a)
  // the same amount typed as CAPEX and again as a yearly cost (Mohamed Hamed's pH meter: 40,000 + 40,000)
  const twice = cx > 0 && (oy === cx || (a.opex_items || []).some(x => itemYear(x) === cx || (x.kind === 'tools' && N(x.price) === cx)))
  const regLabel = r => (r.code === 'ENGINE' ? '' : r.code + ' · ') + (lang === 'ar' && r.title_ar ? r.title_ar : r.title_en)
  const linked = refd.register.find(r => r.code === a.register_code)
  const hints = linked ? [] : matchRegister(refd.register, [a.lane_other, a.title, a.what_text].join(' '))
  // the department's own GL lines: is this card already inside today's budget, or new money?
  const GB = useBudget(null, [a.department_id || -1])
  const gl = GB.lines.find(l => l.id === a.budget_line_id)
  const glHints = gl ? [] : matchLines(GB.lines, [a.title, a.lane_other, a.what_text].join(' '))
  const glLabel = (l) => (l.gl_code ? l.gl_code + ' · ' : '') + l.name + ' (' + l.fiscal_year + ')'
  const F = (p) => <Field a={a} set={set} canEdit={canEdit} t={t} {...p} />
  const go = (n) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const dep = refd.departments.find(d => d.id === a.department_id)
  const canMove = canEdit && isDir && a.id && ['draft', 'with_director', 'returned', 'yellow'].includes(st) && moveDeps.length > 0
  const R = ({ label, v }) => <div className="rv"><span>{label}</span><div>{v ? String(v) : <i className="m">—</i>}</div></div>

  return <>
    <div className="btns" style={{ marginTop: 0, alignItems: 'center' }}><button className="btn" onClick={onDone}>{BK} {t('back')}</button>{a.status && <span className={'pill ' + a.status}>{t(a.status)}</span>}
      <span className="m saved">{autoBusy ? t('saving') : savedAt ? `✓ ${t('saved_at')} ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>
    {a.director_note && ['returned', 'draft', 'with_director'].includes(st) && <div className="card o"><p className="k">{t('director_note')}</p><p>{a.director_note}</p></div>}
    <div className="steps" data-help="steps">{STEPS.map((k, n) => <button key={k} className={(n === step ? 'on ' : '') + (n < 4 && !missing.some(([, s]) => s === n) ? 'done' : '')} onClick={() => go(n)}><i>{n < 4 && !missing.some(([, s]) => s === n) ? '✓' : n + 1}</i><span>{t(k)}</span></button>)}</div>

    {step === 0 && <>
      <div className="card">{F({ k: 'title', label: t('s_title'), hint: t('s_title_h'), need: true })}
        {profile.role !== 'head' && <label className="f" data-help="department"><span>{t('department')}</span><DeptSelect value={a.department_id} onChange={v => set('department_id', v)} deps={deps} refd={refd} lang={lang} disabled={!canEdit} blank /></label>}
      </div>
      <div className="card"><p className="k">{t('s_lane')}</p>
        {F({ k: 'lane_other', label: t('s_other'), hint: t('s_other_hint'), need: !a.register_code })}
        {/* two optional links, side by side: which ExCom idea it serves, and which GL line pays for it */}
        {linked && <div className="row linked"><span className="pill">🎯 {t('linked_to')}: {regLabel(linked)}</span>{canEdit && <button className="btn ghost sm" onClick={() => set('register_code', '')}>{t('unlink')}</button>}</div>}
        {gl && <div className="row linked"><span className="pill green">📒 {t('gl_in')}: {glLabel(gl)} · {t('b_budget')} {fmt(gl.amount)} · {t('b_left')} {fmt(GB.line(gl.id).left)}</span>{canEdit && <button className="btn ghost sm" onClick={() => set('budget_line_id', null)}>{t('unlink')}</button>}</div>}
        {a.link_none && !linked && !gl && <div className="row linked"><span className="pill">⚪ {t('none_pill')}</span>{canEdit && <button className="btn ghost sm" onClick={() => set('link_none', false)}>{t('unlink')}</button>}</div>}
        {a.link_none && !linked && !gl && canEdit && <p className="m">✍️ {t('none_hint')}</p>}
        {canEdit && !linked && hints.map(r => <div key={r.code} className="card o hintc">💡 {t('looks_like')} <b>{regLabel(r)}</b> <button className="btn" onClick={() => set('register_code', r.code)}>{t('link_it')}</button></div>)}
        {canEdit && !gl && glHints.map(l => <div key={l.id} className="card o hintc">💡 {t('b_looks_gl')} <b>{glLabel(l)}</b> · {t('b_budget')} {fmt(l.amount)} · {t('b_left')} {fmt(GB.line(l.id).left)} <button className="btn" onClick={() => set('budget_line_id', l.id)}>{t('link_it')}</button></div>)}
        {!gl && !a.link_none && a.department_id && !glHints.length && a.title.trim().length > 4 && GB.lines.length > 0 && <p className="m">ℹ️ {t('b_not_in_gl')}</p>}
        {canEdit && (!linked || !gl) && !a.link_none && <div className="btns" style={{ marginTop: 6 }}>
          {!linked && <button data-help="link_excom" className={'btn ' + (pick === 'excom' ? 'p' : '')} onClick={() => setPick(pick === 'excom' ? false : 'excom')}>🎯 {t('link_excom')}</button>}
          {!gl && <button data-help="link_gl" className={'btn ' + (pick === 'gl' ? 'p' : '')} onClick={() => setPick(pick === 'gl' ? false : 'gl')}>📒 {t('link_gl')}</button>}
          {!linked && !gl && <button data-help="link_none" className="btn" onClick={() => { set('link_none', true); setPick(false) }}>⚪ {t('link_none')}</button>}
        </div>}
        {canEdit && pick === 'excom' && !linked && <label className="f"><span>{t('s_register')}</span><select value="" onChange={e => { set('register_code', e.target.value); setPick(false) }}><option value="">—</option>{refd.register.map(r => <option key={r.code} value={r.code}>{regLabel(r)}</option>)}</select></label>}
        {canEdit && pick === 'gl' && !gl && (!a.department_id ? <p className="m">ℹ️ {t('gl_pick_dept')}</p> : !GB.lines.length ? <p className="m">ℹ️ {t('gl_none_yet')}</p>
          : <label className="f"><span>{t('gl_choose')}</span><select value="" onChange={e => { if (e.target.value) { set('budget_line_id', Number(e.target.value)); setPick(false) } }}><option value="">—</option>{GB.lines.map(l => <option key={l.id} value={l.id}>{glLabel(l)}</option>)}</select></label>)}
        {F({ k: 'what_text', label: t('s_what'), area: true, need: true })}
      </div>
    </>}

    {step === 1 && <>
      <div className="card"><p className="k">{t('s_ask')}</p>
        <div className="row">
          <label className="f" data-help="capex_class"><span>{t('capex_class')}</span><select value={a.capex_class} disabled={!canEdit} onChange={e => set('capex_class', e.target.value)}><option value="none">{t('c_none')}</option><option value="light">{t('c_light')}</option><option value="significant">{t('c_significant')}</option></select></label>
          <MoneyInput a={a} set={set} canEdit={canEdit} k="capex_amount" label={t('capex_amount')} lang={lang} t={t} disabled={a.quote_decides} need />
          <label className="f" data-help="quarter"><span>{t('quarter')}</span><select value={a.quarter || ''} disabled={!canEdit} onChange={e => set('quarter', e.target.value)}>{QUARTERS.map(q => <option key={q}>{q}</option>)}</select></label>
        </div>
        <label className="f" data-help="quote_decides" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={!!a.quote_decides} disabled={!canEdit} onChange={e => set('quote_decides', e.target.checked)} /> {t('quote_decides')}</label>
        <label className="f" data-help="quote"><span>{t('quote')}</span>{canEdit && <input type="file" accept=".pdf,image/*" onChange={upload} />}</label>
        {files.map(f => <div key={f.id}><a href="#" onClick={e => { e.preventDefault(); open(f.path) }}>📎 {f.name}</a></div>)}
      </div>
      <div className="card o"><p className="k">{t('s_tcd')}</p><p className="m">{t('tcd_hint')}</p>
        <OpexItems t={t} lang={lang} a={a} setA={setA} dirty={dirty} canEdit={canEdit} />
        {F({ k: 'opex_notes', label: t('opex_notes'), area: true })}
        {twice && <div className="card o warn">⚠️ {t('twice_warn').replace('{n}', fmt(cx))}</div>}
        <div className="tot"><div><span>{t('capex_lbl')}</span><b>{a.quote_decides ? '—' : fmt(cx)}</b></div><div className="o"><span>{t('opex_lbl')}</span><b>{fmt(oy)}</b></div><div><span>{t('year_one')} · {t('yearly_after')}</span><b>{fmt(cx + oy)} · {fmt(oy)}</b></div></div>
      </div>
    </>}

    {step === 2 && <>
      <div className="card"><p className="k">{t('s_return')}</p>{F({ k: 'return_text', label: t('return_h'), area: true, need: true })}{F({ k: 'return_when', label: t('return_when') })}</div>
      <div className="card"><p className="k">{t('s_measure')}</p>{F({ k: 'measure_text', label: t('measure_h'), area: true, need: true })}{F({ k: 'measure_when', label: t('measure_when') })}</div>
    </>}

    {step === 3 && <div className="card"><p className="k">{t('s_ifnot')}</p>{F({ k: 'if_not_funded', label: t('ifnot_h'), area: true, need: true })}{F({ k: 'what_we_stop', label: t('stop_h'), area: true })}</div>}

    {step === 4 && <>
      <div className={'card ' + (missing.length ? 'o' : 'g')}><h2 style={{ margin: 0 }}>{t('review_title')}</h2>
        {missing.length ? <><p>{t('review_missing')}</p><div className="btns" style={{ marginTop: 0 }}>{missing.map(([k, n]) => <button key={k} className="btn" onClick={() => go(n)}>{t(k)} {NX}</button>)}</div></> : <p style={{ marginBottom: 0 }}>{t('review_ok')}</p>}
      </div>
      {isDir && a.id && ratReady && <RatifyCard t={t} lang={lang} ask={a} refd={refd} show={show} facts={{ opex_year: oy, twice, missing: missing.map(([k]) => t(k)) }}
        onMove={canMove ? (id, why) => { setMoveTo(id); setMoveNote(String(why || '').slice(0, 300)); show(t('rat_move_ready')); setTimeout(() => document.querySelector('.card.move')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60) } : null}
        onNote={canEdit && st === 'with_director' ? (txt) => { setNote(n => (n.trim() ? n.trim() + '\n' : '') + txt); show('✓'); setTimeout(() => document.querySelector('.card.sendback')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60) } : null} />}
      <div className="card"><div className="rh"><p className="k">{t('step_goal')}</p>{canEdit && <button className="btn ghost" onClick={() => go(0)}>{t('edit')}</button>}</div>
        <R label={t('s_title')} v={a.title} />{dep && <R label={t('department')} v={dep[lang === 'ar' ? 'name_ar' : 'name_en']} />}
        <R label={t('s_other')} v={[a.lane_other, linked && t('linked_to') + ': ' + regLabel(linked)].filter(Boolean).join(' · ')} /><R label={t('s_what')} v={a.what_text} /><R label={t('gl_section')} v={gl ? glLabel(gl) : a.link_none && !linked ? t('none_review') : t('gl_new_money')} /></div>
      <div className="card"><div className="rh"><p className="k">{t('step_money')}</p>{canEdit && <button className="btn ghost" onClick={() => go(1)}>{t('edit')}</button>}</div>
        <R label={t('capex_amount')} v={a.quote_decides ? t('quote_decides') : cx ? `${fmt(cx)} ${t('egp')} (${approx(lang, cx)})` : ''} /><R label={t('quarter')} v={a.quarter} />
        <R label={t('opex_lbl')} v={oy ? `${fmt(oy)} ${t('egp')}` : ''} /><R label={t('year_one')} v={`${fmt(cx + oy)} ${t('egp')}`} />{files.length > 0 && <R label={t('quote')} v={files.map(f => f.name).join(', ')} />}</div>
      {twice && <div className="card o warn">⚠️ {t('twice_warn').replace('{n}', fmt(cx))} <button className="btn ghost sm" onClick={() => go(1)}>{t('edit')}</button></div>}
      <div className="card"><div className="rh"><p className="k">{t('step_return')}</p>{canEdit && <button className="btn ghost" onClick={() => go(2)}>{t('edit')}</button>}</div>
        <R label={t('s_return')} v={[a.return_text, a.return_when].filter(Boolean).join(' · ')} /><R label={t('s_measure')} v={[a.measure_text, a.measure_when].filter(Boolean).join(' · ')} /></div>
      <div className="card"><div className="rh"><p className="k">{t('step_ifnot')}</p>{canEdit && <button className="btn ghost" onClick={() => go(3)}>{t('edit')}</button>}</div>
        <R label={t('ifnot_h')} v={a.if_not_funded} /><R label={t('stop_h')} v={a.what_we_stop} /></div>
      {canEdit && isDir && a.id && st === 'with_director' && <div className="card sendback"><label className="f"><span>{t('send_back')}</span><textarea value={note} onChange={e => setNote(e.target.value)} /></label></div>}
      {canMove && <div className="card move" data-help="move_ask"><p className="k">{lang === 'ar' ? '↩' : '↪'} {t('move_title')}</p><p className="m" style={{ marginTop: -4 }}>{t('move_hint')}</p>
        <div className="grid2" style={{ marginTop: 6 }}><label className="f"><span>{t('move_to')}</span><DeptSelect value={moveTo} onChange={setMoveTo} deps={moveDeps} refd={refd} lang={lang} blank /></label>
          <label className="f"><span>{t('move_why')}</span><input value={moveNote} onChange={e => setMoveNote(e.target.value)} placeholder={t('move_why_ph')} /></label></div>
        <div className="btns" style={{ marginTop: 4 }}><button className="btn y" disabled={!moveTo || busy} onClick={move}>{lang === 'ar' ? '↩' : '↪'} {t('move_btn')}{moveTo ? ' ' + nmOf(moveTo) : ''}</button></div></div>}
    </>}

    {canEdit && <div className="btns">
      {step > 0 && <button className="btn" onClick={() => go(step - 1)}>{BK} {t('back_step')}</button>}
      {step < 4 && <button className="btn p" onClick={() => go(step + 1)}>{t('next')} {NX}</button>}
      {(step === 4 || !authoring) && <button className="btn" data-help="save" disabled={busy} onClick={() => save(st === 'returned' ? 'returned' : st)}>{t('save')}</button>}
      {step === 4 && !isDir && ['draft', 'returned', 'yellow'].includes(st) && <button className="btn p" data-help="send" disabled={busy} onClick={() => save('with_director')}>{t('send_director')} {NX}</button>}
      {step === 4 && isDir && ['draft', 'with_director', 'returned', 'yellow'].includes(st) && <button className="btn p" data-help="send" disabled={busy} onClick={() => save('submitted')}>{t('submit_room')} {NX}</button>}
      {step === 4 && isDir && a.id && st === 'with_director' && <button className="btn y" disabled={busy} onClick={() => save('returned')}>↩ {t('send_back')}</button>}
      {step === 4 && a.id && st === 'draft' && <button className="btn ghost" onClick={del}>{t('delete')}</button>}
      {step === 4 && a.id && st === 'submitted' && <button className="btn ghost" onClick={withdraw}>{t('withdraw')}</button>}
    </div>}
    {!canEdit && step < 4 && <div className="btns">{step > 0 && <button className="btn" onClick={() => go(step - 1)}>{BK} {t('back_step')}</button>}<button className="btn p" onClick={() => go(step + 1)}>{t('next')} {NX}</button></div>}
    {step === 4 && hist.length > 0 && <div className="card hist"><p className="k">{t('history')}</p>{hist.map(h => <div key={h.id}>{new Date(h.at).toLocaleString()} · {h.event === 'moved' ? `↪ ${t('moved')}: ${h.detail?.from} → ${h.detail?.to}` : h.detail?.status ? t(h.detail.status) : h.event}{h.detail?.note ? ' — ' + h.detail.note : ''} · {h.profiles?.name || h.profiles?.email || ''}</div>)}</div>}
  </>
}

/* ---------------- THE ROOM ---------------- */
function Room({ t, lang, profile, refd, show }) {
  const [coming, setComing] = useState([])
  const [list, setList] = useState([]); const [i, setI] = useState(0); const [mine, setMine] = useState({}); const [totals, setTotals] = useState({})
  const load = useCallback(async () => {
    const { data } = await supabase.from('asks').select('*, departments(name_en,name_ar), attachments(*)').eq('cycle_id', refd.cycle.id).in('status', ['submitted', 'pitched', 'green', 'yellow', 'gate']).order('department_id').order('created_at')
    setList(data || [])
    const { data: cm } = await supabase.from('asks').select('status').eq('cycle_id', refd.cycle.id).in('status', ['draft', 'returned', 'with_director']); setComing(cm || [])
    const { data: tt } = await supabase.from('ask_totals').select('*'); setTotals(Object.fromEntries((tt || []).map(x => [x.ask_id, x])))
    const { data: ms } = await supabase.from('scores').select('*').eq('scorer_id', profile.id); setMine(Object.fromEntries((ms || []).map(x => [x.ask_id, x])))
  }, [refd.cycle.id, profile.id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('room').on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => load()).on('postgres_changes', { event: '*', schema: 'public', table: 'asks' }, () => load()).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])
  const [proj, setProj] = useState(false)
  useEffect(() => { document.body.classList.toggle('proj', proj); return () => document.body.classList.remove('proj') }, [proj])
  useEffect(() => { const f = () => { if (!document.fullscreenElement) setProj(false) }; document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  useEffect(() => {
    // arrows follow reading direction: → is "next" in English, ← is "next" in Arabic
    const k = (e) => { if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return; const fwd = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight', bwd = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft'
      if (e.key === fwd) setI(x => Math.min(x + 1, list.length - 1)); if (e.key === bwd) setI(x => Math.max(x - 1, 0)) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [list.length, lang])
  const toggleProj = () => { if (!proj) { setProj(true); document.documentElement.requestFullscreen?.().catch(() => {}) } else { setProj(false); if (document.fullscreenElement) document.exitFullscreen() } }
  const a = list[i]
  if (!a) return <div className="hero"><p className="k">{refd.cycle.name}</p><h2>🎤 {t('room_title')}</h2><p>{t('room_empty')}</p>
    {coming.length > 0 && <p className="m">{t('room_waiting')}: {['draft', 'with_director'].map(k => { const n = coming.filter(c => k === 'draft' ? c.status !== 'with_director' : c.status === k).length; return n ? <span key={k} className={'pill ' + k} style={{ marginInlineStart: 6 }}>{t(k === 'draft' ? 'board_draft' : 'with_director')} · {n}</span> : null })}</p>}
    <p className="m">{t('room_how')}</p><div className="btns"><a className="btn glass" href="#guide">📖 {t('guide')}</a></div></div>
  const my = mine[a.id] || {}; const tot = totals[a.id] || {}
  const setQ = async (k, v) => {
    const row = { ask_id: a.id, scorer_id: profile.id, q_fit: my.q_fit ?? null, q_evidence: my.q_evidence ?? null, q_reversible: my.q_reversible ?? null, q_payback: my.q_payback ?? null, [k]: v }
    const { error } = await supabase.from('scores').upsert(row, { onConflict: 'ask_id,scorer_id' }); if (error) show(error.message); else load()
  }
  const decide = async (status) => {
    await supabase.from('asks').update({ status }).eq('id', a.id)
    await supabase.from('ask_events').insert({ ask_id: a.id, actor_id: profile.id, event: 'decision', detail: { status, total: tot.total, scorers: tot.scorers } })
    show(status === 'green' ? t('green') + ' · ' + t('room_to_budget') : t(status)); load()
  }
  const myTotal = ['q_fit', 'q_evidence', 'q_reversible', 'q_payback'].every(k => my[k] != null) ? ['q_fit', 'q_evidence', 'q_reversible', 'q_payback'].reduce((s, k) => s + my[k], 0) : null
  const oy = opexYear(a)
  return <>
    <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
      <div><h1 style={{ margin: 0 }}>{t('room_title')}</h1><p className="m" style={{ margin: 0 }}>{t('room_hint')}</p></div>
      <div style={{ flex: 'none', display: 'flex', gap: 8, alignItems: 'center' }}><button className="btn" onClick={toggleProj} title={t('keys_hint')}>⛶ {proj ? t('projector_exit') : t('projector')}</button><button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>‹ {t('prev')}</button><span className="pill">{i + 1} / {list.length}</span><button className="btn" disabled={i >= list.length - 1} onClick={() => setI(i + 1)}>{t('next')} ›</button></div>
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
        {(profile.role === 'admin' || profile.role === 'excom') && <><p className="k">{t('decide')}</p><div className="btns" style={{ marginTop: 4 }}>
          <button className="btn" onClick={() => decide('pitched')}>{t('set_pitched')}</button>
          <button className="btn g" onClick={() => decide('green')}>{t('set_green')}</button>
          <button className="btn y" onClick={() => decide('yellow')}>{t('set_yellow')}</button>
          <button className="btn" onClick={() => decide('gate')}>{t('set_gate')}</button></div></>}
      </div>
    </div>
  </>
}

/* ---------------- BUDGET (all year) ---------------- */
// Departments write their own GL lines (until finance locks them) and record spending as it happens.
// AX uploads are the check: we count whichever is higher, what the department recorded or what AX shows.
// left = budget − spent − promised (requests waiting or approved, minus what was already recorded against them)
const YEARS = [2025, 2026, 2027]
const sheetRows = async (file) => { const wb = XLSX.read(await file.arrayBuffer()); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) }
const toNum = (v) => Number(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9.-]/g, '')) || 0
const col = (row, ...names) => { const k = Object.keys(row).find(x => names.some(n => x.trim().toLowerCase() === n)); return k ? row[k] : '' }

// "is this already in our GL lines?" — word overlap between what people type and the line names, Arabic or English
const words = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).map(w => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w)).filter(w => w.length >= 3)
function matchLines(lines, text) {
  const ws = words(text); if (!ws.length) return []
  const hit = (w) => ws.some(x => x === w || (x.length >= 4 && w.length >= 4 && (w.startsWith(x) || x.startsWith(w))))
  return lines.map(l => ({ l, n: words(l.name + ' ' + (l.gl_code || '')).filter(hit).length })).filter(x => x.n).sort((x, y) => y.n - x.n).slice(0, 2).map(x => x.l)
}

function useBudget(year, depIds) {
  const [d, setD] = useState({ lines: [], acts: [], reqs: [] })
  const key = depIds ? depIds.join(',') : ''
  const load = useCallback(async () => {
    const q = (tb, sel) => { let x = supabase.from(tb).select(sel); if (year) x = x.eq('fiscal_year', year); if (depIds) x = x.in('department_id', depIds); return x }
    const [l, a, r] = await Promise.all([q('budget_lines', '*').order('gl_code'), q('spend_actuals', 'id,department_id,budget_line_id,request_id,gl_code,amount,period,as_of,description,source,uploaded_by'), q('spend_requests', '*, profiles:requested_by(name,email)').order('created_at', { ascending: false })])
    setD({ lines: l.data || [], acts: a.data || [], reqs: r.data || [] })
  }, [year, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  const sum = (xs) => xs.reduce((s, x) => s + Number(x.amount), 0)
  const calc = (pick) => {
    const ls = d.lines.filter(pick), as = d.acts.filter(pick), rs = d.reqs.filter(x => pick(x) && ['open', 'approved'].includes(x.status))
    const recorded = sum(as.filter(x => x.source === 'manual')), ax = sum(as.filter(x => x.source === 'ax'))
    const promised = rs.reduce((s, r) => s + Math.max(0, Number(r.amount) - sum(d.acts.filter(x => x.request_id === r.id && x.source === 'manual'))), 0)
    const budget = sum(ls), spent = Math.max(recorded, ax)
    return { budget, recorded, ax, spent, promised, left: budget - spent - promised }
  }
  // budget_lines rows carry 'kind'; spending and requests point at a line through budget_line_id
  const line = (id) => calc(x => ('kind' in x ? x.id : x.budget_line_id) === id)
  // a department adds up its lines one by one, so AX being higher on one line is not hidden by another
  const dep = (id) => {
    const parts = [...d.lines.filter(l => l.department_id === id && l.kind !== 'capex').map(l => line(l.id)), calc(x => x.department_id === id && !('kind' in x) && !x.budget_line_id)]
    const tot = parts.reduce((s, n) => ({ budget: s.budget + n.budget, recorded: s.recorded + n.recorded, ax: s.ax + n.ax, spent: s.spent + n.spent, promised: s.promised + n.promised }), { budget: 0, recorded: 0, ax: 0, spent: 0, promised: 0 })
    return { ...tot, left: tot.budget - tot.spent - tot.promised }
  }
  return { ...d, load, line, dep }
}


/* finance's own sheets, imported as they are (see finance.js) */
const OWNER_ALIAS = { production: 'PRD', 'الإنتاج': 'PRD', prd: 'PRD', maintenance: 'MNT', 'الصيانة': 'MNT', lab: 'LAB', 'المعمل': 'LAB', qhse: 'HSE', hse: 'HSE', 'السلامة العامة والصحة المهنية': 'HSE', qc: 'QC', qms: 'QMS', admin: 'ADM', administration: 'ADM', 'الشئون الإدارية': 'ADM', 'الشؤون الإدارية': 'ADM', factory: 'PRD', plant: 'PRD' }
function FinanceImport({ t, lang, refd, profile, book, show, onClose, onDone }) {
  const nm = (x) => x?.[lang === 'ar' ? 'name_ar' : 'name_en']
  const owners = [...new Set(book.sheets.flatMap(s => (s.lines || []).map(l => l.owner)))]
  const guess = (o) => { const s = String(o || '').trim().toLowerCase(); const d = refd.departments.find(d => [d.code, d.name_en, d.name_ar].some(x => String(x || '').toLowerCase() === s)) || refd.departments.find(d => d.code === OWNER_ALIAS[s]); return d?.id || '' }
  const [map, setMap] = useState(() => {
    const m = Object.fromEntries(owners.map(o => [o, guess(o)]))
    // an owner we can't place ("Plant" on the CAPEX tab) goes with the file's main department until someone says otherwise
    const cnt = {}; book.sheets.forEach(s => (s.lines || []).forEach(l => { if (m[l.owner]) cnt[m[l.owner]] = (cnt[m[l.owner]] || 0) + 1 }))
    const top = Number(Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]) || ''
    owners.forEach(o => { if (!m[o]) m[o] = top }); return m
  })
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  // a file with no year anywhere (finance's "factory 93"): the person says which year it is
  const noYear = book.sheets.some(s => !s.year && (s.lines?.length || s.blocks?.length)); const [yr, setYr] = useState(new Date().getFullYear())
  const yOf = (s) => s.year || Number(yr)
  const notes = notice(book)
  const kindLabel = { ytd: t('fi_kind_ytd'), plan: t('fi_kind_plan'), capex: t('fi_kind_capex'), detail: t('fi_kind_detail'), skip: t('fi_kind_skip') }
  const hasActuals = book.sheets.some(s => s.type === 'ytd')

  const run = async () => {
    setBusy(true)
    try {
      const years = [...new Set(book.sheets.map(yOf).filter(Boolean))]
      const { data: ex0, error: e0 } = await supabase.from('budget_lines').select('*').in('fiscal_year', years.flatMap(y => [y - 1, y, y + 1])); if (e0) throw e0
      const ex = ex0 || []; let made = 0, changed = 0, acts = 0
      // budget vs actual first (it is finance's official number), then the monthly plan, then CAPEX
      const order = { ytd: 0, plan: 1, capex: 2 }
      for (const sh of book.sheets.filter(s => s.type in order).sort((a, b) => order[a.type] - order[b.type])) {
        const shYear = yOf(sh); if (!shYear) continue
        // a monthly tab with no budget-vs-actual tab beside it is the only source of the line's yearly total
        const planOnly = sh.type === 'plan' && !book.sheets.some(o => o.type === 'ytd' && yOf(o) === shYear)
        for (const l of sh.lines) {
          const dep = Number(map[l.owner]); if (!dep) continue
          const same = (x) => x.fiscal_year === shYear && x.department_id === dep
          // a hand-typed line may hold just the code ("3404001") or the code with spaces; finance's file names the cost centre too
          let line = l.gl ? ex.find(x => same(x) && x.gl_code === l.gl) || ex.find(x => same(x) && x.kind !== 'capex' && String(x.gl_code || '').replace(/\s/g, '') === l.code) : ex.find(x => same(x) && x.kind === 'capex' && (x.name === l.name))
          if (line) {
            const patch = sh.type === 'plan' ? { monthly: l.monthly, ...(planOnly ? { amount: l.budget, name: l.name } : {}) } : sh.type === 'capex' ? { amount: l.budget, note: l.note } : { amount: l.budget, name: l.name }
            if (l.gl && line.gl_code !== l.gl) patch.gl_code = l.gl
            const { error } = await supabase.from('budget_lines').update(patch).eq('id', line.id); if (error) throw error
            Object.assign(line, patch); changed++
          } else {
            const { data, error } = await supabase.from('budget_lines').insert({ fiscal_year: shYear, department_id: dep, kind: l.kind, gl_code: l.gl, name: l.name, amount: l.budget, monthly: l.monthly, note: l.note || null, created_by: profile.id }).select().single(); if (error) throw error
            ex.push(data); line = data; made++
          }
          if (sh.type === 'ytd' && l.actual != null) {
            // year-to-date totals: the new snapshot replaces the old one, or it would count twice
            const { error: de } = await supabase.from('spend_actuals').delete().eq('budget_line_id', line.id).eq('source', 'ax'); if (de) throw de
            if (l.actual) { const { error } = await supabase.from('spend_actuals').insert({ fiscal_year: shYear, department_id: dep, budget_line_id: line.id, gl_code: l.gl, amount: l.actual, period: asOf, as_of: asOf, description: 'Finance YTD', source: 'ax', source_file: book.fileName, uploaded_by: profile.id }); if (error) throw error; acts++ }
          }
        }
      }
      // breakdown tabs: hang each block on the line with the same GL that year
      for (const sh of book.sheets.filter(s => s.type === 'detail')) for (const b of sh.blocks) {
        for (const line of ex.filter(x => x.gl_code === b.gl && x.fiscal_year === yOf(sh))) {
          const details = [...(line.details || []).filter(g => g.sheet !== sh.name || g.file !== book.fileName), { file: book.fileName, sheet: sh.name, years: sh.yearCols, items: b.items }]
          const { error } = await supabase.from('budget_lines').update({ details }).eq('id', line.id); if (error) throw error
          line.details = details; changed++
        }
      }
      // last year's budget for the same GL, so a big jump shows without anyone asking
      for (const line of ex.filter(x => x.gl_code && x.last_year == null)) {
        const prev = ex.filter(x => x.fiscal_year === line.fiscal_year - 1 && x.gl_code === line.gl_code && Number(x.amount) > 0).sort((a, b) => (b.department_id === line.department_id) - (a.department_id === line.department_id))[0]
        if (prev) { await supabase.from('budget_lines').update({ last_year: prev.amount }).eq('id', line.id); line.last_year = prev.amount }
      }
      const glc = Object.values(Object.fromEntries(book.sheets.flatMap(s => s.lines || []).filter(l => l.gl).map(l => [l.gl, { code: l.gl, name: l.name }])))
      if (glc.length) await supabase.from('gl_catalog').upsert(glc)
      show(`✓ ${t('fi_done')}: +${made} · ${changed} ↻ · ${acts} AX`); onDone(years.includes(new Date().getFullYear()) ? new Date().getFullYear() : Math.max(...years))
    } catch (e) { show(e.message || String(e)) }
    setBusy(false)
  }

  return <div className="card n" style={{ marginTop: 12 }}>
    <div className="rh"><p className="k" style={{ margin: 0 }}>{t('fi_title')} · {book.fileName}</p><button className="btn ghost sm" onClick={onClose}>✕</button></div>
    <p className="m">{t('fi_hint')}</p>
    <table className="tb"><tbody>{book.sheets.map(s => <tr key={s.name}><td>{t('fi_sheet')}: <b>{s.name}</b></td><td>{kindLabel[s.type]}</td><td>{s.year || (noYear ? yr : '—')}</td><td className="m">{s.lines ? s.lines.length + ' ' + t('fi_lines_word') : s.blocks ? s.blocks.length + ' GL · ' + s.blocks.reduce((n, b) => n + b.items.length, 0) + ' ' + t('fi_items') : ''}</td></tr>)}</tbody></table>
    {noYear && <label className="f" style={{ maxWidth: 260, marginTop: 10 }}><span>{t('fi_year')}</span><select value={yr} onChange={e => setYr(e.target.value)}>{[-1, 0, 1].map(d => new Date().getFullYear() + d).map(y => <option key={y}>{y}</option>)}</select></label>}
    {owners.length > 0 && <><p className="k" style={{ marginTop: 12 }}>{t('fi_owner')}</p>
      {owners.map(o => <div key={o} className="row" style={{ alignItems: 'center' }}><div style={{ flex: 1 }}><b>{o}</b></div><div style={{ flex: 2 }}><select value={map[o]} onChange={e => setMap({ ...map, [o]: e.target.value })}><option value="">{t('fi_skip_owner')}</option>{refd.departments.map(d => <option key={d.id} value={d.id}>{d.code} · {nm(d)}</option>)}</select></div></div>)}</>}
    {hasActuals && <><label className="f" style={{ maxWidth: 260 }}><span>{t('fi_asof')}</span><input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label><p className="m">ℹ️ {t('fi_replace')}</p></>}
    {notes.length > 0 && <><p className="k" style={{ marginTop: 12 }}>💡 {t('fi_noticed')}</p>
      {notes.slice(0, 14).map((n, i) => <div key={i} className="m">• {n.l.gl} · {n.l.name}: {n.k === 'over' ? <>{fmt(n.l.actual)} / {fmt(n.l.budget)} <b className="gate">{n.pct}% {t('fi_over')}</b></> : n.k === 'nobudget' ? <><b className="gate">{fmt(n.l.actual)}</b> {t('fi_nobudget')}</> : <>{t('fi_total_diff')}: {fmt(n.l.budget)} ≠ {fmt(n.other)}</>} <span className="m">({n.s})</span></div>)}
      {notes.length > 14 && <div className="m">… +{notes.length - 14}</div>}</>}
    <div className="btns"><button className="btn p" disabled={busy} onClick={run}>{busy ? '…' : '⬆ ' + t('fi_import')}</button><button className="btn" onClick={onClose}>{t('cancel')}</button></div>
  </div>
}

function Budget({ t, lang, profile, refd, show }) {
  const nm = (x) => x?.[lang === 'ar' ? 'name_ar' : 'name_en']
  const [year, setYear] = useState(new Date().getFullYear())
  const B = useBudget(year)
  const { lines, acts, reqs } = B
  const [cat, setCat] = useState([])
  useEffect(() => { supabase.from('gl_catalog').select('*').order('code').then(({ data }) => setCat(data || [])) }, [])
  const own = profile.role === 'head' ? profile.department_id : null
  const [ask, setAsk] = useState({ dep: own, line: '', amount: '', title: '' })
  const [nl, setNl] = useState({ dep: own, gl_code: '', name: '', amount: '', last_year: '' })
  const [sp, setSp] = useState({ dep: own, line: '', req: '', amount: '', date: new Date().toISOString().slice(0, 10), note: '' })
  const [open, setOpen] = useState({}); const [busy, setBusy] = useState(false); const [panel, setPanel] = useState(null)
  const [book, setBook] = useState(null); const [why, setWhy] = useState({})
  // last year's GL lines: the starting point for this year, and the base of finance's ceiling (15% is normal, 20% is the most)
  const [prev, setPrev] = useState([])
  useEffect(() => { supabase.from('budget_lines').select('department_id,gl_code,name,amount').eq('fiscal_year', year - 1).eq('kind', 'gl').then(({ data }) => setPrev(data || [])) }, [year])
  const prevOf = (id) => prev.filter(x => x.department_id === id)
  const baseOf = (l) => Number(l.last_year) || Number(prev.find(x => x.department_id === l.department_id && x.gl_code && x.gl_code === l.gl_code)?.amount) || 0
  const Cap = ({ l }) => { const b = baseOf(l), a = Number(l.amount); if (!b || !a || year !== new Date().getFullYear() + 1 && !l.last_year) return null; const p = Math.round(1000 * (a - b) / b) / 10; if (Math.abs(p) < 0.05) return null
    return <span className={'pill ' + (p > 20 ? 'gate' : p > 15 ? 'yellow' : 'green')} title={t('b_cap_rule')}>{p > 0 ? '+' : ''}{p}%{p > 20 ? ' · ' + t('b_cap_over') : ''}</span> }
  const bringLast = async (id) => {
    const have = new Set(lines.filter(l => l.department_id === id).map(l => l.gl_code)), rows = prevOf(id).filter(x => !have.has(x.gl_code)).map(x => ({ fiscal_year: year, department_id: id, kind: 'gl', gl_code: x.gl_code, name: x.name, amount: Number(x.amount), last_year: Number(x.amount), created_by: profile.id }))
    if (!rows.length || !confirm(`${rows.length} ${t('b_lines')} → ${year}?`)) return
    const { error } = await supabase.from('budget_lines').insert(rows); if (error) show(error.message); else { show('✓ ' + rows.length); setOpen(o => ({ ...o, [id]: true })); B.load() }
  }
  const editAmt = async (l) => {
    const v = prompt(lineLabel(l) + '\n' + t('b_budget') + ' ' + year + (baseOf(l) ? '\n' + t('b_last_year') + ': ' + fmt(baseOf(l)) + ' · +15% = ' + fmt(Math.round(baseOf(l) * 1.15)) + ' · +20% = ' + fmt(Math.round(baseOf(l) * 1.2)) : ''), String(Number(l.amount)))
    if (v === null) return; const a = toNum(v); if (!(a >= 0)) return
    const old = Number(l.amount), monthly = Array.isArray(l.monthly) && l.monthly.length === 12 && old ? l.monthly.map(m => Math.round(100 * Number(m) * a / old) / 100) : l.monthly
    const { error } = await supabase.from('budget_lines').update({ amount: a, monthly }).eq('id', l.id); if (error) show(error.message); else B.load()
  }
  const upFinance = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { setBook(readWorkbook(await f.arrayBuffer(), f.name)) } catch (err) { show(err.message) } }
  const isAdmin = profile.role === 'admin', canDecide = isAdmin || profile.role === 'director', canWrite = profile.role !== 'excom'
  const deps = profile.role === 'excom' ? refd.departments : myDeps(profile, refd)
  const depLines = (id) => lines.filter(l => l.department_id === id && l.kind !== 'capex')
  const depCapex = (id) => lines.filter(l => l.department_id === id && l.kind === 'capex')
  const Bar = ({ n }) => { const b = n.budget || 1; return <div className="bbar"><i className="sp" style={{ width: Math.min(100, 100 * n.spent / b) + '%' }} /><i className="cm" style={{ width: Math.min(100, 100 * n.promised / b) + '%' }} /></div> }
  const Flag = ({ n }) => { if (!n.budget) return n.spent > 0 ? <span className="pill gate">{t('b_unbudgeted')}</span> : null; const p = (n.spent + n.promised) / n.budget; return p >= 0.8 ? <span className={'pill ' + (p >= 1 ? 'gate' : 'yellow')}>{p >= 1 ? t('b_over') : t('b_80')} · {Math.round(100 * p)}%</span> : null }
  const AxNote = ({ n }) => n.ax > 0 && n.recorded > 0 && Math.abs(n.ax - n.recorded) > 0.5 ? <div className="m axn">{t('b_ax_check')}: {fmt(n.ax)} · {t('b_recorded')}: {fmt(n.recorded)} {n.ax > n.recorded ? '⚠️ ' + t('b_ax_more') : ''}</div> : null
  const lineLabel = (l) => (l.gl_code ? l.gl_code + ' · ' : '') + l.name

  // the instant answer to "do we have budget for this?"
  const amt = Number(ask.amount || 0)
  const target = ask.line ? B.line(Number(ask.line)) : ask.dep ? B.dep(ask.dep) : null
  const answer = target && amt > 0 ? (target.left >= amt ? { ok: true, after: target.left - amt } : { ok: false, short: amt - target.left }) : null
  const askHints = !ask.line && ask.dep ? matchLines(depLines(ask.dep), ask.title) : []
  const sendReq = async () => {
    if (!ask.dep || !amt || !ask.title.trim()) { show(t('missing') + ': ' + [!ask.dep && t('department'), !ask.title.trim() && t('b_what'), !amt && t('b_amount')].filter(Boolean).join(', ')); return }
    setBusy(true)
    const { error } = await supabase.from('spend_requests').insert({ fiscal_year: year, department_id: ask.dep, budget_line_id: ask.line ? Number(ask.line) : null, title: ask.title.trim(), amount: amt, requested_by: profile.id })
    setBusy(false); if (error) { show(error.message); return }
    show(t('b_req_ok')); setAsk(x => ({ ...x, amount: '', title: '', line: '' })); B.load()
  }
  const decide = async (r, status) => {
    const note = status === 'rejected' ? prompt(t('b_why_reject')) : null
    if (status === 'rejected' && note === null) return
    const { error } = await supabase.from('spend_requests').update({ status, decided_by: profile.id, decided_at: new Date().toISOString(), ...(note ? { note } : {}) }).eq('id', r.id)
    if (error) show(error.message); else B.load()
  }
  const withdraw = async (r) => { if (!confirm('?')) return; await supabase.from('spend_requests').delete().eq('id', r.id); B.load() }

  // departments write their own GL lines
  const addLine = async () => {
    if (!nl.dep || !nl.name.trim() || !Number(nl.amount)) { show(t('missing') + ': ' + [!nl.dep && t('department'), !nl.name.trim() && t('b_line'), !Number(nl.amount) && t('b_budget')].filter(Boolean).join(', ')); return }
    const { error } = await supabase.from('budget_lines').insert({ fiscal_year: year, department_id: nl.dep, gl_code: nl.gl_code.trim() || null, name: nl.name.trim(), amount: Number(nl.amount), last_year: Number(nl.last_year) || null, created_by: profile.id })
    if (error) show(error.message); else { setNl({ ...nl, gl_code: '', name: '', amount: '', last_year: '' }); B.load() }
  }
  const pickGl = (v) => { const c = cat.find(x => x.code === v.split(' · ')[0].trim()); setNl(x => ({ ...x, gl_code: c ? c.code : v, name: c && !x.name ? c.name : x.name })) }
  const delLine = async (l) => { if (!confirm(lineLabel(l) + ' ?')) return; const { error } = await supabase.from('budget_lines').delete().eq('id', l.id); if (error) show(error.message); else B.load() }
  const lockLine = async (l, locked) => { const { error } = await supabase.from('budget_lines').update({ locked }).eq('id', l.id); if (error) show(error.message); else B.load() }
  // spending recorded by the department as it happens, in parts
  const addSpend = async () => {
    const a = Number(sp.amount)
    if (!sp.dep || !a) { show(t('missing') + ': ' + [!sp.dep && t('department'), !a && t('b_amount')].filter(Boolean).join(', ')); return }
    const r = reqs.find(x => x.id === Number(sp.req))
    const { error } = await supabase.from('spend_actuals').insert({ fiscal_year: year, department_id: sp.dep, budget_line_id: sp.line ? Number(sp.line) : r?.budget_line_id || null, request_id: r?.id || null, amount: a, period: sp.date, description: sp.note.trim() || r?.title || null, source: 'manual', uploaded_by: profile.id })
    if (error) show(error.message); else { show('✓ ' + t('b_spend_ok')); setSp({ ...sp, amount: '', note: '', req: '' }); B.load() }
  }
  const delSpend = async (x) => { if (!confirm('?')) return; await supabase.from('spend_actuals').delete().eq('id', x.id); B.load() }

  // admin: Excel uploads; departments match by code or name
  const depOf = (v) => { const s = String(v || '').trim().toLowerCase(); return refd.departments.find(d => [d.code, d.name_en, d.name_ar].some(x => String(x || '').toLowerCase() === s)) }
  const upLines = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return
    const rows = await sheetRows(f); const bad = []
    const data = rows.map((r, i) => { const d = depOf(col(r, 'department', 'dept', 'القسم')); if (!d) bad.push(i + 2); return d && { fiscal_year: year, department_id: d.id, kind: 'gl', gl_code: String(col(r, 'gl code', 'gl', 'account')), name: String(col(r, 'gl name', 'name', 'description') || col(r, 'gl code', 'gl')), amount: toNum(col(r, 'budget', 'amount', String(year))), last_year: toNum(col(r, 'last year', 'actual last year', String(year - 1))) || null, created_by: profile.id } }).filter(Boolean)
    if (bad.length) { show(t('b_bad_rows') + ' ' + bad.slice(0, 8).join(', ')); return }
    if (!confirm(`${data.length} ${t('b_lines')} → ${year}?`)) return
    const { error } = await supabase.from('budget_lines').insert(data); if (error) { show(error.message); return }
    const glc = Object.values(Object.fromEntries(data.filter(x => x.gl_code).map(x => [x.gl_code, { code: x.gl_code, name: x.name }])))
    if (glc.length) await supabase.from('gl_catalog').upsert(glc)
    show('✓ ' + data.length); B.load()
  }
  const upActs = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return
    const rows = await sheetRows(f); const bad = []
    const data = rows.map((r, i) => {
      const d = depOf(col(r, 'department', 'dept', 'cost centre', 'cost center', 'القسم')); if (!d) { bad.push(i + 2); return null }
      const gl = String(col(r, 'gl code', 'gl', 'account')); const ln = lines.find(l => l.department_id === d.id && l.gl_code === gl)
      const dt = col(r, 'date', 'period', 'posting date'); const p = typeof dt === 'number' ? new Date(Math.round((dt - 25569) * 864e5)) : dt ? new Date(dt) : null
      return { fiscal_year: year, department_id: d.id, budget_line_id: ln?.id || null, gl_code: gl, period: p && !isNaN(p) ? p.toISOString().slice(0, 10) : null, amount: toNum(col(r, 'amount', 'value', 'debit')), description: String(col(r, 'description', 'text', 'details')), source: 'ax', source_file: f.name, uploaded_by: profile.id }
    }).filter(Boolean)
    if (bad.length) { show(t('b_bad_rows') + ' ' + bad.slice(0, 8).join(', ')); return }
    if (!confirm(`${data.length} ${t('b_rows')} · ${fmt(data.reduce((s, x) => s + x.amount, 0))} ${t('egp')} → ${year}?`)) return
    const { error } = await supabase.from('spend_actuals').insert(data); if (error) show(error.message); else { show('✓ ' + data.length); B.load() }
  }
  const template = (kind) => {
    const rows = kind === 'lines' ? [{ Department: 'PRD', 'GL code': '6101', 'GL name': 'Spare parts', Budget: 500000, 'Last year': 450000 }] : [{ Department: 'PRD', 'GL code': '6101', Date: `${year}-01-31`, Amount: 12500, Description: 'Bearings' }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), kind); XLSX.writeFile(wb, `smartBudget_${kind}_template.xlsx`)
  }
  // the year's GL lines the way finance sends them: one tab per department, Ledger account | Name | Jan..Dec | Total
  const financeOut = async () => {
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], wb = XLSX.utils.book_new()
    deps.forEach(d => {
      const ls = depLines(d.id); if (!ls.length) return
      const rows = ls.map(l => [l.gl_code || '', l.name, ...(Array.isArray(l.monthly) && l.monthly.length === 12 ? l.monthly.map(Number) : Array(12).fill(null)), Number(l.amount) || 0])
      const tot = ['Grand Total', '', ...M.map((_, i) => rows.reduce((s, r) => s + (Number(r[2 + i]) || 0), 0)), rows.reduce((s, r) => s + r[14], 0)]
      const ws = XLSX.utils.aoa_to_sheet([['Ledger account', 'Name', ...M, 'Total'], ...rows, tot])
      ws['!cols'] = [{ wch: 36 }, { wch: 46 }, ...M.map(() => ({ wch: 12 })), { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, ws, String(d.name_en).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
    })
    // cards funded in the room, in finance's CAPEX list layout (القسم | البند | Items | النوع | القيمة), with the GL the card was linked to
    const cx = lines.filter(l => l.kind === 'capex' && deps.some(d => d.id === l.department_id))
    if (cx.length) {
      const ids = cx.map(l => l.ask_id).filter(Boolean)
      const { data: as } = ids.length ? await supabase.from('asks').select('id,budget_line_id,capex_class,quarter,what_text').in('id', ids) : { data: [] }
      const gids = [...new Set((as || []).map(a => a.budget_line_id).filter(Boolean))]
      const { data: gls } = gids.length ? await supabase.from('budget_lines').select('id,gl_code,name').in('id', gids) : { data: [] }
      const rows = cx.map(l => { const a = (as || []).find(x => x.id === l.ask_id), g = a && (gls || []).find(x => x.id === a.budget_line_id), d = refd.departments.find(x => x.id === l.department_id)
        return [d?.name_ar || d?.name_en || '', l.name, a?.what_text || '', a?.capex_class || '', Number(l.amount) || 0, g?.gl_code || '', g?.name || '', a?.quarter || '', l.ask_id ? 'Funded in the room' : (l.note || '')] })
      const ws = XLSX.utils.aoa_to_sheet([['القسم', 'البند', 'Items', 'النوع', 'القيمة', 'Ledger account', 'Name', 'Quarter', 'Source'], ...rows, ['Grand Total', '', '', '', rows.reduce((s, r) => s + r[4], 0)]])
      ws['!cols'] = [{ wch: 28 }, { wch: 50 }, { wch: 50 }, { wch: 12 }, { wch: 14 }, { wch: 34 }, { wch: 40 }, { wch: 10 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, ws, 'CAPEX ' + year)
    }
    if (!wb.SheetNames.length) { show(t('fi_out_none')); return }
    XLSX.writeFile(wb, `smartBudget_GL_${year}.xlsx`)
  }
  const pending = reqs.filter(r => r.status === 'open')
  const glOptions = [...new Map([...cat.map(c => [c.code, c.name]), ...lines.filter(l => l.gl_code).map(l => [l.gl_code, l.name])]).entries()]
  const DepPick = ({ v, on }) => profile.role !== 'head' && <label className="f"><span>{t('department')}</span><DeptSelect value={v} onChange={on} deps={deps} refd={refd} lang={lang} blank /></label>

  return <>
    <div className="hero"><div className="row" style={{ alignItems: 'center' }}><div><p className="k">{t('b_kicker')}</p><h2>{t('b_title')}</h2><p className="m">{t('b_hint')}</p></div>
      <div style={{ flex: 'none' }} data-help="b_year"><select value={year} onChange={e => setYear(Number(e.target.value))}>{YEARS.map(y => <option key={y}>{y}</option>)}</select></div></div>
      {canWrite && <div className="btns">
        <button data-help="b_afford" className={'btn ' + (panel === 'afford' ? 'p' : '')} onClick={() => setPanel(panel === 'afford' ? null : 'afford')}>🧮 {t('b_afford')}</button>
        <button data-help="b_record" className={'btn ' + (panel === 'spend' ? 'p' : '')} onClick={() => setPanel(panel === 'spend' ? null : 'spend')}>🧾 {t('b_record')}</button>
        <button data-help="b_my_lines" className={'btn ' + (panel === 'lines' ? 'p' : '')} onClick={() => setPanel(panel === 'lines' ? null : 'lines')}>📒 {t('b_my_lines')}</button>
        <button data-help="fi_out" className="btn" onClick={financeOut}>📥 {t('fi_out')}</button>
      </div>}</div>

    {panel === 'afford' && <div className="card" style={{ marginTop: 12 }}><p className="k">{t('b_afford')}</p>
      <div className="row"><DepPick v={ask.dep} on={v => setAsk({ ...ask, dep: v, line: '' })} />
        <label className="f"><span>{t('b_what')}</span><input type="text" value={ask.title} onChange={e => setAsk({ ...ask, title: e.target.value })} /></label></div>
      {askHints.map(l => <div key={l.id} className="card o hintc">💡 {t('b_looks_gl')} <b>{lineLabel(l)}</b> · {t('b_left')} {fmt(B.line(l.id).left)} <button className="btn" onClick={() => setAsk({ ...ask, line: String(l.id) })}>{t('link_it')}</button></div>)}
      {ask.dep && ask.title.trim().length > 4 && !ask.line && !askHints.length && depLines(ask.dep).length > 0 && <p className="m">ℹ️ {t('b_not_in_gl')}</p>}
      <div className="row">
        <label className="f"><span>{t('b_line')}</span><select value={ask.line} onChange={e => setAsk({ ...ask, line: e.target.value })}><option value="">{t('b_any_line')}</option>{depLines(ask.dep).map(l => <option key={l.id} value={l.id}>{lineLabel(l)}</option>)}</select></label>
        <MoneyInput a={ask} set={(k, v) => setAsk(x => ({ ...x, [k]: v }))} canEdit k="amount" label={t('b_amount')} lang={lang} t={t} />
      </div>
      {answer && <div className={'card ' + (answer.ok ? 'g' : 'o')} style={{ margin: '4px 0 8px', padding: 12 }}>{answer.ok ? <>✅ <b>{t('b_yes')}</b> {t('b_after')} <b>{fmt(answer.after)} {t('egp')}</b></> : <>⚠️ <b>{t('b_no')}</b> {t('b_short')} <b>{fmt(answer.short)} {t('egp')}</b>. {t('b_ask_transfer')}</>}</div>}
      {target && !target.budget && ask.dep && <p className="m">{t('b_no_lines')}</p>}
      <div className="btns"><button className="btn p" disabled={busy} onClick={sendReq}>{t('b_send_req')}</button></div>
    </div>}

    {panel === 'spend' && <div className="card" style={{ marginTop: 12 }}><p className="k">{t('b_record')}</p><p className="m">{t('b_record_hint')}</p>
      <div className="row"><DepPick v={sp.dep} on={v => setSp({ ...sp, dep: v, line: '', req: '' })} />
        <label className="f"><span>{t('b_against')}</span><select value={sp.req} onChange={e => setSp({ ...sp, req: e.target.value })}><option value="">—</option>{reqs.filter(r => r.department_id === sp.dep && r.status === 'approved').map(r => <option key={r.id} value={r.id}>{r.title} · {fmt(r.amount)}</option>)}</select></label>
        {!sp.req && <label className="f"><span>{t('b_line')}</span><select value={sp.line} onChange={e => setSp({ ...sp, line: e.target.value })}><option value="">—</option>{depLines(sp.dep).map(l => <option key={l.id} value={l.id}>{lineLabel(l)}</option>)}</select></label>}
      </div>
      <div className="row">
        <MoneyInput a={sp} set={(k, v) => setSp(x => ({ ...x, [k]: v }))} canEdit k="amount" label={t('b_amount')} lang={lang} t={t} />
        <label className="f"><span>{t('b_date')}</span><input type="date" value={sp.date} onChange={e => setSp({ ...sp, date: e.target.value })} /></label>
        <label className="f"><span>{t('b_note')}</span><input type="text" value={sp.note} onChange={e => setSp({ ...sp, note: e.target.value })} /></label>
      </div>
      <div className="btns"><button className="btn p" onClick={addSpend}>＋ {t('b_record')}</button></div>
    </div>}

    {panel === 'lines' && <div className="card" style={{ marginTop: 12 }}><p className="k">{t('b_my_lines')} · {year}</p><p className="m">{t('b_lines_hint')}</p>
      <div className="row"><DepPick v={nl.dep} on={v => setNl({ ...nl, dep: v })} />
        <label className="f"><span>GL</span><input type="text" list="glcat" value={nl.gl_code} onChange={e => pickGl(e.target.value)} placeholder={t('b_gl_ph')} /><datalist id="glcat">{glOptions.map(([c, n]) => <option key={c} value={c + ' · ' + n} />)}</datalist></label>
        <label className="f"><span>{t('b_line_name')}</span><input type="text" value={nl.name} onChange={e => setNl({ ...nl, name: e.target.value })} /></label></div>
      <div className="row">
        <MoneyInput a={nl} set={(k, v) => setNl(x => ({ ...x, [k]: v }))} canEdit k="amount" label={t('b_budget') + ' ' + year} lang={lang} t={t} />
        <MoneyInput a={nl} set={(k, v) => setNl(x => ({ ...x, [k]: v }))} canEdit k="last_year" label={t('b_last_year')} lang={lang} t={t} />
        <div style={{ flex: 'none', alignSelf: 'end', marginBottom: 10 }}><button className="btn p" onClick={addLine}>＋ {t('b_add_line')}</button></div>
      </div>
      {nl.amount && nl.last_year && Math.abs(Number(nl.amount) - Number(nl.last_year)) / Number(nl.last_year) > 0.1 && <p className="m">{Number(nl.amount) > Number(nl.last_year) * 1.2 ? '⚠️' : 'ℹ️'} {Number(nl.amount) > Number(nl.last_year) ? t('b_up') : t('b_down')} {Math.round(100 * Math.abs(Number(nl.amount) - Number(nl.last_year)) / Number(nl.last_year))}% — {Number(nl.amount) > Number(nl.last_year) * 1.15 ? t('b_cap_rule') : t('b_why_change')}</p>}
    </div>}

    {canDecide && pending.length > 0 && <div className="card o" data-help="b_pending" style={{ marginTop: 12 }}><p className="k">{t('b_waiting')} · {pending.length}</p>
      {pending.map(r => { const d = refd.departments.find(x => x.id === r.department_id); const n = r.budget_line_id ? B.line(r.budget_line_id) : B.dep(r.department_id)
        return <div key={r.id} className="req"><div style={{ flex: 1 }}><b>{r.title}</b><div className="m">{nm(d)} · {r.profiles?.name || r.profiles?.email} · {new Date(r.created_at).toLocaleDateString()}</div>
          <div className="m">{n.left >= 0 ? '✅ ' + t('b_fits') : '⚠️ ' + t('b_over_by') + ' ' + fmt(-n.left)}</div></div>
          <div className="amt"><b>{fmt(r.amount)}</b></div>
          <div className="btns" style={{ margin: 0 }}><button className="btn g" onClick={() => decide(r, 'approved')}>✓ {t('b_approve')}</button><button className="btn" onClick={() => decide(r, 'rejected')}>{t('b_reject')}</button></div></div> })}
    </div>}

    {deps.map(d => { const n = B.dep(d.id); const ls = depLines(d.id); const rq = reqs.filter(r => r.department_id === d.id); const man = acts.filter(x => x.department_id === d.id && x.source === 'manual')
      if (!ls.length && !rq.length && !man.length && !prevOf(d.id).length && profile.role !== 'head') return null
      return <div key={d.id} className="card" style={{ marginTop: 12 }}>
        <div className="rh"><h2 style={{ margin: 0 }}>{nm(d)}</h2><Flag n={n} /></div>
        <div className="tot four" data-help="b_tiles"><div><span>{t('b_budget')}</span><b>{fmt(n.budget)}</b></div><div><span>{t('b_spent')}</span><b>{fmt(n.spent)}</b></div><div className="o"><span>{t('b_committed')}</span><b>{fmt(n.promised)}</b></div><div className={n.left < 0 ? 'neg' : 'pos'}><span>{t('b_left')}</span><b>{fmt(n.left)}</b></div></div>
        {n.budget > 0 && <Bar n={n} />}<AxNote n={n} />
        {depCapex(d.id).length > 0 && <p className="m">🏗️ {t('b_capex_list')}: <b>{fmt(depCapex(d.id).reduce((s, l) => s + Number(l.amount), 0))}</b> · {depCapex(d.id).length} {t('fi_items')}</p>}
        {canWrite && prevOf(d.id).some(x => !ls.some(l => l.gl_code === x.gl_code)) && <div className="btns" style={{ marginTop: 8 }}><button className="btn y" onClick={() => bringLast(d.id)}>⤵️ {t('b_bring')} {year - 1} ({prevOf(d.id).filter(x => !ls.some(l => l.gl_code === x.gl_code)).length})</button><span className="m">{t('b_cap_rule')}</span></div>}
        {ls.length === 0 && <p className="m">{t('b_no_lines')} {canWrite && <a href="#" onClick={e => { e.preventDefault(); setNl({ ...nl, dep: d.id }); setPanel('lines'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{t('b_add_line')} →</a>}</p>}
        {(ls.length > 0 || rq.length > 0 || man.length > 0) && <button className="btn ghost" data-help="b_lines" style={{ marginTop: 8 }} onClick={() => setOpen({ ...open, [d.id]: !open[d.id] })}>{open[d.id] ? '▾' : '▸'} {t('b_details')}</button>}
        {open[d.id] && <>
          {ls.length > 0 && <div style={{ overflowX: 'auto' }}><table className="tb" style={{ marginTop: 8 }}><thead><tr><th>{t('b_line')}</th><th>{t('b_last_year')}</th><th>{t('b_budget')}</th><th>{t('b_spent')}</th><th>{t('b_committed')}</th><th>{t('b_left')}</th><th></th></tr></thead><tbody>
            {ls.map(l => { const x = B.line(l.id); const pn = planToDate(l.monthly, year); const items = (l.details || []).flatMap(g => g.items.map(it => ({ ...it, years: g.years })))
              return <Fragment key={l.id}><tr><td>{l.gl_code ? <span className="m">{l.gl_code} · </span> : ''}{l.name}{l.locked && <span title={t('b_locked')}> 🔒</span>}<AxNote n={x} />
                {l.note && <div className="m">{l.note}</div>}
                {pn != null && <div className="m">{t('b_plan_now')}: {fmt(pn)}{x.spent > pn * 1.05 && <b className="gate"> · ⚠️ {t('b_ahead')}</b>}</div>}
                {items.length > 0 && <button className="btn ghost sm" onClick={() => setWhy({ ...why, [l.id]: !why[l.id] })}>📋 {t('b_breakdown')} ({items.length})</button>}</td><td className="m">{baseOf(l) ? fmt(baseOf(l)) : ''}</td><td style={{ whiteSpace: 'nowrap' }}>{fmt(x.budget)} {!l.locked && canWrite && <button className="btn ghost sm" title={t('b_edit_amt')} onClick={() => editAmt(l)}>✏️</button>}<div><Cap l={l} /></div></td><td>{fmt(x.spent)}</td><td>{fmt(x.promised)}</td><td><b className={x.left < 0 ? 'gate' : ''}>{fmt(x.left)}</b></td>
              <td style={{ whiteSpace: 'nowrap' }}><Flag n={x} />{!l.locked && canWrite && <button className="btn ghost sm" onClick={() => delLine(l)}>✕</button>}{isAdmin && <button className="btn ghost sm" title={l.locked ? t('b_unlock') : t('b_lock')} onClick={() => lockLine(l, !l.locked)}>{l.locked ? '🔓' : '🔒'}</button>}</td></tr>
              {why[l.id] && (() => { const ys = [...new Set(items.flatMap(it => Object.keys(it.by)))].sort(); return <tr><td colSpan={7}><table className="tb sub"><tbody>{items.map((it, i) => <tr key={i}><td>{it.vendor}</td><td>{it.item}</td><td className="m">{it.price ? fmt(it.price) + (it.count ? ' × ' + it.count : '') : ''}</td>{ys.map(y => <td key={y}>{it.by[y] ? <><span className="m">{y} </span>{fmt(it.by[y])}</> : ''}</td>)}</tr>)}</tbody></table></td></tr> })()}</Fragment> })}
          </tbody></table></div>}
          {depCapex(d.id).length > 0 && <><p className="k" style={{ marginTop: 12 }}>🏗️ {t('b_capex_list')}</p><div style={{ overflowX: 'auto' }}><table className="tb"><tbody>{depCapex(d.id).map(l => <tr key={l.id}><td>{l.name}{l.ask_id ? <div className="m">🟢 {t('b_from_room')}</div> : l.note && <div className="m">{l.note}</div>}</td><td>{fmt(l.amount)}</td><td style={{ whiteSpace: 'nowrap' }}>{!l.locked && !l.ask_id && canWrite && <button className="btn ghost sm" onClick={() => delLine(l)}>✕</button>}</td></tr>)}</tbody></table></div></>}
          {rq.length > 0 && <><p className="k" style={{ marginTop: 12 }}>{t('b_requests')}</p>{rq.map(r => <div key={r.id} className="req"><div style={{ flex: 1 }}>{r.title}<div className="m">{r.profiles?.name || r.profiles?.email} · {new Date(r.created_at).toLocaleDateString()}{r.note ? ' — ' + r.note : ''}</div></div>
            <div className="amt"><b>{fmt(r.amount)}</b></div><span className={'pill ' + ({ open: 'with_director', approved: 'green', rejected: 'gate', booked: 'submitted' }[r.status])}>{t('b_st_' + r.status)}</span>
            {r.status === 'open' && r.requested_by === profile.id && <button className="btn ghost" onClick={() => withdraw(r)}>{t('withdraw')}</button>}</div>)}</>}
          {man.length > 0 && <><p className="k" style={{ marginTop: 12 }}>{t('b_spent_log')}</p>{man.map(x => { const l = lines.find(y => y.id === x.budget_line_id); return <div key={x.id} className="req"><div style={{ flex: 1 }}>{x.description || (l ? lineLabel(l) : '—')}<div className="m">{[x.period, x.description && l && lineLabel(l)].filter(Boolean).join(' · ')}</div></div><div className="amt"><b>{fmt(x.amount)}</b></div>{x.uploaded_by === profile.id && <button className="btn ghost sm" onClick={() => delSpend(x)}>✕</button>}</div> })}</>}
        </>}
      </div> })}

    {isAdmin && <div className="card n" style={{ marginTop: 12 }}><p className="k">{t('b_admin')} · {year}</p><p className="m">{t('b_admin_hint')}</p>
      <div className="btns"><label className="btn p" data-help="b_up_finance">📤 {t('b_up_finance')}<input type="file" accept=".xlsx,.xls" hidden onChange={upFinance} /></label></div>
      <details className="more" data-help="b_more"><summary>{t('b_more')}</summary>
        <div className="morerow"><p className="m">{t('b_upl_hint')}</p><div className="btns"><label className="btn">📤 {t('b_up_lines')}<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={upLines} /></label><button className="btn ghost" onClick={() => template('lines')}>📥 {t('b_tpl_lines')}</button></div></div>
        <div className="morerow"><p className="m">{t('b_acts_hint')}</p><div className="btns"><label className="btn">📤 {t('b_up_acts')}<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={upActs} /></label><button className="btn ghost" onClick={() => template('actuals')}>📥 {t('b_tpl_acts')}</button></div></div>
      </details>
      {book && <FinanceImport t={t} lang={lang} refd={refd} profile={profile} book={book} show={show} onClose={() => setBook(null)} onDone={(y) => { setBook(null); if (y !== year) setYear(y); else B.load() }} />}</div>}
  </>
}

/* ---------------- OUTPUTS ---------------- */
function Outputs({ t, lang, refd }) {
  const [rows, setRows] = useState([])
  useEffect(() => { Promise.all([supabase.from('asks').select('*, departments(name_en,name_ar,code,directorates(name_en))').eq('cycle_id', refd.cycle.id).neq('status', 'withdrawn').order('department_id'), supabase.from('ask_totals').select('*')]).then(([a, tt]) => { const m = Object.fromEntries((tt.data || []).map(x => [x.ask_id, x])); setRows((a.data || []).map(x => ({ ...x, ask_totals: m[x.id] || {} }))) }) }, [refd.cycle.id])
  const sums = rows.reduce((s, a) => { const g = a.status === 'green'; return { capex: s.capex + capex(a), opex: s.opex + opexYear(a), gc: s.gc + (g ? capex(a) : 0), go: s.go + (g ? opexYear(a) : 0) } }, { capex: 0, opex: 0, gc: 0, go: 0 })
  const xlsx = () => {
    const data = rows.map(a => { const tt = a.ask_totals || {}; const oy = opexYear(a); return {
      Directorate: a.departments?.directorates?.name_en, Department: a.departments?.name_en, Title: a.title, Lane: a.lane, Register: a.register_code, 'Goal (own words)': a.lane_other, Link: a.register_code ? 'ExCom' + (a.budget_line_id ? ' + GL' : '') : a.budget_line_id ? 'GL' : a.link_none ? 'Neither (new need)' : '', Quarter: a.quarter, 'Capex class': a.capex_class, 'CAPEX (EGP)': a.quote_decides ? null : capex(a), 'Quote decides': a.quote_decides ? 'yes' : '',
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
// PlanTee's inbox: what people told BudguTee (ideas, missing things, problems)
function Ideas({ t, lang, refd }) {
  const [list, setList] = useState(null), [f, setF] = useState('open')
  const load = () => supabase.from('suggestions').select('*').order('created_at', { ascending: false }).then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [])
  const mark = async (id, status) => { await supabase.from('suggestions').update({ status }).eq('id', id); load() }
  const dep = (id) => { const d = refd.departments.find(x => x.id === id); return d ? d[lang === 'ar' ? 'name_ar' : 'name_en'] : '' }
  const icon = { idea: '💡', missing: '🧩', problem: '⚠️' }
  const shown = (list || []).filter(x => f === 'all' || x.status !== 'done')
  return <>
    <div className="hero"><p className="k">smartBudget</p><h2>📬 {t('ideas_title')}</h2><p>{t('ideas_lead')}</p>
      <div className="seg wide">{['open', 'all'].map(k => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{t('ideas_' + k)}</button>)}</div></div>
    {list && !shown.length && <div className="card center"><p className="m">{t('ideas_empty')}</p></div>}
    {shown.map(x => <div key={x.id} className={'card idea ' + x.status}>
      <div className="idea-h"><span className="idea-k">{icon[x.kind] || '💡'} {t('sug_' + x.kind)}</span><span className={'pill ' + (x.status === 'done' ? 'green' : x.status === 'seen' ? 'draft' : 'yellow')}>{t('ideas_' + x.status)}</span><span className="sp" />
        <small>{x.name || '—'}{x.department_id ? ' · ' + dep(x.department_id) : ''} · {new Date(x.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}{x.via === 'chat' ? ' · ' + t('ideas_chat') : ''}</small></div>
      <p className="idea-b" dir="auto">{x.body}</p>
      <div className="btns">{x.status === 'new' && <button className="btn sm" onClick={() => mark(x.id, 'seen')}>{t('ideas_mark_seen')}</button>}
        {x.status !== 'done' ? <button className="btn g sm" onClick={() => mark(x.id, 'done')}>{t('ideas_mark_done')}</button> : <button className="btn ghost sm" onClick={() => mark(x.id, 'new')}>{t('ideas_reopen')}</button>}</div>
    </div>)}
  </>
}

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
  const one = async (p) => { setBusy(p.id); if (await invite(p)) show(t('invite_ok') + ' ' + p.email); setBusy(false); load() }
  const all = async () => { setBusy(true); for (const p of list.filter(x => !x.last_seen_at && !x.invited_at && x.role !== 'pending')) { if (!(await invite(p))) break } setBusy(false); load() }
  const place = (x, set) => (x.role === 'head' || x.role === 'pending')
    ? <DeptSelect value={x.department_id} onChange={v => set(x.role === 'pending' && v ? { department_id: v, role: 'head' } : { department_id: v })} deps={refd.departments} refd={refd} lang={lang} blank />
    : (x.role === 'director' || x.role === 'admin')
      ? <select value={x.directorate_id || ''} onChange={e => set({ directorate_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{refd.directorates.map(g => <option key={g.id} value={g.id}>{nm(g)}</option>)}</select>
      : <span className="m">{t('whole_company')}</span>
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
    <div className="card" style={{ overflowX: 'auto' }}><table className="tb people"><thead><tr><th>{t('email')}</th><th>{t('name')}</th><th>{t('role')}</th><th>{t('directorate')} / {t('department')}</th><th>{t('sits_room')}</th><th></th></tr></thead><tbody>
      {list.map(p => <tr key={p.id}><td>{p.email}</td><td><input type="text" defaultValue={p.name || ''} onBlur={e => e.target.value !== (p.name || '') && upd(p, { name: e.target.value })} /></td>
        <td>{roles(p.role, v => upd(p, { role: v }))}</td>
        <td>{place(p, patch => upd(p, patch))}</td>
        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.in_room} onChange={e => upd(p, { in_room: e.target.checked })} /></td>
        <td style={{ whiteSpace: 'nowrap' }}>{p.last_seen_at ? <span className="pill green">✓ {t('signed_in')}</span> : <button className="btn" disabled={busy === p.id || busy === true} onClick={() => { if (!busy) one(p) }}>{busy === p.id ? '…' : '✉'} {p.invited_at ? t('reinvite') : t('invite')}</button>}</td></tr>)}
    </tbody></table></div>
  </>
}
