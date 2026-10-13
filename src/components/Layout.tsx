import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Copy } from '../lib/i18n'
import type { Language } from '../lib/types'
import { practiceMode } from '../lib/wallet'

interface LayoutProps {
  children: ReactNode
  copy: Copy
  language: Language
  toggleLanguage: () => void
}

export function Layout({ children, copy, language, toggleLanguage }: LayoutProps) {
  const location = useLocation()
  const links = [
    { href: '/', label: copy.navHome },
    { href: '/proof', label: copy.navProof },
    { href: '/counter/iya-basiras-buka', label: copy.scanCard },
  ]

  return (
    <div className="app-shell">
      <div className="practice-banner">
        <span className="practice-dot" aria-hidden="true" />
        {practiceMode ? copy.localPractice : copy.practice}
      </div>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Pendiente">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Pendiente</span>
        </Link>
        <nav className="topnav" aria-label={copy.mainNavigation}>
          {links.map((link) => (
            <Link key={link.href} className={location.pathname === link.href ? 'active' : ''} to={link.href}>
              {link.label}
            </Link>
          ))}
          <Link className="nav-buy" to="/stall/iya-basiras-buka">{copy.buyMeal} <span aria-hidden="true">↗</span></Link>
        </nav>
        <button className="language-toggle" onClick={toggleLanguage} type="button" aria-label={`${copy.switchTo} ${copy.language}`}>
          {language === 'en' ? 'ES' : 'EN'}
        </button>
      </header>
      <main>{children}</main>
      <footer className="footer">
        <div><span className="brand-mark small" aria-hidden="true">P</span> Pendiente</div>
        <span>{copy.footerLine}</span>
      </footer>
    </div>
  )
}
