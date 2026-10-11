import { PlateArt } from './PlateArt'

export function StallPhoto({ photo, className = '', photoLabel = 'Pendiente stall' }: { photo: string; className?: string; photoLabel?: string }) {
  const uploadedPhoto = photo.startsWith('data:image/')
  return <div className={`stall-photo ${className}`}>
    {uploadedPhoto ? <img className="stall-photo-image" src={photo} alt={`${photoLabel} plate`} /> : <PlateArt compact />}
    <span className="photo-label">{photoLabel}</span>
  </div>
}
