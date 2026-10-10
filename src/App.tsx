import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { CardPreview } from './components/CardPreview'
import { Layout } from './components/Layout'
import { PlateArt } from './components/PlateArt'
import { StallPhoto } from './components/StallPhoto'
import { StatusBadge } from './components/StatusBadge'
import { backupCodeFromSecret, randomSecret, sha256 } from './lib/crypto'
import { copy as translations, type Copy } from './lib/i18n'
import { checkMealCard, createMeal, createStall, getMeal, getProof, getStalls, serveMeal, starterStall } from './lib/api'
import type { CardSecret, Language, Meal, Stall } from './lib/types'
import { BrowserRouter } from 'react-router-dom'

const cardStorageKey = 'pendiente.cards.v1'

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

function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('pendiente.language') as Language) || 'en')
  const t = translations[language]
  const toggleLanguage = () => setLanguage((current) => {
    const next = current === 'en' ? 'es' : 'en'
    localStorage.setItem('pendiente.language', next)
    return next
  })

  return (
    <Layout copy={t} language={language} toggleLanguage={toggleLanguage}>
      <Routes>
        <Route path="/" element={<HomePage copy={t} />} />
        <Route path="/stall/:stallId" element={<StallPage copy={t} />} />
        <Route path="/pay/:stallId" element={<PaymentPage copy={t} />} />
        <Route path="/meal/:mealId/card" element={<MealCardPage copy={t} />} />
        <Route path="/meal/:mealId" element={<MealPage copy={t} />} />
        <Route path="/counter/:stallId" element={<CounterPage copy={t} />} />
        <Route path="/proof" element={<ProofPage copy={t} />} />
        <Route path="/chalkboard" element={<ChalkboardPage copy={t} />} />
        <Route path="/admin" element={<AdminPage copy={t} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function HomePage({ copy }: { copy: Copy }) {
  const [stalls, setStalls] = useState<Stall[]>([starterStall])
  useEffect(() => { getStalls().then(setStalls) }, [])
  return (
    <>
      <section className="hero page-width">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> {copy.homeEyebrow}</div>
          <h1>{copy.homeTitle}</h1>
          <p className="hero-lead">{copy.homeLead}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#stalls">{copy.browseStalls} <span aria-hidden="true">↓</span></a>
            <Link className="text-link" to="/proof">{copy.navProof} <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="hero-note"><span className="note-check">✓</span> {copy.noOnePaid}</div>
        </div>
        <div className="hero-art" aria-label="A meal card beside a plate">
          <div className="sun-disc" />
          <div className="hero-card-stack">
            <div className="mini-card mini-card-back" />
            <div className="mini-card mini-card-front">
              <span>PENDIENTE</span><strong>{copy.cardFor} Mama Bisi</strong><small>{copy.showAt}</small><b>✦</b>
            </div>
          </div>
          <PlateArt />
          <span className="hero-sticker">served<br /><strong>with care</strong></span>
        </div>
      </section>

      <section className="story-strip">
        <div className="page-width story-grid">
          <div className="story-quote">{copy.storyQuote}</div>
          <div><h2>{copy.storyTitle}</h2><p>{copy.storyBody}</p></div>
        </div>
      </section>

      <section className="page-width section" id="stalls">
        <div className="section-heading"><div><div className="eyebrow">01 / {copy.browseStalls}</div><h2>{copy.browseStalls}</h2></div><Link className="text-link" to="/chalkboard">{copy.navBoard} ↗</Link></div>
        <div className="stall-grid">
          {stalls.map((stall) => <StallTile key={stall.id} stall={stall} copy={copy} />)}
        </div>
      </section>

      <section className="page-width section steps-section">
        <div className="section-heading"><div><div className="eyebrow">02 / {copy.howTitle}</div><h2>{copy.howTitle}</h2></div></div>
        <div className="steps-grid">
          {[
            [copy.stepBuy, copy.stepBuyBody, '01'],
            [copy.stepCard, copy.stepCardBody, '02'],
            [copy.stepScan, copy.stepScanBody, '03'],
            [copy.stepPaid, copy.stepPaidBody, '04'],
          ].map(([title, body, number]) => <div className="step" key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></div>)}
        </div>
      </section>

      <section className="why-section">
        <div className="page-width why-grid">
          <div><div className="eyebrow">03 / {copy.stellarTitle}</div><h2>{copy.stellarTitle}</h2></div>
          <div className="why-points"><div><strong>01</strong><span>{copy.stellarFee}</span></div><div><strong>02</strong><span>{copy.stellarTime}</span></div><div><strong>03</strong><span>{copy.stellarCheck}</span></div></div>
        </div>
      </section>
    </>
  )
}

function StallTile({ stall, copy }: { stall: Stall; copy: Copy }) {
  return <Link className="stall-tile" to={`/stall/${stall.id}`}>
    <StallPhoto photo={stall.photo} />
    <div className="stall-tile-body"><div className="stall-tile-top"><h3>{stall.name}</h3><span className="arrow-circle" aria-hidden="true">↗</span></div><p>{stall.city} · {money(stall.priceCents)} {copy.perMeal}</p><div className="waiting-count"><span className="waiting-dot" /> {stall.waitingCount} {copy.mealsWaiting}</div></div>
  </Link>
}

function StallPage({ copy }: { copy: Copy }) {
  const { stallId } = useParams()
  const navigate = useNavigate()
  const [stall, setStall] = useState<Stall | null>(null)
  const [firstName, setFirstName] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  useEffect(() => { getStalls().then((items) => setStall(items.find((item) => item.id === stallId) ?? starterStall)) }, [stallId])
  if (!stall) return <Loading copy={copy} />
  return <section className="page-width form-page">
    <Link className="back-link" to="/">← {copy.stallBack}</Link>
    <div className="detail-hero"><StallPhoto photo={stall.photo} className="detail-photo" /><div><div className="eyebrow">{stall.city}</div><h1>{stall.name}</h1><p className="detail-address">{stall.address}</p><div className="price-lockup"><strong>{money(stall.priceCents)}</strong><span>{copy.perMeal}</span></div></div></div>
    <form className="meal-form" onSubmit={(event) => { event.preventDefault(); navigate(`/pay/${stall.id}`, { state: { firstName, message, email } }) }}>
      <label>{copy.forLabel}<span className="optional">{copy.forHint}</span><input value={firstName} onChange={(event) => setFirstName(event.target.value.slice(0, 40))} placeholder="Mama Bisi" /></label>
      <label>{copy.messageLabel}<span className="optional">{message.length}/80</span><textarea value={message} maxLength={80} onChange={(event) => setMessage(event.target.value)} placeholder={copy.messageHint} rows={3} /></label>
      <label>{copy.emailLabel}<span className="optional">{copy.emailHint}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <button className="button button-primary button-wide" type="submit">{copy.continuePay} <span aria-hidden="true">→</span></button>
    </form>
  </section>
}

function PaymentPage({ copy }: { copy: Copy }) {
  const { stallId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const form = (location.state as { firstName?: string; message?: string; email?: string } | null) ?? {}
  const [stall, setStall] = useState<Stall>(starterStall)
  const [connected, setConnected] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { getStalls().then((items) => setStall(items.find((item) => item.id === stallId) ?? starterStall)) }, [stallId])
  const approve = async () => {
    setApproving(true); setError('')
    try {
      const secret = randomSecret()
      const backupCode = backupCodeFromSecret(secret)
      const meal = await createMeal({ stallId: stall.id, firstName: form.firstName, message: form.message, email: form.email, secretFingerprint: await sha256(secret), backupFingerprint: await sha256(backupCode), practice: true })
      saveCard({ mealId: meal.id, stallId: meal.stallId, secret, backupCode })
      navigate(`/meal/${meal.id}/card`, { replace: true })
    } catch {
      setError(copy.errorGeneric)
      setApproving(false)
    }
  }
  return <section className="page-width payment-page">
    <Link className="back-link" to={`/stall/${stall.id}`}>← {copy.stallBack}</Link>
    <div className="payment-layout"><div><div className="eyebrow">{copy.paymentLabel}</div><h1>{copy.paymentTitle}</h1><p className="hero-lead">{form.firstName ? `${copy.paymentFor} ${form.firstName} ${copy.paymentAt.toLowerCase()} ${stall.name}.` : `${copy.paymentAt} ${stall.name}.`}</p><div className="payment-note"><strong>{money(stall.priceCents)} {copy.paymentAt.toLowerCase()} {stall.name}.</strong><span>{copy.returnLine}</span></div></div><div className="payment-box"><div className="payment-row"><span>{copy.paymentMeal}</span><strong>{money(stall.priceCents)}</strong></div><div className="payment-row"><span>{copy.paymentStall}</span><strong>{stall.name}</strong></div><div className="payment-rule" />{!connected ? <button className="button button-dark button-wide" type="button" onClick={() => setConnected(true)}>{copy.connect} <span aria-hidden="true">→</span></button> : <button className="button button-primary button-wide" type="button" disabled={approving} onClick={approve}>{approving ? copy.approving : copy.approve} {!approving && <span aria-hidden="true">→</span>}</button>}{error && <p className="form-error">{error}</p>}<small className="payment-safe">{copy.paymentSafe}</small></div></div>
  </section>
}

function MealCardPage({ copy }: { copy: Copy }) {
  const { mealId } = useParams()
  const [meal, setMeal] = useState<Meal | null>(null)
  const [stall, setStall] = useState<Stall>(starterStall)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const card = mealId ? cardFor(mealId) : undefined
  useEffect(() => { if (!mealId) return; getMeal(mealId).then((item) => { if (item) setMeal(item); return getStalls() }).then((items) => { if (items) setStall(items.find((item) => item.id === meal?.stallId) ?? starterStall) }) }, [mealId, meal?.stallId])
  useEffect(() => { if (!meal || !card) return; QRCode.toDataURL(JSON.stringify({ v: 1, mealId: meal.id, stallId: meal.stallId, secret: card.secret }), { width: 360, margin: 1, color: { dark: '#10251f', light: '#fffdf5' } }).then(setQrDataUrl) }, [meal, card])
  if (!meal || !card) return <section className="page-width empty-page"><h1>{copy.errorNotFound}</h1><Link className="button button-primary" to="/">{copy.navHome}</Link></section>
  const shareText = `A meal is waiting at ${stall.name}. ${window.location.origin}/meal/${meal.id}`
  return <section className="page-width card-page"><div className="eyebrow">{copy.paymentComplete}</div><h1>{copy.cardTitle}</h1><p className="hero-lead">{copy.cardLead}</p><div className="card-wrap"><CardPreview meal={meal} stall={stall} qrDataUrl={qrDataUrl} backupCode={card.backupCode} copy={copy} /></div><p className="card-warning"><span>◎</span> {copy.cardWarning}</p><div className="card-actions"><a className="button button-primary" href={qrDataUrl} download={`pendiente-${meal.id}.png`}>{copy.download} ↓</a><button className="button button-light" type="button" onClick={() => window.print()}>{copy.print}</button><a className="button button-light" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">{copy.share}</a></div><Link className="text-link centered-link" to={`/meal/${meal.id}`}>{copy.openMealPage} ↗</Link></section>
}

function MealPage({ copy }: { copy: Copy }) {
  const { mealId } = useParams()
  const [meal, setMeal] = useState<Meal | null>(null)
  const [stall, setStall] = useState<Stall>(starterStall)
  useEffect(() => { if (!mealId) return; const load = () => getMeal(mealId).then(setMeal); load(); const timer = window.setInterval(load, 5000); return () => window.clearInterval(timer) }, [mealId])
  useEffect(() => { if (meal) getStalls().then((items) => setStall(items.find((item) => item.id === meal.stallId) ?? starterStall)) }, [meal])
  if (!meal) return <Loading copy={copy} />
  return <section className="page-width meal-page"><div className="public-head"><div><div className="eyebrow">Pendiente / {stall.city}</div><h1>{meal.firstName ? `${copy.paymentFor} ${meal.firstName}.` : `${copy.cardWaiting}.`}</h1></div><StatusBadge status={meal.status} copy={copy} /></div><div className="meal-status-card"><div className="status-timeline"><div className="timeline-item done"><span>01</span><div><strong>{copy.mealBought}</strong><small>{shortDate(meal.boughtAt)}</small></div></div><div className={`timeline-line ${meal.status !== 'Waiting' ? 'done' : ''}`} /><div className={`timeline-item ${meal.status !== 'Waiting' ? 'done' : 'current'}`}><span>02</span><div><strong>{meal.status === 'Returned' ? copy.moneyReturned : copy.served}</strong><small>{meal.status === 'Waiting' ? `${copy.expiresPrefix} ${shortDate(meal.expiresAt)}` : shortDate(meal.servedAt)}</small></div></div></div><div className="meal-photo">{meal.photoData ? <img src={meal.photoData} alt="Plate served at the stall" /> : <><PlateArt /><span>{meal.status === 'Waiting' ? copy.plateWaiting : copy.noPhoto}</span></>}</div></div><div className="meal-meta"><div><small>{copy.stallLabel}</small><strong>{stall.name}</strong><span>{stall.address}</span></div><div><small>{copy.amountLabel}</small><strong>{money(meal.amountCents)}</strong><span>{copy.stellarTime}</span></div><div><small>{copy.seeStellar}</small><a href={meal.paymentLink ?? '#'} target="_blank" rel="noreferrer">{copy.seeStellar} ↗</a><span>{copy.publicPaymentRecord}</span></div></div><div className="meal-share"><span>{copy.shareMealPage}</span><button type="button" className="text-link" onClick={() => navigator.share?.({ title: 'Pendiente meal', url: window.location.href })}>{copy.share} ↗</button></div></section>
}

type ScannedCard = { mealId?: string; stallId?: string; secret?: string }

function CounterPage({ copy }: { copy: Copy }) {
  const { stallId } = useParams()
  const [stall, setStall] = useState<Stall>(starterStall)
  const [code, setCode] = useState('')
  const [scanned, setScanned] = useState<ScannedCard>({})
  const [candidate, setCandidate] = useState<Meal | null>(null)
  const [photoData, setPhotoData] = useState<string | undefined>()
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState('')
  const [paidMeal, setPaidMeal] = useState<Meal | null>(null)
  useEffect(() => { getStalls().then((items) => setStall(items.find((item) => item.id === stallId) ?? starterStall)) }, [stallId])
  const runCheck = async (payload: ScannedCard) => {
    setError(''); setCandidate(null); setScanned(payload)
    try {
      const meal = await checkMealCard({ stallId: stall.id, mealId: payload.mealId, secret: payload.secret, backupCode: payload.secret ? undefined : code.trim().toUpperCase() })
      setCandidate(meal)
    } catch (cause) { setError(errorFor(cause, copy)) }
  }
  const checkTypedCode = (event: FormEvent) => { event.preventDefault(); if (code.trim().length < 8) { setError(copy.errorWrongCode); return } runCheck({}) }
  const serve = async () => {
    if (!candidate) return
    setError('')
    try {
      const served = await serveMeal(candidate.id, { stallId: stall.id, secret: scanned.secret, backupCode: scanned.secret ? undefined : code.trim().toUpperCase(), photoData })
      setPaidMeal(served); setCandidate(null)
    } catch (cause) { setError(errorFor(cause, copy)) }
  }
  const choosePhoto = async (file?: File) => { if (!file) return; try { setPhotoData(await compressPhoto(file)) } catch (cause) { setError(cause instanceof Error ? cause.message : copy.errorGeneric) } }
  if (paidMeal) return <section className="page-width counter-page success-page"><div className="success-mark">✓</div><div className="eyebrow">{stall.name}</div><h1>{copy.paid} {money(paidMeal.amountCents)}</h1><p className="hero-lead">{paidMeal.firstName ? `Meal for ${paidMeal.firstName}.` : 'The meal was served.'} The buyer can now see the plate.</p>{paidMeal.photoData && <img className="success-photo" src={paidMeal.photoData} alt="Plate served" />}<Link className="button button-primary button-wide" to={`/counter/${stall.id}`} onClick={() => { setPaidMeal(null); setCode(''); setScanned({}); setPhotoData(undefined) }}>{copy.scanAgain}</Link><Link className="text-link centered-link" to={`/meal/${paidMeal.id}`}>{copy.openMealPage} ↗</Link></section>
  return <section className="page-width counter-page"><div className="counter-heading"><div><div className="eyebrow">{stall.name}</div><h1>{copy.counterTitle}</h1><p className="hero-lead">{copy.counterLead}</p></div><div className="counter-pill"><span className="waiting-dot" /> {stall.waitingCount} {copy.mealsWaiting}</div></div><div className="scan-panel"><button className="scan-button" type="button" onClick={() => { setCameraOpen(true); setError('') }}><span className="scan-icon">⌁</span><strong>{copy.scanCard}</strong><small>{copy.cameraUse}</small></button>{cameraOpen && <CameraCapture copy={copy} onClose={() => setCameraOpen(false)} onPayload={(payload) => { setCameraOpen(false); runCheck(payload) }} />}<div className="or-rule"><span>{copy.cameraOr}</span></div><form className="backup-form" onSubmit={checkTypedCode}><label>{copy.typeCode}<input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase())} placeholder="AB12CD34" inputMode="text" autoCapitalize="characters" /></label><button className="button button-dark button-wide" type="submit">{copy.checkCard} →</button></form><p className="camera-note">{copy.cameraNote}</p>{error && <div className="counter-error">{error}</div>}</div>{candidate && <div className="valid-card"><div className="valid-head"><span className="valid-check">✓</span><div><strong>{copy.valid}</strong><span>{copy.mealFor} {candidate.firstName || copy.someone}</span></div><StatusBadge status={candidate.status} copy={copy} /></div><div className="valid-details"><span>{stall.name}</span><strong>{money(candidate.amountCents)}</strong></div><label className="photo-upload">{copy.takePhoto}<input type="file" accept="image/*" capture="environment" onChange={(event) => choosePhoto(event.target.files?.[0])} /><span>{photoData ? copy.photoReady : copy.choosePhoto}</span></label><button className="button button-primary button-wide" type="button" onClick={serve}>{copy.serveAndPay} →</button></div>}</section>
}

function CameraCapture({ copy, onClose, onPayload }: { copy: Copy; onClose: () => void; onPayload: (payload: ScannedCard) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [message, setMessage] = useState('Point the camera at the meal card.')
  useEffect(() => {
    let stream: MediaStream | undefined
    let timer: number | undefined
    let cancelled = false
    const start = async () => {
      try {
        const detector = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector
        if (!detector) { setMessage(copy.cameraNote); return }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream; await videoRef.current.play()
        const scanner = new detector({ formats: ['qr_code'] })
        const tick = async () => { if (cancelled || !videoRef.current) return; try { const results = await scanner.detect(videoRef.current); const raw = results[0]?.rawValue; if (raw) { const parsed = JSON.parse(raw) as ScannedCard & { v?: number }; onPayload(parsed) } } catch { /* keep looking */ } timer = window.setTimeout(tick, 350) }
        tick()
      } catch { setMessage('Camera is not ready. Type the 8-character code below.') }
    }
    start()
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()) }
  }, [copy.cameraNote, onPayload])
  return <div className="camera-box"><div className="camera-top"><strong>{copy.scanCard}</strong><button type="button" onClick={onClose} aria-label="Close camera">×</button></div><video ref={videoRef} muted playsInline /><p>{message}</p></div>
}

function ProofPage({ copy }: { copy: Copy }) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [stalls, setStalls] = useState<Stall[]>([starterStall])
  useEffect(() => { getProof().then(setMeals); getStalls().then(setStalls) }, [])
  const counts = useMemo(() => ({ bought: meals.length, served: meals.filter((meal) => meal.status === 'Served').length, returned: meals.filter((meal) => meal.status === 'Returned').length }), [meals])
  const stallName = (id: string) => stalls.find((stall) => stall.id === id)?.name ?? 'Pendiente stall'
  return <section className="page-width proof-page"><div className="proof-head"><div><div className="eyebrow">{copy.proofPublic}</div><h1>{copy.proofTitle}</h1><p className="hero-lead">{copy.proofLead}</p></div><div className="proof-live"><span className="live-dot" /> {copy.livePractice}</div></div><div className="proof-stats"><div><strong>{counts.bought}</strong><span>{copy.totalBought}</span></div><div><strong>{counts.served}</strong><span>{copy.totalServed}</span></div><div><strong>{counts.returned}</strong><span>{copy.totalReturned}</span></div></div>{meals.length > 0 && <div className="photo-grid">{meals.filter((meal) => meal.photoData).map((meal) => <div key={meal.id}><img src={meal.photoData} alt="Plate served" /><span>{stallName(meal.stallId)}</span></div>)}</div>}<div className="proof-table-wrap"><table><thead><tr><th>{copy.tableStall}</th><th>{copy.tableAmount}</th><th>{copy.status}</th><th>{copy.time}</th><th aria-label={copy.tableOpen} /></tr></thead><tbody>{meals.map((meal) => <tr key={meal.id}><td>{stallName(meal.stallId)}</td><td>{money(meal.amountCents)}</td><td><StatusBadge status={meal.status} copy={copy} /></td><td>{shortDate(meal.servedAt ?? meal.boughtAt)}</td><td><Link className="table-link" to={`/meal/${meal.id}`}>{copy.tableOpen} ↗</Link></td></tr>)}</tbody></table>{meals.length === 0 && <div className="empty-table">{copy.emptyPractice}</div>}</div></section>
}

function ChalkboardPage({ copy }: { copy: Copy }) {
  const [stalls, setStalls] = useState<Stall[]>([starterStall])
  useEffect(() => { const load = () => getStalls().then(setStalls); load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer) }, [])
  const count = stalls.reduce((total, stall) => total + stall.waitingCount, 0)
  return <section className="board-page"><div className="chalkboard"><div className="chalk-top"><span>PENDIENTE</span><span>✦</span></div><div className="chalk-copy"><div className="chalk-eyebrow">{copy.navBoard}</div><strong>{count}</strong><h1>{copy.boardTitle}</h1><p>{copy.refresh}</p></div><div className="chalk-foot"><span>{copy.chalkServe}</span><span>●</span></div></div><Link className="text-link centered-link" to="/">← {copy.navHome}</Link></section>
}

function AdminPage({ copy }: { copy: Copy }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState('300')
  const [payout, setPayout] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaved(false); setError('')
    try {
      await createStall({ name, city, address, priceCents: Number(price), payoutAddress: payout })
      setSaved(true); setName(''); setCity(''); setAddress(''); setPayout('')
    } catch { setError(copy.errorGeneric) }
  }
  return <section className="page-width admin-page"><div className="eyebrow">Pendiente</div><h1>{copy.adminTitle}</h1><p className="hero-lead">{copy.adminLead}</p><form className="admin-form" onSubmit={submit}><label>{copy.adminName}<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Iya Basira’s Buka" /></label><label>{copy.adminCity}<input required value={city} onChange={(event) => setCity(event.target.value)} placeholder="Lagos, Nigeria" /></label><label>{copy.adminAddress}<input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="12 Market Street, Lagos" /></label><label>{copy.adminPrice}<input required min="100" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label>{copy.adminPayout}<input required value={payout} onChange={(event) => setPayout(event.target.value)} placeholder="Stall payment account" /></label><button className="button button-primary button-wide" type="submit">{copy.adminSave} →</button>{saved && <div className="admin-success">✓ {copy.adminSaved}</div>}{error && <div className="counter-error">{error}</div>}</form></section>
}

function Loading({ copy }: { copy: Copy }) { return <section className="page-width loading-page"><div className="loading-spinner" /><span>{copy.loading}</span></section> }

function errorFor(error: unknown, copy: Copy) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('wrong_stall')) return copy.errorWrongStall
  if (message.includes('already_used')) return copy.errorAlready
  if (message.includes('expired')) return copy.errorExpired
  if (message.includes('not_found')) return copy.errorNotFound
  if (message.includes('wrong_code')) return copy.errorWrongCode
  return copy.errorGeneric
}

async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo of the plate.')
  if (file.size > 20 * 1024 * 1024) throw new Error('That photo is too large. Choose one under 20 MB.')
  const image = new Image()
  const source = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('We could not read that photo.')) ; image.src = source })
    const max = 1280
    const scale = Math.min(1, max / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
    const context = canvas.getContext('2d'); if (!context) throw new Error('We could not prepare that photo.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    let quality = 0.78
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    while (blob && blob.size > 300 * 1024 && quality > 0.35) { quality -= 0.08; blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality)) }
    if (!blob || blob.size > 300 * 1024) throw new Error('That photo is still too large. Choose a smaller plate photo.')
    return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('We could not prepare that photo.')); reader.readAsDataURL(blob) })
  } finally { URL.revokeObjectURL(source) }
}

export default function RootApp() {
  return <BrowserRouter><App /></BrowserRouter>
}
