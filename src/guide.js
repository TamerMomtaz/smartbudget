// The one-page guide: the whole journey, start to finish, in both languages.
// Each section: h = heading, p = paragraphs, steps = numbered list, tip = a short boxed note.
export const GUIDE = {
  en: {
    title: 'How smartBudget works',
    lead: 'One place for two jobs. In November we ask for next year’s money. All year we watch how much is left. This page walks the whole journey once, start to finish.',
    sections: [
      { icon: '🧭', h: 'The two halves', p: [
        '**My asks** is for Budget 2027. Each department writes a card for every piece of new money it needs: a machine, a project, a hire. The cards are pitched in the room, and the room decides.',
        '**Budget** is for the whole year. Each department keeps its GL lines, records what it spends, and sees what is left. Approved cards land here by themselves as CAPEX lines.',
      ], tip: 'Short version: asks are what we want; the budget is what we got and how we spend it.' },
      { icon: '👥', h: 'Who does what', p: [
        '**Department head:** writes the cards and the GL lines for the department, and records spending.',
        '**Director:** reads the cards from their departments, sends each one back with a note or forwards it to the room.',
        '**The room (ExCom):** hears the pitches, scores each card, and marks the decision.',
        '**Admin:** invites people, uploads finance’s Excel, and keeps the lists tidy.',
      ] },
      { icon: '✍️', h: '1 · Write a card', steps: [
        '**Goal:** what you want and why, in plain words. Link it to an ExCom goal, to an existing GL line, or choose “Neither” if it fits no line yet.',
        '**Money:** the CAPEX amount, whether it is a project or an asset, the quarter you need it, and whether a quote decides the figure. Add the yearly running cost (OPEX) if there is one.',
        '**Return:** what it gives back and when: saving, capacity, safety, compliance.',
        '**If not funded:** what happens if we wait a year, and what we would stop doing instead.',
        '**Check & send:** read it once on one screen, then send it to your director.',
      ], tip: 'Not sure what a field means? Turn on “? Explain” at the top. Every field then explains itself in a side panel.' },
      { icon: '🔁', h: '2 · The director reviews', p: [
        'The card shows **With my director**. The director either sends it back with a note (you see **Sent back**, fix it and send again) or forwards it to the room (**Submitted**).',
      ] },
      { icon: '🎤', h: '3 · The room', p: [
        'On pitch day the cards are shown one by one, on a projector if you like. Each person in the room scores four questions from 0 to 3:',
        '**Fit** with the engine or a station · **Evidence** behind the figures · **Reversible / asset-light** · **Payback** or a gate it opens.',
        'The total is out of 12. **10 or more** reads green, **6 to 9** yellow, **below 6** orange. The colour is a guide; the room makes the call:',
        '🟢 **Funded** · 🟡 **Come back** (with more evidence) · 🟠 **Waits for a gate** (for example, after a trial or a contract).',
      ] },
      { icon: '🏗️', h: '4 · Funded cards join the budget', p: [
        'When the room marks a card **Funded**, it appears by itself in that department’s 2027 budget, in the CAPEX list, marked “Approved in the room”. Nobody types it twice.',
        'If the room changes its mind, the line leaves with the card. Once finance locks the line, it stays.',
      ] },
      { icon: '📒', h: '5 · GL lines for the year', p: [
        'Running costs live in GL lines: maintenance, fuel, calibration, consulting, and so on. There are two ways they get in:',
      ], steps: [
        '**The department writes them** under Budget → “Our GL lines”, with last year’s figure next to each line.',
        '**Finance sends its Excel** and the admin uploads it with “Upload a finance Excel”. The file is matched by GL code, so the same lines are updated, not copied: the budget, what was spent so far (AX), last year, the monthly plan and the vendor breakdown.',
      ], tip: 'Before importing, the upload shows what looks wrong: lines over budget, money spent with no budget, and numbers that disagree between tabs.' },
      { icon: '💸', h: '6 · Spending all year', p: [
        'Record a spend on its line as it happens, or ask for money that is not in a line yet. Each line shows **Left** = budget − spent − promised, and **Plan by now** shows what the monthly plan expected up to today, so a line running ahead of plan stands out early.',
      ] },
      { icon: '🔐', h: 'Signing in', p: [
        'The first time, you get an e-mail from **noreply@smartbudget.devoneerstechnology.ai** with a sign-in link. It is safe: it only opens smartBudget, and it was sent because someone in Al Manar invited you or you asked for it.',
        'You stay signed in on that browser. To skip the e-mail next time, press 🔑 at the top once and set a password.',
      ] },
      { icon: '❓', h: 'Questions people ask', qa: [
        ['Why link a card to a GL?', 'It shows the room whether the ask fits inside a line that already runs, or needs new money. Choose “Neither” when nothing fits.'],
        ['We already wrote our GL lines. What happens when finance’s file arrives?', 'The same lines are updated by GL code, even if you typed only the code without the cost centre. Nothing is entered twice.'],
        ['Can I change a card after sending it?', 'While it is with your director, ask them to send it back to you. If the room says “Come back”, you can edit it and send it again. Every change is kept in the card’s history.'],
        ['Who sees my cards?', 'Your department, your director and the admin. The room sees a card only after it is sent to the room, never drafts.'],
      ] },
    ],
  },
  ar: {
    title: 'smartBudget بيشتغل إزاي',
    lead: 'مكان واحد لشغلانتين. في نوفمبر بنطلب فلوس السنة الجاية، وطول السنة بنتابع فاضل كام. الصفحة دي بتمشي معاك الرحلة كلها من أولها لآخرها.',
    sections: [
      { icon: '🧭', h: 'النصّين', p: [
        '**طلباتي** خاصة بميزانية 2027. كل قسم يكتب كارت لكل فلوس جديدة محتاجها: ماكينة، مشروع، تعيين. الكروت بتتعرض في الغرفة، والغرفة هي اللي بتقرر.',
        '**الميزانية** طول السنة. كل قسم ماسك بنود الـGL بتاعته، بيسجّل اللي بيصرفه، وبيشوف فاضل كام. الكروت اللي بتتعتمد بتنزل هنا لوحدها كبنود CAPEX.',
      ], tip: 'باختصار: الطلبات هي اللي عايزينه، والميزانية هي اللي اتعتمد وإزاي بنصرفه.' },
      { icon: '👥', h: 'مين بيعمل إيه', p: [
        '**رئيس القسم:** بيكتب الكروت وبنود الـGL للقسم، وبيسجّل المصروف.',
        '**المدير:** بيقرا كروت أقسامه، ويرجّع الكارت بملاحظة أو يبعته للغرفة.',
        '**الغرفة (اللجنة التنفيذية):** بتسمع العرض، وتدّي درجات لكل كارت، وتسجّل القرار.',
        '**الأدمن:** بيدعو الناس، ويرفع شيت المالية، وبيظبط القوايم.',
      ] },
      { icon: '✍️', h: '١ · اكتب الكارت', steps: [
        '**الهدف:** عايز إيه وليه، بكلام بسيط. اربطه بهدف من أهداف اللجنة التنفيذية، أو ببند GL موجود، أو اختار «ولا ده ولا ده» لو مالوش بند لسه.',
        '**الفلوس:** مبلغ الـCAPEX، مشروع ولا أصل، محتاجه في أنهي ربع، وهل عرض السعر هو اللي هيحدد الرقم. ولو فيه تكلفة تشغيل سنوية (OPEX) اكتبها.',
        '**العائد:** هيرجّع إيه وإمتى: توفير، طاقة إنتاجية، سلامة، التزام.',
        '**لو اتأجل:** إيه اللي هيحصل لو استنينا سنة، وإيه اللي هنبطّله بداله.',
        '**راجع وابعت:** اقراه مرة واحدة في شاشة واحدة، وابعته لمديرك.',
      ], tip: 'مش متأكد خانة معناها إيه؟ شغّل «? فهمني» فوق، وكل خانة هتشرح نفسها في جنب الشاشة.' },
      { icon: '🔁', h: '٢ · المدير بيراجع', p: [
        'الكارت يظهر **عند المدير**. المدير يا إما يرجّعه بملاحظة (هتشوف **مرتجع للتعديل**، تصلّحه وتبعته تاني)، يا إما يبعته للغرفة (**مُرسل**).',
      ] },
      { icon: '🎤', h: '٣ · الغرفة', p: [
        'يوم العرض الكروت بتظهر واحد ورا التاني، وممكن على البروجكتور. كل واحد في الغرفة يدّي درجة من 0 لـ 3 في أربع أسئلة:',
        '**الملاءمة** مع المحرك أو محطة · **الدليل** ورا الأرقام · **قابل للرجوع / خفيف الأصول** · **الاسترداد** أو بوابة بيفتحها.',
        'المجموع من 12. **10 أو أكتر** أخضر، **من 6 لـ 9** أصفر، **أقل من 6** برتقاني. اللون مجرد دليل، والقرار للغرفة:',
        '🟢 **مُعتمد** · 🟡 **يرجع تاني** (بدليل أكتر) · 🟠 **ينتظر بوابة** (زي بعد تجربة أو عقد).',
      ] },
      { icon: '🏗️', h: '٤ · الكارت المعتمد بيدخل الميزانية', p: [
        'لما الغرفة تعتمد كارت، بيظهر لوحده في ميزانية 2027 للقسم ده، في قايمة الـCAPEX، ومكتوب عليه «اتوافق عليه في الغرفة». محدش بيكتبه مرتين.',
        'لو الغرفة غيّرت رأيها، البند بيمشي مع الكارت. ولما المالية تقفل البند، بيفضل.',
      ] },
      { icon: '📒', h: '٥ · بنود الـGL للسنة', p: [
        'مصاريف التشغيل بتتسجّل في بنود GL: صيانة، وقود، معايرة، استشارات وهكذا. وبتدخل بطريقتين:',
      ], steps: [
        '**القسم بيكتبها** من الميزانية ← «بنود الـGL بتاعتنا»، وجنب كل بند رقم السنة اللي فاتت.',
        '**المالية تبعت الشيت** والأدمن يرفعه من «ارفع شيت المالية». الشيت بيتطابق بكود الـGL، فنفس البنود بتتحدّث مش بتتكرر: الميزانية، اللي اتصرف لحد دلوقتي (AX)، السنة اللي فاتت، الخطة الشهرية وتفاصيل الموردين.',
      ], tip: 'قبل الاستيراد، الرفع بيوريك اللي شكله غلط: بنود عدّت الميزانية، فلوس اتصرفت من غير ميزانية، وأرقام مش متفقة بين التابات.' },
      { icon: '💸', h: '٦ · الصرف طول السنة', p: [
        'سجّل المصروف على البند بتاعه أول بأول، أو اطلب فلوس مش موجودة في بند لسه. كل بند بيوريك **الفاضل** = الميزانية − المصروف − الموعود بيه، و**الخطة لحد دلوقتي** بتوريك الخطة الشهرية كانت متوقعة كام لحد النهارده، فالبند اللي بيصرف أسرع من الخطة بيبان بدري.',
      ] },
      { icon: '🔐', h: 'الدخول', p: [
        'أول مرة هيجيلك إيميل من **noreply@smartbudget.devoneerstechnology.ai** فيه لينك دخول. الإيميل آمن: بيفتح smartBudget بس، واتبعت لأن حد في المنار دعاك أو إنت طلبته.',
        'هتفضل داخل على المتصفح ده. ولو مش عايز الإيميل كل مرة، دوس 🔑 فوق مرة واحدة واعمل باسورد.',
      ] },
      { icon: '❓', h: 'أسئلة بتتسأل', qa: [
        ['ليه أربط الكارت ببند GL؟', 'عشان الغرفة تعرف الطلب ده جوّه بند شغّال أصلاً، ولا محتاج فلوس جديدة. اختار «ولا ده ولا ده» لو مفيش بند مناسب.'],
        ['إحنا كتبنا بنودنا. لما شيت المالية ييجي إيه اللي هيحصل؟', 'نفس البنود بتتحدّث بكود الـGL، حتى لو كتبت الكود من غير مركز التكلفة. محدش بيدخّل حاجة مرتين.'],
        ['أقدر أعدّل الكارت بعد ما بعته؟', 'طول ما هو عند المدير، اطلب منه يرجّعهولك. ولو الغرفة قالت «يرجع تاني»، تقدر تعدّله وتبعته تاني. كل تعديل بيتحفظ في تاريخ الكارت.'],
        ['مين بيشوف كروتي؟', 'قسمك، ومديرك، والأدمن. والغرفة بتشوف الكارت بس بعد ما يتبعت للغرفة، والمسودات لأ.'],
      ] },
    ],
  },
}
