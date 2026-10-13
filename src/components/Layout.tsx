import { Link, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Copy } from '../lib/i18n'
import type { Language } from '../lib/types'
import { practiceMode } from '../lib/wallet'
import { dollars, shortAddress, useWallet } from '../lib/walletContext'

interface LayoutProps {
  children: ReactNode
  copy: Copy
  language: Language
  toggleLanguage: () => void
}

export const counterPath = '/counter/iya-basiras-buka'

export function Layout({ children, copy, language, toggleLanguage }: LayoutProps) {
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => { const onScroll = () => setScrolled(window.scrollY > 24); onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll) }, [])
  useEffect(() => {
    if (!location.hash) { window.scrollTo({ top: 0 }); return }
    const timer = window.setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.hash])
  const overHero = location.pathname === '/' && !scrolled

  return (
    <div className="app-shell">
      <div className="ribbon">
        <span className="live-dot" aria-hidden="true" />
        <span>{practiceMode ? copy.localPractice : copy.ribbonLive}</span>
        <a href={practiceMode ? '/?practice=0' : '/?practice=1'}>{practiceMode ? copy.ribbonUseWallet : copy.ribbonTryPractice} →</a>
      </div>
      <header className={`topbar ${overHero ? 'over-hero' : ''} ${scrolled ? 'scrolled' : ''}`}>
        <div className="topbar-inner">
          <Link className="brand" to="/" aria-label="Pendiente">
            <span className="brand-mark" aria-hidden="true"><span>P</span></span>
            <span>Pendiente</span>
          </Link>
          <nav className="topnav" aria-label={copy.mainNavigation}>
            <Link to="/#give">{copy.navGive}</Link>
            <Link to="/#how">{copy.navHow}</Link>
            <NavLink to="/meals">{copy.navMyMeals}</NavLink>
            <NavLink to="/proof">{copy.navProof}</NavLink>
          </nav>
          <div className="top-actions">
            <button className="language-toggle" onClick={toggleLanguage} type="button" aria-label={`${copy.switchTo} ${copy.language}`}>{language === 'en' ? 'ES' : 'EN'}</button>
            <Link className="scan-pill" to={counterPath}><ScanGlyph /> <span>{copy.scanNav}</span></Link>
            <WalletButton copy={copy} />
          </div>
        </div>
      </header>
      <main key={location.pathname} className="page-enter">{children}</main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand"><span className="brand-mark small" aria-hidden="true"><span>P</span></span> Pendiente<p>{copy.footerLine}</p></div>
          <div className="footer-links">
            <Link to="/#give">{copy.navGive}</Link><Link to="/meals">{copy.navMyMeals}</Link><Link to={counterPath}>{copy.stallsCta}</Link><Link to="/proof">{copy.navProof}</Link><Link to="/chalkboard">{copy.navBoard}</Link>
          </div>
        </div>
      </footer>
      <nav className="tabbar" aria-label={copy.mainNavigation}>
        <NavLink to="/" end><TabIcon d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /><span>{copy.navHome}</span></NavLink>
        <NavLink to="/meals"><TabIcon d="M4 6h16v12H4zM4 10h16M8 15h3" /><span>{copy.navMyMeals}</span></NavLink>
        <NavLink to={counterPath} className="tab-scan"><span className="tab-scan-disc"><ScanGlyph /></span><span>{copy.scanNav}</span></NavLink>
        <NavLink to="/proof"><TabIcon d="M5 13l4 4L19 7" /><span>{copy.navProof}</span></NavLink>
        <Link to="/#give"><TabIcon d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" /><span>{copy.navGive}</span></Link>
      </nav>
    </div>
  )
}

function WalletButton({ copy }: { copy: Copy }) {
  const { address, balance, connecting, connect, disconnect } = useWallet()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!open) return; const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false) }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close) }, [open])
  if (practiceMode) return <span className="wallet-pill practice" title={copy.walletPracticeHint}><span className="wallet-dot" /> {copy.walletPractice}</span>
  if (!address) return <button className="wallet-pill" type="button" disabled={connecting} onClick={() => connect().catch(() => undefined)}><WalletGlyph /> <span>{connecting ? copy.loading : copy.walletConnect}</span></button>
  return <div className="wallet-menu" ref={box}>
    <button className="wallet-pill connected" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="wallet-avatar" style={{ background: `hsl(${parseInt(address.slice(2, 6), 36) % 360} 70% 55%)` }} /> <span>{shortAddress(address)}</span><strong>{dollars(balance)}</strong></button>
    {open && <div className="wallet-pop" role="menu">
      <small>{copy.walletTestnet}</small>
      <code>{address.slice(0, 14)}…{address.slice(-10)}</code>
      <div className="wallet-pop-balance"><span>{copy.buyerBalance}</span><strong>{dollars(balance)}</strong></div>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(address); setCopied(true); window.setTimeout(() => setCopied(false), 1400) }}>{copied ? copy.walletCopied : copy.walletCopy}</button>
      <Link to="/meals" onClick={() => setOpen(false)}>{copy.navMyMeals}</Link>
      <button type="button" className="danger" onClick={() => { disconnect(); setOpen(false) }}>{copy.walletDisconnect}</button>
    </div>}
  </div>
}

export function ScanGlyph() {
  return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" /></svg>
}

function WalletGlyph() {
  return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h11v4M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14.5h.01" /></svg>
}

function TabIcon({ d }: { d: string }) {
  return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
}
