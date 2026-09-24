// Generates the PWA icons from public/images/NYHLLogo-h150.png.
//
//   node scripts/make-icons.js        -> writes public/icon-{512,192,180}.png
//                                        and public/favicon.png
//
// The wordmark (415x150, palette PNG with transparency) is box-filtered to
// 74% width / 58% height — the same rule the stylesheet used — and blitted
// centred onto a league-navy square (#1e3a5f, the theme colour).
//
// This runs in Node on purpose. Rendering the icons through headless Chrome
// looked like the quick option, but Chrome mis-lays-out windows narrower than
// ~300px: the 192 and 180 screenshots came back cropped against the right
// edge. Doing the arithmetic here is deterministic and checkable.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const REPO = path.join(__dirname, '..')
const LOGO = path.join(REPO, 'public', 'images', 'NYHLLogo-h150.png')
const NAVY = [30, 58, 95] // #1e3a5f — matches <meta name="theme-color">

function decodePng(file) {
  const buf = fs.readFileSync(file)
  let off = 8,
    w,
    h,
    depth,
    ctype,
    idat = [],
    palette = null,
    trns = null
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      depth = data[8]
      ctype = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IEND') break
    off += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype]
  const bpp = Math.max(1, Math.ceil((ch * depth) / 8))
  const rowBytes = Math.ceil((w * ch * depth) / 8)
  const px = Buffer.alloc(w * h * 4)
  let prev = Buffer.alloc(rowBytes)
  for (let y = 0; y < h; y++) {
    const start = y * (rowBytes + 1)
    const filter = raw[start]
    const row = Buffer.from(raw.subarray(start + 1, start + 1 + rowBytes))
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? row[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      let v = row[i]
      if (filter === 1) v = (v + a) & 255
      else if (filter === 2) v = (v + b) & 255
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255
      else if (filter === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
      row[i] = v
    }
    for (let x = 0; x < w; x++) {
      let r, g, b, al
      if (ctype === 2) {
        const i = x * 3
        r = row[i]
        g = row[i + 1]
        b = row[i + 2]
        al = 255
      } else if (ctype === 3) {
        let idx
        if (depth === 8) idx = row[x]
        else {
          const per = 8 / depth
          const shift = 8 - depth * ((x % per) + 1)
          idx = (row[Math.floor(x / per)] >> shift) & ((1 << depth) - 1)
        }
        r = palette[idx * 3]
        g = palette[idx * 3 + 1]
        b = palette[idx * 3 + 2]
        al = trns && idx < trns.length ? trns[idx] : 255
      } else if (ctype === 6) {
        const i = x * 4
        r = row[i]
        g = row[i + 1]
        b = row[i + 2]
        al = row[i + 3]
      } else throw new Error('unsupported colour type ' + ctype)
      const o = (y * w + x) * 4
      px[o] = r
      px[o + 1] = g
      px[o + 2] = b
      px[o + 3] = al
    }
    prev = row
  }
  return { w, h, px }
}

// Coverage-weighted box filter in premultiplied space, so semi-transparent
// logo edges average correctly instead of ringing against the background.
function resize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  const xr = sw / dw,
    yr = sh / dh
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * yr,
      y1 = Math.min(sh, (dy + 1) * yr)
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * xr,
        x1 = Math.min(sw, (dx + 1) * xr)
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        area = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        if (wy <= 0) continue
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          if (wx <= 0) continue
          const wgt = wx * wy
          const o = (sy * sw + sx) * 4
          const al = src[o + 3] / 255
          r += src[o] * al * wgt
          g += src[o + 1] * al * wgt
          b += src[o + 2] * al * wgt
          a += al * wgt
          area += wgt
        }
      }
      const o = (dy * dw + dx) * 4
      if (a > 0) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
      }
      out[o + 3] = area > 0 ? Math.round((a / area) * 255) : 0
    }
  }
  return out
}

function encodePng(w, h, rgb) {
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc32 = (b) => {
    let c = 0xffffffff
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii')
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    t.copy(out, 4)
    data.copy(out, 8)
    out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  const rowBytes = w * 3
  const raw = Buffer.alloc((rowBytes + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (rowBytes + 1)] = 0 // filter: none
    rgb.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function makeIcon(size, outFile) {
  const logo = decodePng(LOGO)
  const scale = Math.min((size * 0.74) / logo.w, (size * 0.58) / logo.h)
  const lw = Math.round(logo.w * scale)
  const lh = Math.round(logo.h * scale)
  const scaled = resize(logo.px, logo.w, logo.h, lw, lh)
  const ox = Math.round((size - lw) / 2)
  const oy = Math.round((size - lh) / 2)
  const canvas = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 3
      canvas[o] = NAVY[0]
      canvas[o + 1] = NAVY[1]
      canvas[o + 2] = NAVY[2]
      const lx = x - ox,
        ly = y - oy
      if (lx < 0 || ly < 0 || lx >= lw || ly >= lh) continue
      const s = (ly * lw + lx) * 4
      const a = scaled[s + 3] / 255
      if (a === 0) continue
      canvas[o] = Math.round(scaled[s] * a + NAVY[0] * (1 - a))
      canvas[o + 1] = Math.round(scaled[s + 1] * a + NAVY[1] * (1 - a))
      canvas[o + 2] = Math.round(scaled[s + 2] * a + NAVY[2] * (1 - a))
    }
  }
  fs.writeFileSync(outFile, encodePng(size, size, canvas))
  console.log(`${path.basename(outFile)}  ${size}x${size}  logo ${lw}x${lh} at (${ox},${oy})`)
}

const outDir = process.argv[2] || path.join(REPO, 'public')
fs.mkdirSync(outDir, { recursive: true })
for (const size of [512, 192, 180]) makeIcon(size, path.join(outDir, `icon-${size}.png`))
makeIcon(48, path.join(outDir, 'favicon.png'))
