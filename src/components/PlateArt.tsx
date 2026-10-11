export function PlateArt({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`plate-art ${compact ? 'compact' : ''}`} aria-hidden="true">
      <div className="plate-shadow" />
      <div className="plate">
        <div className="rice rice-one" />
        <div className="rice rice-two" />
        <div className="stew" />
        <div className="greens greens-one" />
        <div className="greens greens-two" />
        <div className="garnish garnish-one" />
        <div className="garnish garnish-two" />
      </div>
    </div>
  )
}
