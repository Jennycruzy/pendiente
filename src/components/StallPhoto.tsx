import { foodPhoto } from '../lib/food'

export function StallPhoto({ photo, className = '', photoLabel = 'Pendiente stall' }: { photo: string; className?: string; photoLabel?: string }) {
  const uploadedPhoto = photo.startsWith('data:image/') || photo.startsWith('/photos/')
  return <div className={`stall-photo ${className}`}>
    <img className="stall-photo-image" src={uploadedPhoto ? photo : foodPhoto('canteen')} alt={`${photoLabel} plate`} loading="lazy" />
  </div>
}
