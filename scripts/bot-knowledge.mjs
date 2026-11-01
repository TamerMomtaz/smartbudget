// Builds Budgootee's knowledge from the app's own guide and Explain texts, so he only knows what smartBudget really does.
// Runs before every build (npm run build); writes public/bot-knowledge.txt, which the budgootee function reads.
import { writeFileSync } from 'fs'
import { HELP } from '../src/help.js'
import { GUIDE } from '../src/guide.js'
const strip = (s) => String(s).replace(/\*\*/g, '')
const out = []
for (const lang of ['en', 'ar']) {
  const g = GUIDE[lang]; out.push(`# ${g.title} (${lang})`, strip(g.lead))
  for (const s of g.sections) {
    out.push(`## ${s.h}`); (s.p || []).forEach(p => out.push(strip(p))); (s.steps || []).forEach((p, i) => out.push(`${i + 1}. ${strip(p)}`))
    ;(s.qa || []).forEach(([q, a]) => out.push(`Q: ${q}\nA: ${a}`)); if (s.tip) out.push(`Tip: ${strip(s.tip)}`)
  }
  out.push(`# Every field and button (${lang})`)
  for (const [k, v] of Object.entries(HELP[lang])) out.push(`- ${v.t}: ${strip(v.b)}${v.how ? ' How: ' + strip(v.how) : ''}`)
}
const text = out.join('\n')
// served with the app, so every deploy keeps Budgootee in step with the guide
writeFileSync('public/bot-knowledge.txt', text)
console.log('knowledge chars:', text.length)
