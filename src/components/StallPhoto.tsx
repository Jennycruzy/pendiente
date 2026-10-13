export function StallPhoto({ photo, className = '', photoLabel = 'Pendiente stall', fallbackLabel }: { photo: string; className?: string; photoLabel?: string; fallbackLabel: string }) {
  const uploadedPhoto = photo.startsWith('data:image/')
  return <div className={`stall-photo ${className}`}>
    <img className="stall-photo-image" src={uploadedPhoto ? photo : '/images/food/jollof.jpg'} alt={uploadedPhoto ? photoLabel : 'Jollof rice'} loading="lazy" />
    <span className="photo-label">{uploadedPhoto ? photoLabel : fallbackLabel}</span>
  </div>
}
