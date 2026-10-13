import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { CardPreview } from './components/CardPreview'
import { Layout, ScanGlyph, counterPath } from './components/Layout'
import { StallPhoto } from './components/StallPhoto'
import { StatusBadge } from './components/StatusBadge'
import { formatBackupCode, newCardCredentials, normalizeBackupCode } from './lib/crypto'
import { copy as translations, type Copy } from './lib/i18n'
import { checkMealCard, createMeal, createStall, fundPractice, getMeal, getProof, getStalls, prepareMeal, prepareTrust, serveMeal, starterStall, submitMeal, submitTrust, type ProofData } from './lib/api'
import { dishes, foodPhoto, heroSlides } from './lib/food'
import { tiltHandlers, useReveal } from './lib/motion'
import type { CardSecret, Language, Meal, Stall } from './lib/types'
import { practiceMode, signStellarTransaction } from './lib/wallet'
import { WalletProvider, dollars, shortAddress, useWallet } from './lib/walletContext'

const cardStorageKey = 'pendiente.cards.v1'
// The served-plate email is offered only when the server has an email sender configured.
const emailNotice = import.meta.env.VITE_EMAIL_NOTICE === 'true'

function readCards(): CardSecret[] {
  try {
    return JSON.parse(localStorage.getItem(cardStorageKey) ?? '[]') as CardSecret[]
  } catch {
    return []
  }
}

function saveCard(card: CardSecret) {
  localStorage.setItem(cardStorageKey, JSON.stringify([...readCards().filter((item) => item.mealId !== card.mealId), card]))
}

function cardFor(mealId: string) {
  return readCards().find((card) => card.mealId === mealId)
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function shortDate(value?: string) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function shortTime(value?: string) {
  return value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
}

const emptyTotals: ProofData['totals'] = { bought: 0, served: 0, returned: 0, waiting: 0, paidCents: 0, returnedCents: 0 }

function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pendiente.language') as Language) || 'en')
  const t = translations[language]
  const location = useLocation()
  useReveal(location.pathname + language)
  const toggleLanguage = () => setLanguage((current) => {
    const next = current === 'en' ? 'es' : 'en'
    localStorage.setItem('pendiente.language', next)
    return next
  })

  return (
    <Layout copy={t} language={language} toggleLanguage={toggleLanguage}>
      <Routes>
        <Route path="/" element={<HomePage copy={t} language={language} />} />
        <Route path="/stall/:stallId" element={<StallPage copy={t} />} />
        <Route path="/pay/:stallId" element={<PaymentPage copy={t} />} />
        <Route path="/meal/:mealId/card" element={<MealCardPage copy={t} />} />
        <Route path="/meal/:mealId" element={<MealPage copy={t} />} />
        <Route path="/meals" element={<MyMealsPage copy={t} />} />
        <Route path="/counter" element={<CounterPickPage copy={t} />} />
        <Route path="/counter/:stallId" element={<CounterPage copy={t} />} />
        <Route path="/proof" element={<ProofPage copy={t} />} />
        <Route path="/chalkboard" element={<ChalkboardPage copy={t} />} />
        <Route path="/admin" element={<AdminPage copy={t} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setValue(target); return }
    let frame = 0; const start = performance.now()
    const step = (now: number) => { const progress = Math.min(1, (now - start) / duration); setValue(target * (1 - Math.pow(1 - progress, 3))); if (progress < 1) frame = requestAnimationFrame(step) }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return value
}

function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (value: number) => string }) {
  return <>{format(useCountUp(value))}</>
}

function useTotals() {
  const [totals, setTotals] = useState(emptyTotals)
  useEffect(() => { getProof().then((data) => setTotals(data.totals)).catch((cause) => console.error('Totals read failed', cause)) }, [])
  return totals
}

function HomePage({ copy, language }: { copy: Copy; language: Language }) {
  const [stalls, setStalls] = useState<Stall[]>([starterStall])
  const totals = useTotals()
  useEffect(() => { getStalls().then(setStalls).catch((cause) => console.error('Stalls read failed', cause)) }, [])
  const stall = stalls[0] ?? starterStall
  return (
    <>
      <section className="hero">
        <div className="hero-media" aria-hidden="true">
          {heroSlides.map((id, index) => <div key={id} className="hero-slide" style={{ backgroundImage: `url(${foodPhoto(id)})`, animationDelay: `${index * 6 - (index === 0 ? 0.6 : 0)}s` }} />)}
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="steam" aria-hidden="true"><span /><span /><span /></div>
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="kicker"><span className="live-dot" /> {practiceMode ? copy.walletPractice : copy.heroKicker}</div>
            <h1><span className="line"><span>{copy.heroTitleA}</span></span><span className="line accent"><span>{copy.heroTitleB}</span></span></h1>
            <p className="hero-lead">{copy.heroLead}</p>
            <div className="hero-actions">
              <Link className="button button-hot" to="/#give">{copy.heroCta} <span aria-hidden="true">→</span></Link>
              <Link className="button button-glass" to="/proof">{copy.heroSecondary}</Link>
            </div>
            <div className="hero-stats">
              <div><strong><CountUp value={totals.served} /></strong><span>{copy.statServed}</span></div>
              <div><strong><CountUp value={totals.paidCents} format={(n) => money(Math.round(n))} /></strong><span>{copy.statPaid}</span></div>
              <div><strong><CountUp value={totals.returned} /></strong><span>{copy.statReturned}</span></div>
            </div>
          </div>
          <div className="hero-card-wrap" {...tiltHandlers(12)}>
            <div className="hero-card">
              <div className="hero-card-top"><span>PENDIENTE</span><span className="hero-card-chip" /></div>
              <div className="hero-card-photo" style={{ backgroundImage: `url(${foodPhoto('jollof2', true)})` }} />
              <strong>{copy.cardWaiting} {copy.cardFor.toLowerCase()} Mama Bisi</strong>
              <small>{copy.showAt} {stall.name}</small>
              <div className="hero-card-foot"><span className="fake-qr" aria-hidden="true">{Array.from({ length: 25 }, (_, index) => <i key={index} className={(index * 7) % 3 ? 'on' : ''} />)}</span><div><b>{money(stall.priceCents)}</b><em>{copy.heroCardMeta}</em></div></div>
            </div>
            <div className="hero-toast"><span>✓</span><div><b>{copy.served}</b><small>{copy.buyerCanSee}</small></div></div>
          </div>
        </div>
        <a className="scroll-cue" href="#give" aria-label={copy.browseStalls}><span /></a>
      </section>

      <section className="marquee" aria-label={copy.menuTitle}>
        <div className="marquee-track">
          {[...dishes, ...dishes].map((dish, index) => <div className="marquee-item" key={`${dish.id}-${index}`}><img src={foodPhoto(dish.id, true)} alt="" loading="lazy" /><span>{dish.name}</span><b>✦</b></div>)}
        </div>
      </section>

      <section className="section page-width" id="give">
        <div className="section-head reveal"><div className="eyebrow">01 · {copy.giveTitle}</div><h2>{copy.giveTitle}</h2><p>{copy.giveLead}</p></div>
        <div className="stall-feature-list">
          {stalls.map((item, index) => <StallFeature key={item.id} stall={item} copy={copy} sides={stallSides[index % stallSides.length]} />)}
        </div>
      </section>

      <section className="section page-width menu-section">
        <div className="section-head reveal"><div className="eyebrow">02 · {copy.menuTitle}</div><h2>{copy.menuTitle}</h2><p>{copy.menuLead}</p></div>
        <div className="dish-grid">
          {dishes.map((dish, index) => <article className="dish reveal" style={{ transitionDelay: `${(index % 4) * 80}ms` }} key={dish.id}>
            <div className="dish-photo"><img src={foodPhoto(dish.id)} alt={dish.name} loading="lazy" /></div>
            <div className="dish-body"><h3>{dish.name}</h3><p>{dish.note[language]}</p></div>
          </article>)}
        </div>
      </section>

      <section className="section how-section" id="how">
        <div className="page-width">
          <div className="section-head reveal"><div className="eyebrow">03 · {copy.navHow}</div><h2>{copy.howTitle}</h2><p>{copy.howLead}</p></div>
          <div className="how-grid">
            {([
              [copy.stepBuy, copy.stepBuyBody, 'nsala'],
              [copy.stepCard, copy.stepCardBody, 'moimoi'],
              [copy.stepScan, copy.stepScanBody, 'suyagrill'],
              [copy.stepPaid, copy.stepPaidBody, 'ricebeans'],
            ] as const).map(([title, body, photo], index) => <article className="how-step reveal" style={{ transitionDelay: `${index * 110}ms` }} key={title}>
              <div className="how-photo" style={{ backgroundImage: `url(${foodPhoto(photo, true)})` }}><span>0{index + 1}</span></div>
              <h3>{title}</h3><p>{body}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section className="vendor-band">
        <div className="vendor-bg" style={{ backgroundImage: `url(${foodPhoto('buka')})` }} aria-hidden="true" />
        <div className="page-width vendor-inner reveal">
          <div className="eyebrow light">{copy.stallsEyebrow}</div>
          <h2>{copy.stallsTitle}</h2>
          <p>{copy.stallsBody}</p>
          <Link className="button button-hot" to={counterPath}><ScanGlyph /> {copy.stallsCta}</Link>
        </div>
      </section>

      <section className="section page-width why-section">
        <div className="section-head reveal"><div className="eyebrow">04 · {copy.stellarTitle}</div><h2>{copy.stellarTitle}</h2></div>
        <div className="why-grid">
          {[copy.stellarFee, copy.stellarTime, copy.stellarCheck].map((line, index) => <div className="why-card reveal" style={{ transitionDelay: `${index * 90}ms` }} key={line}><b>0{index + 1}</b><span>{line}</span></div>)}
        </div>
      </section>

      <section className="section page-width faq-section">
        <div className="section-head reveal"><div className="eyebrow">05 · FAQ</div><h2>{copy.faqTitle}</h2></div>
        <div className="faq-list">
          {([[copy.faqQ1, copy.faqA1], [copy.faqQ2, copy.faqA2], [copy.faqQ3, copy.faqA3], [copy.faqQ4, copy.faqA4], [copy.faqQ5, copy.faqA5]] as const).map(([question, answer]) => <details className="faq reveal" key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}
        </div>
      </section>

      <section className="closing">
        <div className="closing-photo" style={{ backgroundImage: `url(${foodPhoto('jollof')})` }} aria-hidden="true" />
        <div className="page-width closing-inner reveal">
          <h2>{copy.storyQuote}</h2>
          <Link className="button button-hot" to="/#give">{copy.heroCta} <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </>
  )
}

const stallSides = [['buka', 'dodo'], ['egusi', 'pepper'], ['suya', 'puffpuff'], ['ricebeans', 'moimoi']]

function StallFeature({ stall, copy, sides }: { stall: Stall; copy: Copy; sides: string[] }) {
  return <Link className="stall-feature reveal" to={`/stall/${stall.id}`}>
    <div className="stall-feature-media">
      <StallPhoto photo={stall.photo} photoLabel={stall.name} className="feature-main" />
      <div className="feature-side" style={{ backgroundImage: `url(${foodPhoto(sides[0], true)})` }} aria-hidden="true" />
      <div className="feature-side two" style={{ backgroundImage: `url(${foodPhoto(sides[1], true)})` }} aria-hidden="true" />
    </div>
    <div className="stall-feature-body">
      <div className="pill-row"><span className="pill live"><span className="live-dot" /> {copy.livePill}</span><span className="pill">{stall.city}</span></div>
      <h3>{stall.name}</h3>
      <p>{stall.address}</p>
      <div className="stall-feature-foot">
        <div><strong>{money(stall.priceCents)}</strong><span>{copy.perMeal}</span></div>
        <div><strong>{stall.waitingCount}</strong><span>{copy.mealsWaiting}</span></div>
        <span className="button button-hot">{copy.buyMeal} →</span>
      </div>
    </div>
  </Link>
}

function Stepper({ copy, current }: { copy: Copy; current: number }) {
  const steps = [copy.stepChoose, copy.stepDetails, copy.stepPayShort, copy.stepCardShort]
  return <ol className="stepper">{steps.map((label, index) => <li key={label} className={index < current ? 'done' : index === current ? 'current' : ''}><span>{index < current ? '✓' : index + 1}</span>{label}</li>)}</ol>
}

const messageIdeas = { en: ['Eat well today ❤️', 'Thinking of you', 'Happy birthday!', 'Lunch is on me'], es: ['Come bien hoy ❤️', 'Pienso en ti', '¡Feliz cumpleaños!', 'El almuerzo va por mí'] }

function StallPage({ copy }: { copy: Copy }) {
  const { stallId } = useParams()
  const navigate = useNavigate()
  const [stall, setStall] = useState<Stall | null>(null)
  const [firstName, setFirstName] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  useEffect(() => { getStalls().then((items) => setStall(items.find((item) => item.id === stallId) ?? starterStall)).catch(() => setStall(starterStall)) }, [stallId])
  if (!stall) return <Loading copy={copy} />
  const ideas = copy.language === 'Español' ? messageIdeas.en : messageIdeas.es
  return <section className="page-width flow-page">
    <Stepper copy={copy} current={1} />
    <div className="flow-grid">
      <div className="flow-main">
        <Link className="back-link" to="/#give">← {copy.stallBack}</Link>
        <div className="stall-banner">
          <StallPhoto photo={stall.photo} photoLabel={stall.name} className="stall-banner-photo" />
          <div><div className="eyebrow">{copy.todayAt} {stall.city}</div><h1>{stall.name}</h1><p className="muted">{stall.address}</p></div>
        </div>
        <form className="meal-form" onSubmit={(event) => { event.preventDefault(); navigate(`/pay/${stall.id}`, { state: { firstName, message, email } }) }}>
          <label>{copy.forLabel}<span className="optional">{copy.forHint}</span><input value={firstName} onChange={(event) => setFirstName(event.target.value.slice(0, 40))} placeholder="Mama Bisi" autoFocus /></label>
          <label>{copy.messageLabel}<span className="optional">{message.length}/80</span><textarea value={message} maxLength={80} onChange={(event) => setMessage(event.target.value)} placeholder={copy.messageHint} rows={3} /></label>
          <div className="chips">{ideas.map((idea) => <button type="button" key={idea} className={message === idea ? 'on' : ''} onClick={() => setMessage(idea)}>{idea}</button>)}</div>
          {emailNotice && <label>{copy.emailLabel}<span className="optional">{copy.emailHint}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>}
          <button className="button button-hot button-wide" type="submit">{copy.continuePay} <span aria-hidden="true">→</span></button>
        </form>
      </div>
      <aside className="flow-aside">
        <div className="live-card" {...tiltHandlers(8)}>
          <div className="live-card-photo" style={{ backgroundImage: `url(${foodPhoto('jollof2')})` }}><span>{money(stall.priceCents)}</span></div>
          <div className="live-card-body">
            <small>PENDIENTE</small>
            <strong>{copy.cardWaiting}{firstName ? ` ${copy.cardFor.toLowerCase()} ${firstName}` : ''}.</strong>
            {message && <p className="live-card-message">“{message}”</p>}
            <span>{copy.showAt} {stall.name}</span>
          </div>
        </div>
        <p className="aside-note">{copy.noOnePaid}</p>
      </aside>
    </div>
  </section>
}

function PaymentPage({ copy }: { copy: Copy }) {
  const { stallId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const form = (location.state as { firstName?: string; message?: string; email?: string } | null) ?? {}
  const wallet = useWallet()
  const connected = practiceMode ? 'practice' : wallet.address
  const balance = wallet.balance ?? 0
  const [stall, setStall] = useState<Stall>(starterStall)
  const [approving, setApproving] = useState(false)
  const [funding, setFunding] = useState(false)
  const [error, setError] = useState('')
  const paymentAttempt = useRef<{ credentials: Awaited<ReturnType<typeof newCardCredentials>>; signedXdr?: string } | null>(null)
  useEffect(() => { getStalls().then((items) => setStall(items.find((item) => item.id === stallId) ?? starterStall)).catch(() => setStall(starterStall)) }, [stallId])
  const needed = stall.priceCents * 100_000
  const funded = practiceMode || balance >= needed
  const approve = async () => {
    setApproving(true); setError('')
    try {
      const credentials = paymentAttempt.current?.credentials || await newCardCredentials()
      paymentAttempt.current ||= { credentials }
      if (!practiceMode) {
        if (!connected) throw new Error('wallet_required')
        if (!paymentAttempt.current.signedXdr) {
          const prepared = await prepareMeal({ stallId: stall.id, buyer: connected, fingerprint: credentials.secretFingerprint, backupFingerprint: credentials.backupFingerprint })
          paymentAttempt.current.signedXdr = await signStellarTransaction(prepared.xdr, connected)
        }
        const meal = await submitMeal(paymentAttempt.current.signedXdr, { firstName: form.firstName, message: form.message, email: form.email })
        saveCard({ mealId: meal.id, stallId: meal.stallId, secret: credentials.secret, backupCode: credentials.backupCode })
        void wallet.refresh()
        navigate(`/meal/${meal.id}/card`, { replace: true }); return
      }
      const meal = await createMeal({ stallId: stall.id, firstName: form.firstName, message: form.message, email: form.email, secretFingerprint: credentials.secretFingerprint, backupFingerprint: credentials.backupFingerprint, practice: true })
      saveCard({ mealId: meal.id, stallId: meal.stallId, secret: credentials.secret, backupCode: credentials.backupCode })
      navigate(`/meal/${meal.id}/card`, { replace: true })
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'buy_failed' && paymentAttempt.current) delete paymentAttempt.current.signedXdr
      setError(cause instanceof Error && cause.message === 'low_balance' ? copy.lowBalance : cause instanceof Error && cause.message === 'buy_failed' ? copy.buyFailed : cause instanceof Error && (cause.name === 'ApiError' || cause.name === 'TypeError') ? copy.networkFailure : copy.rejectedPayment)
      setApproving(false)
    }
  }
  const connect = async () => {
    setError('')
    try { await wallet.connect() } catch { setError(copy.walletError) }
  }
  const fund = async () => {
    setFunding(true); setError('')
    try {
      const { xdr } = await prepareTrust(connected)
      await submitTrust(await signStellarTransaction(xdr, connected))
      await fundPractice(connected)
      await wallet.refresh()
    } catch { setError(copy.networkFailure) }
    finally { setFunding(false) }
  }
  const stepState = (done: boolean, active: boolean) => done ? 'done' : active ? 'active' : 'locked'
  return <section className="page-width flow-page">
    <Stepper copy={copy} current={2} />
    <div className="flow-grid">
      <div className="flow-main">
        <Link className="back-link" to={`/stall/${stall.id}`}>← {copy.stallBack}</Link>
        <div className="eyebrow">{copy.paymentLabel}</div>
        <h1 className="flow-title">{copy.paymentTitle}</h1>
        {practiceMode ? <div className="pay-steps">
          <div className="pay-step active"><span className="pay-step-num">1</span><div><strong>{copy.practiceContinue}</strong><p>{copy.payPracticeHint}</p><button className="button button-hot" type="button" disabled={approving} onClick={approve}>{approving ? copy.approving : copy.approve} {!approving && '→'}</button></div></div>
        </div> : <div className="pay-steps">
          <div className={`pay-step ${stepState(Boolean(connected), !connected)}`}>
            <span className="pay-step-num">{connected ? '✓' : 1}</span>
            <div><strong>{copy.payStepConnect}</strong>{connected ? <p className="mono">{shortAddress(connected)} · {copy.walletTestnet}</p> : <><p>{copy.payConnectHint}</p><button className="button button-dark" type="button" disabled={wallet.connecting} onClick={connect}>{wallet.connecting ? copy.loading : copy.connect} →</button></>}</div>
          </div>
          <div className={`pay-step ${stepState(Boolean(connected) && funded, Boolean(connected) && !funded)}`}>
            <span className="pay-step-num">{connected && funded ? '✓' : 2}</span>
            <div><strong>{copy.payStepFund}</strong><p>{connected ? `${copy.buyerBalance}: ${dollars(wallet.balance)}${funded ? ` · ${copy.balanceEnough}` : ''}` : copy.payFundHint}</p>{connected && !funded && <button className="button button-dark" type="button" disabled={funding} onClick={fund}>{funding ? copy.loading : copy.fundPractice} →</button>}</div>
          </div>
          <div className={`pay-step ${stepState(false, Boolean(connected) && funded)}`}>
            <span className="pay-step-num">3</span>
            <div><strong>{copy.payStepApprove}</strong><p>{copy.payApproveHint}</p>{connected && funded && <button className="button button-hot" type="button" disabled={approving} onClick={approve}>{approving ? copy.approving : copy.approve} {!approving && '→'}</button>}</div>
          </div>
        </div>}
        {error && <p className="form-error">{error}</p>}
      </div>
      <aside className="flow-aside">
        <div className="receipt-card">
          <div className="receipt-photo" style={{ backgroundImage: `url(${foodPhoto('ricebeans')})` }} />
          <div className="receipt-body">
            <div className="receipt-row"><span>{copy.paymentStall}</span><strong>{stall.name}</strong></div>
            {form.firstName && <div className="receipt-row"><span>{copy.cardFor}</span><strong>{form.firstName}</strong></div>}
            <div className="receipt-row"><span>{copy.paymentMeal}</span><strong>{money(stall.priceCents)}</strong></div>
            <div className="receipt-rule" />
            <div className="receipt-row total"><span>{copy.amountLabel}</span><strong>{money(stall.priceCents)}</strong></div>
            <p>{copy.demoReturnLine}</p>
          </div>
        </div>
      </aside>
    </div>
  </section>
}

function Confetti() {
  const colors = ['#ff7a2f', '#ffc83d', '#2f8f5b', '#e2483d', '#fff3d6']
  return <div className="confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, background: colors[index % colors.length], animationDelay: `${(index % 9) * 0.07}s`, animationDuration: `${1.6 + (index % 5) * 0.25}s`, transform: `rotate(${index * 29}deg)` }} />)}</div>
}

function MealCardPage({ copy }: { copy: Copy }) {
  const { mealId } = useParams()
  const [meal, setMeal] = useState<Meal | null>(null)
  const [missing, setMissing] = useState(false)
  const [stall, setStall] = useState<Stall>(starterStall)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [cardImageUrl, setCardImageUrl] = useState('')
  const card = mealId ? cardFor(mealId) : undefined
  useEffect(() => {
    if (!mealId) return
    let active = true
    getMeal(mealId).then(async (item) => {
      if (!active) return
      if (!item) { setMeal(null); setMissing(true); return }
      setMeal(item)
      const stalls = await getStalls()
      if (active) setStall(stalls.find((stall) => stall.id === item.stallId) ?? starterStall)
    }).catch(() => { if (active) { setMeal(null); setMissing(true) } })
    return () => { active = false }
  }, [mealId])
  useEffect(() => { if (!meal || !card) return; QRCode.toDataURL(JSON.stringify({ v: 2, mealId: meal.id, stallId: meal.stallId, secret: card.secret }), { width: 360, margin: 1, color: { dark: '#1a120b', light: '#fffaf0' } }).then(setQrDataUrl) }, [meal, card])
  const shareText = `${copy.shareMessage} ${stall.name}. ${copy.attachCard}`
  useEffect(() => {
    if (meal && card && qrDataUrl) void makeCardImage(meal, stall, qrDataUrl, card.backupCode, copy).then(setCardImageUrl)
  }, [meal, stall, qrDataUrl, card?.backupCode, copy])
  if (!meal || !card) return missing || !card ? <EmptyState copy={copy} title={copy.errorNotFound} /> : <Loading copy={copy} />
  const shareCard = async () => {
    if (!cardImageUrl) return
    const file = new File([await (await fetch(cardImageUrl)).blob()], `pendiente-${meal.id}.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Pendiente', text: `${copy.shareMessage} ${stall.name}` }) }
      catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('Card sharing failed') }
    } else {
      const download = document.createElement('a'); download.href = cardImageUrl; download.download = file.name; download.click()
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer')
    }
  }
  return <section className="page-width card-page">
    <Confetti />
    <Stepper copy={copy} current={3} />
    <div className="card-hero">
      <div className="success-ring" aria-hidden="true">✓</div>
      <div className="eyebrow">{copy.paymentComplete}</div>
      <h1>{copy.cardCelebrate}</h1>
      <p className="lead">{copy.cardLead}</p>
    </div>
    <div className="card-wrap"><CardPreview meal={meal} stall={stall} qrDataUrl={qrDataUrl} backupCode={card.backupCode} copy={copy} /></div>
    <p className="card-warning"><span>◎</span> {copy.cardWarning}</p>
    <div className="card-actions">
      <button className="button button-hot" type="button" onClick={() => void shareCard()}>{copy.share}</button>
      <a className="button button-light" href={cardImageUrl} download={`pendiente-${meal.id}.png`}>{copy.download} ↓</a>
      <button className="button button-light" type="button" onClick={() => window.print()}>{copy.print}</button>
    </div>
    <Link className="text-link centered-link" to={`/meal/${meal.id}`}>{copy.openMealPage} ↗</Link>
  </section>
}

function MealPage({ copy }: { copy: Copy }) {
  const { mealId } = useParams()
  const [meal, setMeal] = useState<Meal | null>(null)
  const [stall, setStall] = useState<Stall>(starterStall)
  useEffect(() => { if (!mealId) return; const load = () => getMeal(mealId).then(setMeal).catch((cause) => console.error('Meal read failed', cause)); load(); const timer = window.setInterval(load, 5000); return () => window.clearInterval(timer) }, [mealId])
  useEffect(() => { if (meal) getStalls().then((items) => setStall(items.find((item) => item.id === meal.stallId) ?? starterStall)).catch(() => undefined) }, [meal?.stallId])
  if (!meal) return <Loading copy={copy} />
  const photo = meal.photoUrl || meal.photoData
  const links = [[copy.mealBought, meal.paymentLink], [copy.served, meal.serveLink], [copy.moneyReturned, meal.refundLink]].filter((item): item is [string, string] => Boolean(item[1]))
  return <section className="page-width meal-page">
    <div className="meal-head">
      <div><div className="eyebrow">Pendiente · {stall.city}</div><h1>{meal.firstName ? `${copy.paymentFor} ${meal.firstName}.` : `${copy.cardWaiting}.`}</h1>{meal.message && <p className="meal-message">“{meal.message}”</p>}</div>
      <StatusBadge status={meal.status} copy={copy} />
    </div>
    <div className="meal-layout">
      <div className={`meal-photo ${photo ? 'has-photo' : ''}`}>
        {photo ? <img src={photo} alt={copy.plateAlt} /> : <><div className="meal-photo-blur" style={{ backgroundImage: `url(${foodPhoto('jollof2')})` }} /><span className="meal-photo-note">{meal.status === 'Waiting' ? copy.plateWaiting : copy.noPhoto}</span></>}
      </div>
      <div className="timeline">
        <div className="timeline-item done"><span /><div><strong>{copy.mealBought}</strong><small>{shortTime(meal.boughtAt)}</small></div></div>
        <div className={`timeline-item ${meal.status === 'Waiting' ? 'current' : 'done'}`}><span /><div><strong>{meal.status === 'Returned' ? copy.moneyReturned : meal.status === 'Served' ? copy.served : copy.cardWaiting}</strong><small>{meal.status === 'Waiting' ? `${copy.expiresPrefix} ${shortTime(meal.expiresAt)}` : shortTime(meal.servedAt)}</small></div></div>
        <div className="meal-facts">
          <div><small>{copy.stallLabel}</small><strong>{stall.name}</strong><span>{stall.address}</span></div>
          <div><small>{copy.amountLabel}</small><strong>{money(meal.amountCents)}</strong></div>
        </div>
        {links.length > 0 && <div className="chain-links"><small>{copy.seeStellar}</small>{links.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noreferrer">{label} ↗</a>)}</div>}
        <button type="button" className="button button-light" onClick={() => navigator.share ? navigator.share({ title: copy.shareTitle, url: window.location.href }).catch(() => undefined) : navigator.clipboard?.writeText(window.location.href)}>{copy.shareMealPage} ↗</button>
      </div>
    </div>
  </section>
}

function MyMealsPage({ copy }: { copy: Copy }) {
  const [cards] = useState(() => readCards().reverse())
  const [meals, setMeals] = useState<Record<string, Meal | null>>({})
  useEffect(() => {
    const load = () => cards.forEach((card) => getMeal(card.mealId).then((meal) => setMeals((current) => ({ ...current, [card.mealId]: meal }))).catch(() => setMeals((current) => ({ ...current, [card.mealId]: null }))))
    load(); const timer = window.setInterval(load, 10000); return () => window.clearInterval(timer)
  }, [cards])
  return <section className="page-width list-page">
    <div className="section-head"><div className="eyebrow">{copy.navMyMeals}</div><h1>{copy.myMealsTitle}</h1><p>{copy.myMealsLead}</p></div>
    {cards.length === 0 ? <div className="empty-panel"><div className="empty-photo" style={{ backgroundImage: `url(${foodPhoto('puffpuff', true)})` }} /><p>{copy.myMealsEmpty}</p><Link className="button button-hot" to="/stall/iya-basiras-buka">{copy.heroCta} →</Link></div> :
      <div className="my-meals">{cards.map((card, index) => { const meal = meals[card.mealId]; return <article className="my-meal reveal in" style={{ animationDelay: `${index * 60}ms` }} key={card.mealId}>
        <div className="my-meal-photo" style={{ backgroundImage: `url(${meal?.photoUrl || foodPhoto(dishes[index % dishes.length].id, true)})` }} />
        <div className="my-meal-body"><strong>{meal?.firstName ? `${copy.cardFor} ${meal.firstName}` : copy.cardWaiting}</strong><small>{meal ? `${money(meal.amountCents)} · ${shortTime(meal.boughtAt)}` : copy.loading}</small></div>
        {meal && <StatusBadge status={meal.status} copy={copy} />}
        <div className="my-meal-actions">{meal?.status === 'Waiting' && <Link className="button button-light small" to={`/meal/${card.mealId}/card`}>{copy.viewCard}</Link>}<Link className="button button-dark small" to={`/meal/${card.mealId}`}>{copy.viewMeal} →</Link></div>
      </article> })}</div>}
  </section>
}

type ScannedCard = { mealId?: string; stallId?: string; secret?: string }

const counterStallKey = 'pendiente.counter.stall'

function CounterPickPage({ copy }: { copy: Copy }) {
  const location = useLocation()
  const [stalls, setStalls] = useState<Stall[] | null>(null)
  useEffect(() => { getStalls().then(setStalls).catch(() => setStalls([starterStall])) }, [])
  const remembered = (() => { try { return localStorage.getItem(counterStallKey) } catch { return null } })()
  const choosing = new URLSearchParams(location.search).has('pick')
  if (!stalls) return <Loading copy={copy} />
  const known = stalls.find((stall) => stall.id === remembered)
  if (!choosing && known) return <Navigate to={`/counter/${known.id}`} replace />
  if (stalls.length === 1) return <Navigate to={`/counter/${stalls[0].id}`} replace />
  return <section className="counter-shell"><div className="counter-inner">
    <div className="counter-heading"><span className="pill dark">{copy.counterBadge}</span><h1>{copy.counterPickTitle}</h1><p className="lead">{copy.counterPickLead}</p></div>
    <div className="counter-picks">{stalls.map((stall) => <Link key={stall.id} className="counter-stall pick" to={`/counter/${stall.id}`}><StallPhoto photo={stall.photo} photoLabel={stall.name} className="counter-stall-photo" /><div><strong>{stall.name}</strong><span>{stall.city}</span></div><b aria-hidden="true">→</b></Link>)}</div>
  </div></section>
}

function CounterPage({ copy }: { copy: Copy }) {
  const { stallId } = useParams()
  const [stall, setStall] = useState<Stall>(starterStall)
  const [code, setCode] = useState('')
  const [scanned, setScanned] = useState<ScannedCard>({})
  const [candidate, setCandidate] = useState<Meal | null>(null)
  const [photoData, setPhotoData] = useState<string | undefined>()
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState('')
  const [serving, setServing] = useState(false)
  const [paidMeal, setPaidMeal] = useState<Meal | null>(null)
  useEffect(() => { getStalls().then((items) => setStall(items.find((item) => item.id === stallId) ?? starterStall)).catch(() => undefined) }, [stallId, paidMeal])
  useEffect(() => { if (stallId) try { localStorage.setItem(counterStallKey, stallId) } catch { /* the choice is only a convenience */ } }, [stallId])
  const runCheck = async (payload: ScannedCard) => {
    setError(''); setCandidate(null); setScanned(payload)
    try {
      const meal = await checkMealCard({ stallId: stall.id, mealId: payload.mealId, secret: payload.secret, backupCode: payload.secret ? undefined : code.trim().toUpperCase() })
      setCandidate(meal)
    } catch (cause) { setError(errorFor(cause, copy)) }
  }
  const checkTypedCode = (event: FormEvent) => { event.preventDefault(); if (normalizeBackupCode(code).length < 16) { setError(copy.errorWrongCode); return } runCheck({}) }
  const serve = async () => {
    if (!candidate) return
    setError(''); setServing(true)
    try {
      const served = await serveMeal(candidate.id, { stallId: stall.id, secret: scanned.secret, backupCode: scanned.secret ? undefined : code.trim().toUpperCase(), photoData })
      setPaidMeal(served); setCandidate(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (cause) { setError(errorFor(cause, copy)) }
    finally { setServing(false) }
  }
  const choosePhoto = async (file?: File) => { if (!file) return; try { setPhotoData(await compressPhoto(file, copy)) } catch (cause) { setError(cause instanceof Error ? cause.message : copy.errorGeneric) } }
  const reset = () => { setPaidMeal(null); setCode(''); setScanned({}); setPhotoData(undefined); window.scrollTo({ top: 0 }) }
  if (paidMeal) return <section className="counter-shell"><Confetti /><div className="counter-inner success-page">
    <div className="success-ring big">✓</div>
    <div className="eyebrow light">{stall.name}</div>
    <h1>{copy.paid} {money(paidMeal.amountCents)}</h1>
    <p className="lead">{paidMeal.firstName ? `${copy.mealFor} ${paidMeal.firstName}.` : copy.mealWasServed} {copy.buyerCanSee}</p>
    {(paidMeal.photoUrl || paidMeal.photoData) && <img className="success-photo" src={paidMeal.photoUrl || paidMeal.photoData} alt={copy.plateAlt} />}
    <button className="button button-hot button-wide" type="button" onClick={reset}><ScanGlyph /> {copy.scanAgain}</button>
    <Link className="text-link centered-link light" to={`/meal/${paidMeal.id}`}>{copy.openMealPage} ↗</Link>
  </div></section>
  return <section className="counter-shell">
    <div className="counter-inner">
      <div className="counter-heading">
        <div><span className="pill dark">{copy.counterBadge}</span><h1>{copy.counterTitle}</h1><p className="lead">{copy.counterLead}</p></div>
        <div className="counter-stall"><StallPhoto photo={stall.photo} photoLabel={stall.name} className="counter-stall-photo" /><div><strong>{stall.name}</strong><span><span className="live-dot" /> {stall.waitingCount} {copy.mealsWaiting}</span></div><Link className="counter-switch" to="/counter?pick=1">{copy.counterSwitch}</Link></div>
      </div>
      <div className="scan-panel">
        {cameraOpen ? <CameraCapture copy={copy} onClose={() => setCameraOpen(false)} onPayload={(payload) => { setCameraOpen(false); runCheck(payload) }} /> :
          <button className="scan-stage" type="button" onClick={() => { setCameraOpen(true); setError('') }}>
            <span className="scan-frame"><i /><i /><i /><i /><span className="scan-line" /></span>
            <strong>{copy.scanCard}</strong><small>{copy.counterScanHint}</small>
          </button>}
        <div className="or-rule"><span>{copy.cameraOr}</span></div>
        <form className="backup-form" onSubmit={checkTypedCode}>
          <label>{copy.typeCode}<input value={formatBackupCode(code)} onChange={(event) => setCode(normalizeBackupCode(event.target.value).slice(0, 16))} placeholder="ABCD-2345-EFGH-6789" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>
          <button className="button button-light" type="submit">{copy.checkCard} →</button>
        </form>
        {error && <div className="counter-error">{error}</div>}
      </div>
      {candidate && <div className="valid-card">
        <div className="valid-head"><span className="valid-check">✓</span><div><strong>{copy.valid}</strong><span>{copy.mealFor} {candidate.firstName || copy.someone}</span></div><b>{money(candidate.amountCents)}</b></div>
        <label className={`photo-upload ${photoData ? 'ready' : ''}`}>{photoData ? <img src={photoData} alt="" /> : <span className="photo-upload-icon">📷</span>}<span>{photoData ? copy.photoReady : copy.takePhoto}</span><input type="file" accept="image/*" capture="environment" onChange={(event) => choosePhoto(event.target.files?.[0])} /></label>
        <button className="button button-hot button-wide" type="button" disabled={serving} onClick={serve}>{serving ? copy.loading : `${copy.serveAndPay} →`}</button>
      </div>}
    </div>
  </section>
}

type QrReader = (video: HTMLVideoElement) => Promise<string | undefined>

// Uses the browser's own QR reader where it exists (Chrome on Android) and jsQR everywhere else (Safari on iPhone).
async function makeQrReader(): Promise<QrReader> {
  const Detector = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector
  if (Detector) {
    const detector = new Detector({ formats: ['qr_code'] })
    return async (video) => (await detector.detect(video))[0]?.rawValue
  }
  const { default: jsQR } = await import('jsqr')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('camera_unavailable')
  return async (video) => {
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale)
    if (!canvas.width || !canvas.height) return undefined
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data
  }
}

function CameraCapture({ copy, onClose, onPayload }: { copy: Copy; onClose: () => void; onPayload: (payload: ScannedCard) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const payloadRef = useRef(onPayload)
  payloadRef.current = onPayload
  const [message, setMessage] = useState(copy.cameraPoint)
  useEffect(() => {
    let stream: MediaStream | undefined
    let timer: number | undefined
    let cancelled = false
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) { setMessage(copy.cameraNotReady); return }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        const video = videoRef.current
        if (cancelled || !video) return
        video.srcObject = stream; await video.play()
        const read = await makeQrReader()
        const tick = async () => {
          if (cancelled) return
          const raw = await read(video).catch(() => undefined)
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as ScannedCard & { v?: number }
              if (parsed.v === 2) { payloadRef.current(parsed); return }
            } catch { /* not a Pendiente card */ }
            setMessage(copy.errorWrongCode)
          }
          timer = window.setTimeout(tick, 250)
        }
        void tick()
      } catch { if (!cancelled) setMessage(copy.cameraNotReady) }
    }
    void start()
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()) }
  }, [copy.cameraNotReady, copy.cameraPoint, copy.errorWrongCode])
  return <div className="camera-box"><div className="camera-top"><strong>{copy.scanCard}</strong><button type="button" onClick={onClose} aria-label={copy.closeCamera}>×</button></div><div className="camera-view"><video ref={videoRef} muted playsInline /><span className="scan-frame"><i /><i /><i /><i /><span className="scan-line" /></span></div><p>{message}</p></div>
}

function ProofPage({ copy }: { copy: Copy }) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [stalls, setStalls] = useState<Stall[]>([starterStall])
  const [counts, setCounts] = useState(emptyTotals)
  const [cursor, setCursor] = useState<string | null>(null)
  const load = async (next = '') => { const data = await getProof(next); setMeals((current) => next ? [...current, ...data.items] : data.items); setCounts(data.totals); setCursor(data.nextCursor) }
  useEffect(() => { void load().catch((cause) => console.error('Proof read failed', cause)); getStalls().then(setStalls).catch(() => undefined) }, [])
  const stallName = (id: string) => stalls.find((stall) => stall.id === id)?.name ?? copy.stallFallback
  const photos = meals.filter((meal) => meal.photoUrl || meal.photoData)
  return <section className="page-width proof-page">
    <div className="section-head"><div className="eyebrow"><span className="live-dot" /> {copy.proofPublic} · {copy.livePractice}</div><h1>{copy.proofTitle}</h1><p>{copy.proofLead}</p></div>
    <div className="proof-stats">
      <div><strong><CountUp value={counts.bought} /></strong><span>{copy.totalBought}</span></div>
      <div><strong><CountUp value={counts.served} /></strong><span>{copy.totalServed}</span></div>
      <div><strong><CountUp value={counts.paidCents} format={(n) => money(Math.round(n))} /></strong><span>{copy.statPaid}</span></div>
      <div><strong><CountUp value={counts.returned} /></strong><span>{copy.totalReturned}</span></div>
      <div><strong><CountUp value={counts.waiting} /></strong><span>{copy.statWaiting}</span></div>
    </div>
    {photos.length > 0 && <div className="photo-grid">{photos.map((meal) => <Link to={`/meal/${meal.id}`} key={meal.id}><img src={meal.photoUrl || meal.photoData} alt={copy.plateAlt} loading="lazy" /><span>{stallName(meal.stallId)}</span></Link>)}</div>}
    <div className="proof-list">
      {meals.map((meal) => <Link className="proof-row" to={`/meal/${meal.id}`} key={meal.id}>
        <span className="proof-initial">{(meal.firstNameInitial || meal.firstName || '•').slice(0, 1)}</span>
        <div><strong>{stallName(meal.stallId)}</strong><small>{shortTime(meal.servedAt ?? meal.boughtAt)}</small></div>
        <b>{money(meal.amountCents)}</b>
        <StatusBadge status={meal.status} copy={copy} />
        <span className="proof-open" aria-label={copy.tableOpen}>↗</span>
      </Link>)}
      {meals.length === 0 && <div className="empty-table">{copy.emptyPractice}</div>}
    </div>
    {cursor && <button className="button button-light" onClick={() => void load(cursor)}>{copy.moreMeals}</button>}
  </section>
}

function ChalkboardPage({ copy }: { copy: Copy }) {
  const [stalls, setStalls] = useState<Stall[]>([starterStall])
  useEffect(() => { const load = () => getStalls().then(setStalls).catch(() => undefined); load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer) }, [])
  const count = stalls.reduce((total, stall) => total + stall.waitingCount, 0)
  return <section className="board-page"><div className="chalkboard"><div className="chalk-top"><span>PENDIENTE</span><span>✦</span></div><div className="chalk-copy"><div className="chalk-eyebrow">{copy.navBoard}</div><strong>{count}</strong><h1>{copy.boardTitle}</h1><p>{copy.refresh}</p></div><div className="chalk-foot"><span>{copy.chalkServe}</span><span>●</span></div></div><Link className="text-link centered-link" to="/">← {copy.navHome}</Link></section>
}

function AdminPage({ copy }: { copy: Copy }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState('300')
  const [payout, setPayout] = useState('')
  const [photo, setPhoto] = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaved(false); setError('')
    try {
      await createStall({ name, city, address, priceCents: Number(price), payoutAddress: payout, adminKey, photo: photo || undefined })
      setSaved(true); setName(''); setCity(''); setAddress(''); setPayout(''); setAdminKey(''); setPhoto('')
    } catch { setError(copy.errorGeneric) }
  }
  return <section className="page-width flow-page admin-page"><div className="eyebrow">Pendiente</div><h1 className="flow-title">{copy.adminTitle}</h1><p className="lead">{copy.adminLead}</p><form className="meal-form" onSubmit={submit}><label>{copy.adminName}<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Iya Basira’s Buka" /></label><label>{copy.adminCity}<input required value={city} onChange={(event) => setCity(event.target.value)} placeholder="Lagos, Nigeria" /></label><label>{copy.adminAddress}<input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="12 Market Street, Lagos" /></label><label>{copy.adminPhoto}<input type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) compressPhoto(file, copy).then(setPhoto).catch((cause) => setError(cause instanceof Error ? cause.message : copy.errorGeneric)) }} />{photo && <span className="admin-photo-ready">{copy.photoReady}</span>}</label><label>{copy.adminPrice}<input required min="100" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label>{copy.adminPayout}<input required value={payout} onChange={(event) => setPayout(event.target.value)} placeholder="Stall payment account" /></label><label>{copy.adminKey}<input required type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder={copy.adminKey} /></label><button className="button button-hot button-wide" type="submit">{copy.adminSave} →</button>{saved && <div className="admin-success">✓ {copy.adminSaved}</div>}{error && <div className="counter-error">{error}</div>}</form></section>
}

async function makeCardImage(meal: Meal, stall: Stall, qr: string, code: string, copy: Copy): Promise<string> {
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1400
  const context = canvas.getContext('2d'); if (!context) throw new Error('card_image_unavailable')
  context.fillStyle = '#fffaf0'; context.fillRect(0, 0, 1000, 1400)
  context.fillStyle = '#ff7a2f'; context.fillRect(0, 0, 1000, 18)
  context.fillStyle = '#1a120b'; context.textAlign = 'center'
  context.font = 'bold 56px Arial'; context.fillText('PENDIENTE', 500, 110)
  context.font = '36px Arial'; context.fillText(`${copy.cardFor} ${meal.firstName || copy.someone}`, 500, 195, 880)
  const image = new Image()
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('card_image_unavailable')); image.src = qr })
  context.drawImage(image, 220, 260, 560, 560)
  context.font = 'bold 34px Arial'; context.fillText(formatBackupCode(code), 500, 890)
  context.font = '32px Arial'; context.fillText(copy.showAt, 500, 980); context.fillText(stall.name, 500, 1030, 880)
  context.fillText(stall.address, 500, 1080, 880)
  context.fillText(`${copy.expires}: ${new Date(meal.expiresAt).toLocaleString()}`, 500, 1160, 880)
  context.font = '24px Arial'; context.fillText(copy.cardWarning, 500, 1250, 900)
  context.fillText(`${copy.keepLikeCash} · ${money(meal.amountCents)}`, 500, 1320)
  return canvas.toDataURL('image/png')
}

function Loading({ copy }: { copy: Copy }) { return <section className="page-width loading-page"><div className="loading-plate" style={{ backgroundImage: `url(${foodPhoto('jollof2', true)})` }} /><span>{copy.loading}</span></section> }

function EmptyState({ copy, title, children }: { copy: Copy; title: string; children?: ReactNode }) {
  return <section className="page-width empty-page"><div className="empty-photo" style={{ backgroundImage: `url(${foodPhoto('dodo', true)})` }} /><h1>{title}</h1>{children}<Link className="button button-hot" to="/">{copy.navHome}</Link></section>
}

function errorFor(error: unknown, copy: Copy) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('wrong_stall')) return copy.errorWrongStall
  if (message.includes('already_used')) return copy.errorAlready
  if (message.includes('expired')) return copy.errorExpired
  if (message.includes('not_found')) return copy.errorNotFound
  if (message.includes('wrong_code')) return copy.errorWrongCode
  return copy.errorGeneric
}

async function compressPhoto(file: File, copy: Copy): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(copy.photoTypeError)
  if (file.size >= 20 * 1024 * 1024) throw new Error(copy.photoSizeError)
  const image = new Image()
  const source = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(copy.photoReadError)) ; image.src = source })
    const max = 1280
    const scale = Math.min(1, max / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
    const context = canvas.getContext('2d'); if (!context) throw new Error(copy.photoPrepareError)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    let quality = 0.78
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    while (blob && blob.size > 300 * 1024 && quality > 0.35) { quality -= 0.08; blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality)) }
    if (!blob || blob.size > 300 * 1024) throw new Error(copy.photoStillLarge)
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(copy.photoPrepareError)); reader.readAsDataURL(blob) })
  } finally { URL.revokeObjectURL(source) }
}

export default function RootApp() {
  return <BrowserRouter><WalletProvider><App /></WalletProvider></BrowserRouter>
}
