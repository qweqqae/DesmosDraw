// github - https://github.com/qweqqae
import { fitStroke, q } from './fit'
import { primToLatex } from './latex'
import { linkChains } from './link'
import { blackHat, canny, dilate, distanceTo, gaussian, otsu, thin, toChannels, toGray } from './raster'
import { trace } from './trace'
import type {
  DesmosExpression,
  EraseStroke,
  Prim,
  PrimKind,
  Pt,
  VectorOptions,
  VectorResult,
} from './types'

function smooth(pts: Pt[], closed: boolean, iters = 3): Pt[] {
  let cur = pts
  const n = pts.length
  if (n < 3) return pts
  for (let it = 0; it < iters; it++) {
    cur = cur.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p
      const a = cur[(i - 1 + n) % n]
      const b = cur[(i + 1) % n]
      return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 }
    })
  }
  return cur
}

function lineArtEdges(img: ImageData, gray: Float32Array, sensitivity: number) {
  const { width: w, height: h } = img
  const side = Math.max(w, h)
  const g = gaussian(gray, w, h, 0.7)
  const R = Math.max(2, Math.round(side / 150))
  const bh = blackHat(g, w, h, R)
  const delta = 64 - 5 * sensitivity
  const darkT = Math.min(otsu(g), 90)
  const mask = new Uint8Array(w * h)
  const stack: number[] = []
  for (let i = 0; i < mask.length; i++) {
    if (bh[i] > delta || g[i] < darkT) {
      mask[i] = 1
      stack.push(i)
    }
  }
  const weak = delta * 0.45
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        const j = i + dy * w + dx
        if (xx < 0 || xx >= w || j < 0 || j >= mask.length || mask[j]) continue
        if (bh[j] > weak) {
          mask[j] = 1
          stack.push(j)
        }
      }
    }
  }

  const channels = toChannels(img).map((c) => gaussian(c, w, h, 1))
  const color = canny(channels, w, h, { high: 210 - 12 * sensitivity })
  const nearInk = dilate(mask, w, h, R + 1)

  const specks = extractSpecks(mask, w, h, Math.max(3, side / 70))

  const k = Math.max(2, side / 180)
  const depth = distanceTo(mask, w, h, true)
  const core = new Uint8Array(w * h)
  for (let i = 0; i < core.length; i++) core[i] = depth[i] > k ? 1 : 0
  const fromCore = distanceTo(core, w, h, false)
  const thick = new Uint8Array(w * h)
  for (let i = 0; i < thick.length; i++) thick[i] = mask[i] && fromCore[i] <= k + 0.5 ? 1 : 0
  const edges = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) edges[i] = mask[i] && !thick[i] ? 1 : 0
  thin(edges, w, h)
  for (let i = 0; i < mask.length; i++) if (color[i] && !nearInk[i]) edges[i] = 1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!thick[i]) continue
      const border =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !thick[i - 1] || !thick[i + 1] || !thick[i - w] || !thick[i + w]
      if (border) edges[i] = 1
    }
  }
  thin(edges, w, h)
  return { edges, darkT, specks }
}

type Speck = { x: number; y: number; r: number }

function extractSpecks(mask: Uint8Array, w: number, h: number, maxSide: number): Speck[] {
  const seen = new Uint8Array(w * h)
  const specks: Speck[] = []
  const comp: number[] = []
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue
    comp.length = 0
    seen[s] = 1
    const stack = [s]
    let x0 = w
    let x1 = 0
    let y0 = h
    let y1 = 0
    let big = false
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % w
      const y = (i - x) / w
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
      if (x1 - x0 >= maxSide || y1 - y0 >= maxSide) big = true
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const j = yy * w + xx
          if (mask[j] && !seen[j]) {
            seen[j] = 1
            stack.push(j)
          }
        }
      }
    }
    if (big || comp.length < 2) continue
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    if (Math.max(bw, bh) / Math.min(bw, bh) > 2.5 || comp.length < 0.35 * bw * bh) continue
    for (const i of comp) mask[i] = 0
    specks.push({ x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2, r: Math.max(0.8, Math.sqrt(comp.length / Math.PI)) })
  }
  return specks
}

function dotPrim(pts: Pt[], s: number, minLength: number): Prim | null {
  if (pts.length < 4) return null
  const a = pts[0]
  const b = pts[pts.length - 1]
  if (Math.hypot(a.x - b.x, a.y - b.y) > 2.1 * s) return null
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    y0 = Math.min(y0, p.y)
    y1 = Math.max(y1, p.y)
  }
  const ext = Math.max(x1 - x0, y1 - y0)
  if (ext > Math.max(4, minLength * 0.5) * s) return null
  const r = Math.max(ext / 2, 0.8 * s)
  return { kind: 'circle', cx: q((x0 + x1) / 2), cy: q((y0 + y1) / 2), r2: q(r * r), fill: true }
}

function hex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function sampleInside(
  prim: Extract<Prim, { kind: 'circle' | 'ellipse' }>,
  img: ImageData,
  gray: Float32Array,
  s: number,
) {
  const { width: w, height: h, data } = img
  const a2 = prim.kind === 'circle' ? prim.r2 : prim.a2
  const b2 = prim.kind === 'circle' ? prim.r2 : prim.b2
  const th = prim.kind === 'circle' ? 0 : prim.th
  const c = Math.cos(th)
  const sn = Math.sin(th)
  const R = Math.sqrt(Math.max(a2, b2))
  const x0 = Math.max(0, Math.floor((prim.cx - R) / s + w / 2))
  const x1 = Math.min(w - 1, Math.ceil((prim.cx + R) / s + w / 2))
  const y0 = Math.max(0, Math.floor(h / 2 - (prim.cy + R) / s))
  const y1 = Math.min(h - 1, Math.ceil(h / 2 - (prim.cy - R) / s))
  let n = 0
  let sg = 0
  let sr = 0
  let sgc = 0
  let sb = 0
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = (px - w / 2) * s - prim.cx
      const dy = (h / 2 - py) * s - prim.cy
      const u = dx * c + dy * sn
      const v = dy * c - dx * sn
      if ((u * u) / a2 + (v * v) / b2 > 0.6) continue
      const i = py * w + px
      n++
      sg += gray[i]
      sr += data[i * 4]
      sgc += data[i * 4 + 1]
      sb += data[i * 4 + 2]
    }
  }
  if (n < 4) return null
  return { gray: sg / n, color: hex(sr / n, sgc / n, sb / n) }
}

function eraseMask(w: number, h: number, strokes: EraseStroke[]): Uint8Array {
  const erased = new Uint8Array(w * h)
  const side = Math.max(w, h)
  for (const st of strokes) {
    const r = st.r * side
    const pts = st.pts.map((p) => ({ x: p.x * w, y: p.y * h }))
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[Math.min(i + 1, pts.length - 1)]
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r))
      const x1 = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x) + r))
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r))
      const y1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y) + r))
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5
          const py = y + 0.5
          const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0
          if (Math.hypot(px - a.x - t * dx, py - a.y - t * dy) <= r) erased[y * w + x] = 1
        }
      }
    }
  }
  return erased
}

export function detectEdges(img: ImageData, o: VectorOptions, erase: EraseStroke[] = []) {
  const { width: w, height: h } = img
  const gray = toGray(img)
  let edges: Uint8Array
  let darkT = 0
  let specks: Speck[] = []
  if (o.mode === 'lineart') {
    const r = lineArtEdges(img, gray, o.sensitivity)
    edges = r.edges
    darkT = r.darkT
    specks = r.specks
  } else {
    const channels = toChannels(img).map((c) => gaussian(c, w, h, 1.4))
    edges = canny(channels, w, h, { percentile: 0.95 - 0.06 * (o.sensitivity - 1) })
    thin(edges, w, h)
  }
  if (erase.length) {
    const erased = eraseMask(w, h, erase)
    for (let i = 0; i < edges.length; i++) if (erased[i]) edges[i] = 0
    specks = specks.filter((sp) => !erased[Math.floor(sp.y) * w + Math.floor(sp.x)])
  }
  return { gray, edges, darkT, specks }
}

export function vectorize(img: ImageData, o: VectorOptions, erase: EraseStroke[] = []): VectorResult {
  const { width: w, height: h } = img
  const { gray, edges, darkT, specks } = detectEdges(img, o, erase)

  const s = o.span / Math.max(w, h)
  const toUnits = (i: number): Pt => {
    const x = i % w
    const y = (i - x) / w
    return { x: (x - w / 2) * s, y: (h / 2 - y) * s }
  }
  const tol = o.tolerance * s

  const prims: Prim[] = []
  const dots: Prim[] = []
  const gap = Math.max(3, Math.max(w, h) / 100)
  for (const ch of linkChains(trace(edges, w, h), w, gap)) {
    const raw = ch.pixels.map(toUnits)
    if (ch.pixels.length < o.minLength) {
      const dot = o.dots && o.mode === 'photo' ? dotPrim(raw, s, o.minLength) : null
      if (dot) dots.push(dot)
      continue
    }
    const pts = smooth(raw, ch.closed)
    prims.push(...fitStroke(pts, ch.closed, tol))
  }
  const shown = edges.slice()
  if (o.dots) {
    for (const sp of specks) {
      const r = sp.r * s
      dots.push({ kind: 'circle', cx: q((sp.x - w / 2) * s), cy: q((h / 2 - sp.y) * s), r2: q(r * r), fill: true })
      const R = Math.ceil(sp.r)
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = Math.floor(sp.x + dx)
          const y = Math.floor(sp.y + dy)
          if (x >= 0 && y >= 0 && x < w && y < h && Math.hypot(x + 0.5 - sp.x, y + 0.5 - sp.y) <= sp.r) shown[y * w + x] = 1
        }
      }
    }
  }
  prims.push(...dots)

  const expressions: DesmosExpression[] = []
  const counts: Partial<Record<PrimKind, number>> = {}
  prims.forEach((prim, i) => {
    let color = '#000000'
    let fillOpacity: number | undefined
    if (prim.kind === 'circle' && prim.fill) {
      fillOpacity = 1
    } else if (o.mode === 'lineart' && o.fill && (prim.kind === 'circle' || prim.kind === 'ellipse')) {
      const inside = sampleInside(prim, img, gray, s)
      if (inside && inside.gray < darkT) {
        prim.fill = true
        color = inside.color
        fillOpacity = 1
      }
    }
    counts[prim.kind] = (counts[prim.kind] ?? 0) + 1
    expressions.push({ id: `c${i}`, latex: primToLatex(prim), color, fillOpacity })
  })

  return { width: w, height: h, scale: s, expressions, prims, counts, edges: shown }
}
