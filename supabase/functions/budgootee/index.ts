// Budgootee: smartBudget's helper bot. One door to the AI model, so the key never reaches the browser.
// Secrets (Supabase → Edge Functions → Secrets): BOT_KEY (required), BOT_PROVIDER = anthropic | deepseek (default anthropic), BOT_MODEL (optional), BOT_DAILY (questions per person per day, default 40).
import { createClient } from 'npm:@supabase/supabase-js@2'

// what he knows: the app's own guide and Explain texts, published with every deploy
const KNOW_URL = Deno.env.get('BOT_KNOWLEDGE_URL') || 'https://smartbudget.devoneerstechnology.ai/bot-knowledge.txt'
let know = { text: '', at: 0 }
async function knowledge() {
  if (know.text && Date.now() - know.at < 10 * 60 * 1000) return know.text
  try { const r = await fetch(KNOW_URL); if (r.ok) know = { text: await r.text(), at: Date.now() } } catch { /* keep the last copy */ }
  return know.text
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const system = (KNOWLEDGE: string) => `You are Budgootee, the friendly helper inside smartBudget, Al Manar's budget platform (Al Manar means "the lighthouse"; you are a little lighthouse).
Answer questions about how to use smartBudget: asks (cards), the director, the room and its scores, the budget, GL lines, finance's Excel, spending, signing in.
Rules:
- Use ONLY the knowledge below. If the answer is not there, say you are not sure and suggest asking Tee (Tamer Momtaz, the Plant director) or opening the 📖 Guide. Never invent buttons, features or numbers.
- Reply in the language the person writes in. For Arabic use warm, simple Egyptian Arabic (عامية مصرية مهذبة), with Latin numbers.
- Be short: 1 to 5 sentences, or a few numbered steps when they ask "how". Name buttons exactly as they appear on screen, in the person's language.
- Be kind and encouraging; people may be new to the system or unsure about it. No judgement about anyone's budget.
- You cannot see or change their data. If they ask about a specific number, tell them where to look in the app.

KNOWLEDGE:
${KNOWLEDGE}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method === 'GET') return json({ ready: !!Deno.env.get('BOT_KEY') })
  try {
    const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const key = Deno.env.get('BOT_KEY'); if (!key) return json({ error: 'no_key' }, 503)
    // who is asking: only signed-in people with a profile
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const admin = createClient(url, service)
    const { data: u } = await admin.auth.getUser(token); if (!u?.user) return json({ error: 'auth' }, 401)
    // daily cap per person
    const day = new Date().toISOString().slice(0, 10), cap = Number(Deno.env.get('BOT_DAILY') || 40)
    const { data: row } = await admin.from('bot_usage').select('n').eq('user_id', u.user.id).eq('day', day).maybeSingle()
    if ((row?.n || 0) >= cap) return json({ error: 'cap', cap }, 429)
    await admin.from('bot_usage').upsert({ user_id: u.user.id, day, n: (row?.n || 0) + 1 }, { onConflict: 'user_id,day' })

    const body = await req.json()
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-10)
      .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ error: 'empty' }, 400)
    const where = `The person is on the "${String(body.screen || '').slice(0, 40)}" screen, app language ${body.lang === 'ar' ? 'Arabic' : 'English'}, role ${String(body.role || '').slice(0, 20)}.`

    const SYSTEM = system(await knowledge())
    const provider = Deno.env.get('BOT_PROVIDER') || 'anthropic'
    let upstream: Response, pick: (ev: any) => string | undefined
    if (provider === 'deepseek') {
      upstream = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: Deno.env.get('BOT_MODEL') || 'deepseek-flash', stream: true, max_tokens: 600, messages: [{ role: 'system', content: SYSTEM + '\n' + where }, ...msgs] }) })
      pick = (ev) => ev.choices?.[0]?.delta?.content
    } else {
      upstream = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: Deno.env.get('BOT_MODEL') || 'claude-haiku-5-5', stream: true, max_tokens: 600,
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: where }], messages: msgs }) })
      pick = (ev) => ev.type === 'content_block_delta' ? ev.delta?.text : undefined
    }
    if (!upstream.ok || !upstream.body) return json({ error: 'model', status: upstream.status, detail: (await upstream.text()).slice(0, 300) }, 502)

    // pass the words on as plain text, as they arrive
    const dec = new TextDecoder(), enc = new TextEncoder(); let buf = ''
    const stream = upstream.body.pipeThrough(new TransformStream({
      transform(chunk, ctl) {
        buf += dec.decode(chunk, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const l of lines) { if (!l.startsWith('data:')) continue; const d = l.slice(5).trim(); if (!d || d === '[DONE]') continue
          try { const t = pick(JSON.parse(d)); if (t) ctl.enqueue(enc.encode(t)) } catch { /* partial line */ } }
      },
    }))
    return new Response(stream, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
  } catch (e) { return json({ error: 'server', detail: String(e).slice(0, 200) }, 500) }
})
