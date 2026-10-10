import { PlateArt } from './PlateArt'

export function StallPhoto({ photo, className = '' }: { photo: string; className?: string }) {
  return <div className={`stall-photo ${className}`}><PlateArt compact={photo === 'plate'} /><span className="photo-label">Iya Basira’s Buka</span></div>
}
