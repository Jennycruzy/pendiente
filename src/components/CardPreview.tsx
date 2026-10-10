import type { Copy } from '../lib/i18n'
import type { Meal, Stall } from '../lib/types'

interface CardPreviewProps {
  meal: Meal
  stall: Stall
  qrDataUrl?: string
  backupCode: string
  copy: Copy
}

export function CardPreview({ meal, stall, qrDataUrl, backupCode, copy }: CardPreviewProps) {
  const expiry = new Date(meal.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div className="meal-card" id="meal-card">
      <div className="meal-card-top">
        <span className="card-kicker">PENDIENTE</span>
        <span className="card-pin" aria-hidden="true">✦</span>
      </div>
      <div className="card-wave" aria-hidden="true" />
      <div className="card-greeting">{copy.cardWaiting}{meal.firstName ? ` ${copy.cardFor.toLowerCase()} ${meal.firstName}` : ''}.</div>
      <div className="card-main">
        <div className="qr-frame">
          {qrDataUrl ? <img src={qrDataUrl} alt={copy.cardQrAlt} /> : <div className="qr-loading">{copy.qrLoading}</div>}
        </div>
        <div className="card-details">
          <div className="card-detail-label">{copy.showAt}</div>
          <strong>{stall.name}</strong>
          <span>{stall.address}</span>
          {meal.firstName && <span className="for-name">{copy.cardFor} {meal.firstName}</span>}
        </div>
      </div>
      <div className="card-footer-grid">
        <div><small>{copy.backup}</small><strong className="backup-code">{backupCode}</strong></div>
        <div><small>{copy.expires}</small><strong>{expiry}</strong></div>
        <div><small>{copy.keepLikeCash}</small><strong>$3.00</strong></div>
      </div>
    </div>
  )
}
