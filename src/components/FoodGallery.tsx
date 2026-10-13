import { useState } from 'react'
import type { Copy } from '../lib/i18n'

export const foodPhotos = [
  { id: 'jollof', name: 'Jollof rice', author: "Ei'eke", source: 'A_Nigeria_Jollof_Rice_with_chicken.jpg' },
  { id: 'egusi', name: 'Egusi & pounded yam', author: 'Onyenachi64', source: 'Egusi_soup_with_pounded_yam_and_assorted_meats.jpg' },
  { id: 'suya', name: 'Suya', author: 'Honeybee5512', source: 'Nigerian_home_made_suya_and_sliced_onions.png' },
]

export function FoodGallery({ copy }: { copy: Copy }) {
  const [paused, setPaused] = useState(false)
  return <section className="food-gallery" aria-labelledby="food-title">
    <div className="page-width gallery-heading">
      <div><div className="eyebrow">{copy.foodEyebrow}</div><h2 id="food-title">{copy.foodTitle}</h2></div>
      <div className="gallery-tools"><p>{copy.foodNote}</p><button className="motion-toggle" type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? copy.playGallery : copy.pauseGallery} <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span></button></div>
    </div>
    <div className={`food-window ${paused ? 'is-paused' : ''}`}>
      <div className="food-track">
        {[0, 1].map((repeat) => <div className="food-set" key={repeat} aria-hidden={repeat === 1 ? true : undefined}>
          {foodPhotos.map((food, index) => <figure className="food-item" key={food.id}>
            <div className="food-image"><img src={`/images/food/${food.id}.jpg`} alt={repeat ? '' : food.name} width="960" height="960" loading="lazy" /></div>
            <figcaption><span>0{index + 1}</span><h3>{food.name}</h3><span aria-hidden="true">↗</span></figcaption>
          </figure>)}
        </div>)}
      </div>
    </div>
    <div className="page-width gallery-caption"><span>{copy.foodDisclaimer}</span><details className="photo-credits"><summary>{copy.photoCredits}</summary><p>{copy.photoEdits}</p>{foodPhotos.map((food) => <a key={food.id} href={`https://commons.wikimedia.org/wiki/File:${food.source}`} target="_blank" rel="noreferrer">{food.name} — {food.author}</a>)}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></details></div>
  </section>
}
