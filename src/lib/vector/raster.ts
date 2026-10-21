// github - https://github.com/qweqqae
export function toGray(img: ImageData): Float32Array {
  const { data } = img
  const g = new Float32Array(img.width * img.height)
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const a = data[j + 3] / 255
    const l = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
    g[i] = l * a + 255 * (1 - a)
  }
  return g
}

export function gaussian(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return src.slice()
  const r = Math.ceil(sigma * 2.5)
  const kernel: number[] = []
  let sum = 0
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(v)
    sum += v
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum

  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k))
        acc += src[y * w + xx] * kernel[k + r]
      }
      tmp[y * w + x] = acc
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k))
        acc += tmp[yy * w + x] * kernel[k + r]
      }
      out[y * w + x] = acc
    }
  }
  return out
}

export function otsu(g: Float32Array): number {
  const hist = new Array(256).fill(0)
  for (const v of g) hist[Math.max(0, Math.min(255, Math.round(v)))]++
  const total = g.length
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

function morph(m: Uint8Array, w: number, h: number, iter: number, erode: boolean): Uint8Array {
  let cur = m
  for (let it = 0; it < iter; it++) {
    const next = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = erode ? 1 : 0
        for (let dy = -1; dy <= 1 && hit === (erode ? 1 : 0); dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            const v = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : cur[yy * w + xx]
            if (erode && !v) {
              hit = 0
              break
            }
            if (!erode && v) {
              hit = 1
              break
            }
          }
        }
        next[y * w + x] = hit
      }
    }
    cur = next
  }
  return cur
}

export function distanceTo(m: Uint8Array, w: number, h: number, inside: boolean): Float32Array {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = (inside ? m[i] : !m[i]) ? INF : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? (inside ? 0 : INF) : d[y * w + x])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4)
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4)
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3
  return d
}

export const erode = (m: Uint8Array, w: number, h: number, iter: number) =>
  morph(m, w, h, iter, true)
export const dilate = (m: Uint8Array, w: number, h: number, iter: number) =>
  morph(m, w, h, iter, false)

export function thin(m: Uint8Array, w: number, h: number): void {
  for (let x = 0; x < w; x++) {
    m[x] = 0
    m[(h - 1) * w + x] = 0
  }
  for (let y = 0; y < h; y++) {
    m[y * w] = 0
    m[y * w + w - 1] = 0
  }
  let changed = true
  const del: number[] = []
  while (changed) {
    changed = false
    for (let step = 0; step < 2; step++) {
      del.length = 0
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          if (!m[i]) continue
          const p2 = m[i - w]
          const p3 = m[i - w + 1]
          const p4 = m[i + 1]
          const p5 = m[i + w + 1]
          const p6 = m[i + w]
          const p7 = m[i + w - 1]
          const p8 = m[i - 1]
          const p9 = m[i - w - 1]
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
          let a = 0
          for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) a++
          if (a !== 1) continue
          if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue
          del.push(i)
        }
      }
      if (del.length) changed = true
      for (const i of del) m[i] = 0
    }
  }
}

export function toChannels(img: ImageData): Float32Array[] {
  const { data } = img
  const n = img.width * img.height
  const out = [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = data[j + 3] / 255
    for (let c = 0; c < 3; c++) out[c][i] = data[j + c] * a + 255 * (1 - a)
  }
  return out
}

function rankFilter(src: Float32Array, w: number, h: number, r: number, max: boolean): Float32Array {
  const pick = max ? Math.max : Math.min
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = src[y * w + x]
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, src[y * w + k])
      tmp[y * w + x] = v
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x]
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x])
      out[y * w + x] = v
    }
  }
  return out
}

export function blackHat(g: Float32Array, w: number, h: number, r: number): Float32Array {
  const closed = rankFilter(rankFilter(g, w, h, r, true), w, h, r, false)
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = closed[i] - g[i]
  return out
}

export function canny(
  channels: Float32Array[],
  w: number,
  h: number,
  threshold: { percentile: number } | { high: number },
): Uint8Array {
  const n = w * h
  const mag = new Float32Array(n)
  const dir = new Uint8Array(n)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      let gx = 0
      let gy = 0
      let best = -1
      for (const g of channels) {
        const cx =
          -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1]
        const cy =
          -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]
        const m = cx * cx + cy * cy
        if (m > best) {
          best = m
          gx = cx
          gy = cy
        }
      }
      mag[i] = Math.sqrt(best)
      let a = (Math.atan2(gy, gx) * 180) / Math.PI
      if (a < 0) a += 180
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3
    }
  }

  const nms = new Float32Array(n)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const m = mag[i]
      if (m === 0) continue
      let a: number
      let b: number
      switch (dir[i]) {
        case 0:
          a = mag[i - 1]
          b = mag[i + 1]
          break
        case 1:
          a = mag[i + w + 1]
          b = mag[i - w - 1]
          break
        case 2:
          a = mag[i - w]
          b = mag[i + w]
          break
        default:
          a = mag[i + w - 1]
          b = mag[i - w + 1]
      }
      if (m >= a && m >= b) nms[i] = m
    }
  }

  const out = new Uint8Array(n)
  let high: number
  if ('high' in threshold) {
    high = threshold.high
  } else {
    const values: number[] = []
    for (const v of nms) if (v > 0) values.push(v)
    if (values.length === 0) return out
    values.sort((p, q) => p - q)
    high = values[Math.min(values.length - 1, Math.floor(values.length * threshold.percentile))]
  }
  const low = high * 0.45

  const stack: number[] = []
  for (let i = 0; i < n; i++) {
    if (nms[i] >= high) {
      out[i] = 1
      stack.push(i)
    }
  }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w
    const y = (i - x) / w
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const j = yy * w + xx
        if (!out[j] && nms[j] >= low) {
          out[j] = 1
          stack.push(j)
        }
      }
    }
  }
  return out
}
