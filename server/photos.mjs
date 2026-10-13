const limit = 300 * 1024

export function cleanPhoto(value) {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(value))
  if (!match) throw new Error('photo_too_large_or_not_a_photo')
  const input = Buffer.from(match[2], 'base64')
  if (!input.length || input.length > limit) throw new Error('photo_too_large_or_not_a_photo')
  let bytes, extension
  if (/jpe?g/i.test(match[1])) {
    if (input[0] !== 0xff || input[1] !== 0xd8 || input.at(-2) !== 0xff || input.at(-1) !== 0xd9) throw new Error('photo_too_large_or_not_a_photo')
    const parts = [input.subarray(0, 2)]
    let offset = 2, scanned = false, framed = false
    while (offset < input.length - 2) {
      if (input[offset] !== 0xff) throw new Error('photo_too_large_or_not_a_photo')
      const marker = input[offset + 1]
      if (offset + 4 > input.length) throw new Error('photo_too_large_or_not_a_photo')
      const size = input.readUInt16BE(offset + 2)
      if (size < 2 || offset + size + 2 > input.length) throw new Error('photo_too_large_or_not_a_photo')
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (size < 8 || !input.readUInt16BE(offset + 5) || !input.readUInt16BE(offset + 7)) throw new Error('photo_too_large_or_not_a_photo')
        framed = true
      }
      if (marker === 0xda) {
        if (!framed || size < 6 || offset + size + 2 >= input.length - 2) throw new Error('photo_too_large_or_not_a_photo')
        parts.push(input.subarray(offset)); scanned = true; break
      }
      if (![0xe1, 0xed, 0xfe].includes(marker)) parts.push(input.subarray(offset, offset + size + 2))
      offset += size + 2
    }
    if (!scanned) throw new Error('photo_too_large_or_not_a_photo')
    bytes = Buffer.concat(parts); extension = 'jpg'
  } else if (match[1].toLowerCase() === 'png') {
    if (!input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('photo_too_large_or_not_a_photo')
    const parts = [input.subarray(0, 8)]
    let offset = 8, ended = false, image = false, header = false
    while (offset + 12 <= input.length) {
      const size = input.readUInt32BE(offset), type = input.toString('ascii', offset + 4, offset + 8)
      if (offset + size + 12 > input.length) throw new Error('photo_too_large_or_not_a_photo')
      if (offset === 8 && type !== 'IHDR') throw new Error('photo_too_large_or_not_a_photo')
      if (type === 'IHDR') {
        if (header || size !== 13 || !input.readUInt32BE(offset + 8) || !input.readUInt32BE(offset + 12)) throw new Error('photo_too_large_or_not_a_photo')
        header = true
      }
      if (!['eXIf', 'iTXt', 'tEXt', 'zTXt'].includes(type)) parts.push(input.subarray(offset, offset + size + 12))
      if (type === 'IDAT' && size > 0) image = true
      offset += size + 12
      if (type === 'IEND') { ended = true; break }
    }
    if (!ended || !image || !header) throw new Error('photo_too_large_or_not_a_photo')
    bytes = Buffer.concat(parts); extension = 'png'
  } else {
    if (input.toString('ascii', 0, 4) !== 'RIFF' || input.toString('ascii', 8, 12) !== 'WEBP') throw new Error('photo_too_large_or_not_a_photo')
    const parts = [Buffer.from(input.subarray(0, 12))]
    let offset = 12, image = false
    while (offset + 8 <= input.length) {
      const type = input.toString('ascii', offset, offset + 4), size = input.readUInt32LE(offset + 4), end = offset + 8 + size + (size % 2)
      if (end > input.length) throw new Error('photo_too_large_or_not_a_photo')
      if (['VP8 ', 'VP8L', 'ANMF'].includes(type)) image = true
      if (!['EXIF', 'XMP '].includes(type)) {
        const chunk = Buffer.from(input.subarray(offset, end))
        if (type === 'VP8X') chunk[8] &= ~0x0c
        parts.push(chunk)
      }
      offset = end
    }
    if (!image) throw new Error('photo_too_large_or_not_a_photo')
    bytes = Buffer.concat(parts); bytes.writeUInt32LE(bytes.length - 8, 4); extension = 'webp'
  }
  return { bytes, extension, dataUrl: `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytes.toString('base64')}` }
}
