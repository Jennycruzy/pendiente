import type { Language } from './types'

export type Dish = { id: string; name: string; note: Record<Language, string> }

// Photos are from Wikimedia Commons; authors and licences are listed in docs/PHOTO_CREDITS.md.
export const dishes: Dish[] = [
  { id: 'jollof2', name: 'Jollof rice & dodo', note: { en: 'Smoky party rice with sweet fried plantain.', es: 'Arroz ahumado de fiesta con plátano frito.' } },
  { id: 'nsala', name: 'Nsala & pounded yam', note: { en: 'Peppery white soup with soft wrapped iyan.', es: 'Sopa blanca picante con ñame machacado.' } },
  { id: 'ricebeans', name: 'Rice, beans & stew', note: { en: 'The everyday buka plate, ladled hot.', es: 'El plato diario del puesto, servido caliente.' } },
  { id: 'egusi', name: 'Egusi soup', note: { en: 'Melon seed soup with leaves and meat.', es: 'Sopa de semillas de melón con hojas y carne.' } },
  { id: 'ofada', name: 'Ofada rice & sauce', note: { en: 'Local rice, ayamase sauce, egg and moi moi.', es: 'Arroz local con salsa, huevo y moi moi.' } },
  { id: 'ricestew', name: 'White rice, dodo & stew', note: { en: 'Tomato stew, fried plantain, nothing fancy.', es: 'Guiso de tomate y plátano frito, sencillo.' } },
  { id: 'suya', name: 'Suya', note: { en: 'Spiced beef skewers off the evening grill.', es: 'Brochetas de res especiadas a la parrilla.' } },
  { id: 'amala', name: 'Amala & ewedu', note: { en: 'Yam flour swallow with jute leaf soup.', es: 'Masa de harina de ñame con sopa de hojas.' } },
  { id: 'moimoi', name: 'Moi moi & dodo', note: { en: 'Steamed bean pudding with fried plantain.', es: 'Pudín de frijol al vapor con plátano frito.' } },
  { id: 'puffpuff', name: 'Puff-puff', note: { en: 'Warm fried dough, sold by the bag.', es: 'Masa frita y caliente, vendida por bolsa.' } },
  { id: 'akara', name: 'Akara', note: { en: 'Bean fritters fried at dawn by the road.', es: 'Buñuelos de frijol fritos al amanecer.' } },
  { id: 'pepper', name: 'Goat pepper soup', note: { en: 'Hot, peppery broth for a long day.', es: 'Caldo picante para un día largo.' } },
]

export const heroSlides = ['jollof2', 'nsala', 'suya', 'ricestew', 'amala']

export const foodPhoto = (id: string, small = false) => `/food/${id}${small ? '-sm' : ''}.jpg`
