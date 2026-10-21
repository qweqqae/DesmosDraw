// github - https://github.com/qweqqae
import type { FnKind, Prim, Pt } from './types'

type Cand = { prim: Prim; err: number; cost: number }

export function q(n: number): number {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return 0
  const mag = Math.floor(Math.log10(Math.abs(n)))
  const d = Math.min(10, Math.max(2, 2 - mag))
  const f = 10 ** d
  return Math.round(n * f) / f || 0
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const out = M.map((row, i) => row[n] / row[i])
  return out.every(Number.isFinite) ? out : null
}

function lsq(rows: number[][], v: number[]): number[] | null {
  const m = rows[0].length
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0))
  const b = new Array<number>(m).fill(0)
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    for (let j = 0; j < m; j++) {
      b[j] += r[j] * v[i]
      for (let k = 0; k < m; k++) A[j][k] += r[j] * r[k]
    }
  }
  return solve(A, b)
}

const clamp1 = (z: number) => Math.max(-1, Math.min(1, z))

export function evalFn(kind: FnKind, p: number[], u: number): number {
  switch (kind) {
    case 'line':
      return p[0] * u + p[1]
    case 'parabola':
      return p[0] * (u - p[1]) ** 2 + p[2]
    case 'sine':
      return p[0] * Math.sin(p[1] * u + p[2]) + p[3]
    case 'sqrt':
      return p[0] * Math.sqrt(Math.max(0, p[2] * (u - p[1]))) + p[3]
    case 'arcsin':
      return p[0] * Math.asin(clamp1(p[1] * (u - p[2]))) + p[3]
    case 'arccos':
      return p[0] * Math.acos(clamp1(p[1] * (u - p[2]))) + p[3]
  }
}

const COST: Record<FnKind, number> = {
  line: 1,
  parabola: 2,
  sine: 3,
  sqrt: 3,
  arcsin: 3,
  arccos: 3,
}

function fnCand(
  kind: FnKind,
  axis: 'x' | 'y',
  raw: number[],
  u: number[],
  v: number[],
): Cand | null {
  if (!raw.every(Number.isFinite)) return null
  const p = raw.map(q)
  let err = 0
  for (let i = 0; i < u.length; i++) {
    const d = Math.abs(v[i] - evalFn(kind, p, u[i]))
    err = Number.isFinite(d) ? Math.max(err, d) : Infinity
  }
  let lo = Infinity
  let hi = -Infinity
  for (const x of u) {
    lo = Math.min(lo, x)
    hi = Math.max(hi, x)
  }
  return {
    prim: { kind, axis, p, lo: Math.floor(lo * 100) / 100, hi: Math.ceil(hi * 100) / 100 },
    err,
    cost: COST[kind],
  }
}

function axisData(pts: Pt[], axis: 'x' | 'y') {
  const u = pts.map((p) => (axis === 'x' ? p.x : p.y))
  const v = pts.map((p) => (axis === 'x' ? p.y : p.x))
  let lo = Infinity
  let hi = -Infinity
  for (const x of u) {
    lo = Math.min(lo, x)
    hi = Math.max(hi, x)
  }
  let vlo = Infinity
  let vhi = -Infinity
  for (const x of v) {
    vlo = Math.min(vlo, x)
    vhi = Math.max(vhi, x)
  }
  return { u, v, lo, hi, span: hi - lo, vspan: vhi - vlo }
}

function monotonic(u: number[], slack: number): boolean {
  const dir = Math.sign(u[u.length - 1] - u[0])
  if (!dir) return false
  let best = u[0]
  for (const x of u) {
    if ((x - best) * dir < -slack) return false
    if ((x - best) * dir > 0) best = x
  }
  return true
}

function lineCand(pts: Pt[], tol: number): Cand | null {
  const ax = axisData(pts, 'x')
  const ay = axisData(pts, 'y')
  const axis = ax.span >= ay.span ? 'x' : 'y'
  const d = axis === 'x' ? ax : ay
  if (d.span === 0) return null
  const mean = d.v.reduce((a, b) => a + b, 0) / d.v.length
  const flat = fnCand('line', axis, [0, mean], d.u, d.v)
  if (flat && flat.err <= tol) return flat
  const s = lsq(
    d.u.map((x) => [x, 1]),
    d.v,
  )
  return s ? fnCand('line', axis, s, d.u, d.v) : null
}

function parabolaCand(d: ReturnType<typeof axisData>, axis: 'x' | 'y'): Cand | null {
  const s = lsq(
    d.u.map((x) => [x * x, x, 1]),
    d.v,
  )
  if (!s || Math.abs(s[0]) < 1e-6) return null
  const [a, b, c] = s
  const h = -b / (2 * a)
  const k = c - (b * b) / (4 * a)
  if (Math.abs(h - (d.lo + d.hi) / 2) > 3 * d.span) return null
  return fnCand('parabola', axis, [a, h, k], d.u, d.v)
}

function sineCand(d: ReturnType<typeof axisData>, axis: 'x' | 'y'): Cand | null {
  let best: Cand | null = null
  const steps = 28
  for (let i = 0; i < steps; i++) {
    const B = ((0.5 * Math.PI) / d.span) * Math.pow(16, i / (steps - 1))
    const s = lsq(
      d.u.map((x) => [Math.sin(B * x), Math.cos(B * x), 1]),
      d.v,
    )
    if (!s) continue
    const A = Math.hypot(s[0], s[1])
    if (A > 4 * (d.vspan + d.span)) continue
    const C = Math.atan2(s[1], s[0])
    const c = fnCand('sine', axis, [A, B, C, s[2]], d.u, d.v)
    if (c && (!best || c.err < best.err)) best = c
  }
  return best
}

function sqrtCand(d: ReturnType<typeof axisData>, axis: 'x' | 'y'): Cand | null {
  let best: Cand | null = null
  for (const sgn of [1, -1]) {
    for (const f of [0, 0.01, 0.03, 0.08, 0.2, 0.5, 1.2]) {
      const h = sgn === 1 ? d.lo - d.span * f : d.hi + d.span * f
      const s = lsq(
        d.u.map((x) => [Math.sqrt(Math.max(0, sgn * (x - h))), 1]),
        d.v,
      )
      if (!s) continue
      const c = fnCand('sqrt', axis, [s[0], h, sgn, s[1]], d.u, d.v)
      if (c && (!best || c.err < best.err)) best = c
    }
  }
  return best
}

function arcsinCand(d: ReturnType<typeof axisData>, axis: 'x' | 'y'): Cand | null {
  let best: Cand | null = null
  for (let j = 0; j <= 8; j++) {
    const h = d.lo + (d.span * j) / 8
    const W = Math.max(h - d.lo, d.hi - h)
    for (const f of [1.0001, 1.08, 1.3, 1.8, 3]) {
      const b = 1 / (W * f)
      const s = lsq(
        d.u.map((x) => [Math.asin(clamp1(b * (x - h))), 1]),
        d.v,
      )
      if (!s) continue
      const [a, k] = s
      // a·arcsin(z)+k with a<0 reads nicer as |a|·arccos(z)+(k+aπ/2).
      const c =
        a < 0
          ? fnCand('arccos', axis, [-a, b, h, k + (a * Math.PI) / 2], d.u, d.v)
          : fnCand('arcsin', axis, [a, b, h, k], d.u, d.v)
      if (c && (!best || c.err < best.err)) best = c
    }
  }
  return best
}

function pathLength(pts: Pt[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return len
}

function arcCand(pts: Pt[], tol: number): Cand | null {
  const s = lsq(
    pts.map((p) => [p.x, p.y, 1]),
    pts.map((p) => -(p.x * p.x + p.y * p.y)),
  )
  if (!s) return null
  const cx0 = -s[0] / 2
  const cy0 = -s[1] / 2
  const r2 = cx0 * cx0 + cy0 * cy0 - s[2]
  if (r2 <= 0) return null
  const r0 = Math.sqrt(r2)
  if (r0 > 4 * pathLength(pts)) return null

  const ang = pts.map((p) => Math.atan2(p.y - cy0, p.x - cx0))
  for (let i = 1; i < ang.length; i++) {
    while (ang[i] - ang[i - 1] > Math.PI) ang[i] -= 2 * Math.PI
    while (ang[i] - ang[i - 1] < -Math.PI) ang[i] += 2 * Math.PI
  }
  if (!monotonic(ang, tol / r0)) return null
  const total = ang[ang.length - 1] - ang[0]
  if (Math.abs(total) > 2.02 * Math.PI) return null

  const cx = q(cx0)
  const cy = q(cy0)
  const r = q(r0)
  const a0 = q(ang[0] / Math.PI)
  const da = q(total / Math.PI)
  if (r === 0 || da === 0) return null

  let err = 0
  for (const p of pts) err = Math.max(err, Math.abs(Math.hypot(p.x - cx, p.y - cy) - r))
  const at = (t: number) => ({
    x: cx + r * Math.cos(Math.PI * (a0 + da * t)),
    y: cy + r * Math.sin(Math.PI * (a0 + da * t)),
  })
  const first = pts[0]
  const last = pts[pts.length - 1]
  const s0 = at(0)
  const s1 = at(1)
  err = Math.max(err, Math.hypot(s0.x - first.x, s0.y - first.y), Math.hypot(s1.x - last.x, s1.y - last.y))
  return { prim: { kind: 'arc', cx, cy, r, a0, da }, err, cost: 2 }
}

function bezierCand(pts: Pt[]): Cand {
  const n = pts.length
  const P0 = pts[0]
  const P3 = pts[n - 1]
  const lens = [0]
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = lens[n - 1] || 1
  const t = lens.map((l) => l / total)

  let P1 = { x: P0.x + (P3.x - P0.x) / 3, y: P0.y + (P3.y - P0.y) / 3 }
  let P2 = { x: P0.x + ((P3.x - P0.x) * 2) / 3, y: P0.y + ((P3.y - P0.y) * 2) / 3 }

  for (let iter = 0; iter < 3; iter++) {
    const rows = t.map((s) => [3 * (1 - s) ** 2 * s, 3 * (1 - s) * s * s])
    const base = (s: number, a: number, b: number) => (1 - s) ** 3 * a + s ** 3 * b
    const sx = lsq(rows, pts.map((p, i) => p.x - base(t[i], P0.x, P3.x)))
    const sy = lsq(rows, pts.map((p, i) => p.y - base(t[i], P0.y, P3.y)))
    if (sx && sy) {
      P1 = { x: sx[0], y: sy[0] }
      P2 = { x: sx[1], y: sy[1] }
    }
    for (let i = 1; i < n - 1; i++) {
      const s = t[i]
      const u = 1 - s
      const bx = u ** 3 * P0.x + 3 * u * u * s * P1.x + 3 * u * s * s * P2.x + s ** 3 * P3.x
      const by = u ** 3 * P0.y + 3 * u * u * s * P1.y + 3 * u * s * s * P2.y + s ** 3 * P3.y
      const d1x = 3 * (u * u * (P1.x - P0.x) + 2 * u * s * (P2.x - P1.x) + s * s * (P3.x - P2.x))
      const d1y = 3 * (u * u * (P1.y - P0.y) + 2 * u * s * (P2.y - P1.y) + s * s * (P3.y - P2.y))
      const d2x = 6 * (u * (P2.x - 2 * P1.x + P0.x) + s * (P3.x - 2 * P2.x + P1.x))
      const d2y = 6 * (u * (P2.y - 2 * P1.y + P0.y) + s * (P3.y - 2 * P2.y + P1.y))
      const ex = bx - pts[i].x
      const ey = by - pts[i].y
      const den = d1x * d1x + d1y * d1y + ex * d2x + ey * d2y
      if (Math.abs(den) > 1e-12) t[i] = Math.max(0, Math.min(1, s - (ex * d1x + ey * d1y) / den))
    }
  }

  const cx = [P0.x, 3 * (P1.x - P0.x), 3 * (P0.x - 2 * P1.x + P2.x), P3.x - 3 * P2.x + 3 * P1.x - P0.x].map(q)
  const cy = [P0.y, 3 * (P1.y - P0.y), 3 * (P0.y - 2 * P1.y + P2.y), P3.y - 3 * P2.y + 3 * P1.y - P0.y].map(q)
  const poly = (c: number[], s: number) => c[0] + s * (c[1] + s * (c[2] + s * c[3]))
  let err = 0
  for (let i = 0; i < n; i++) {
    err = Math.max(err, Math.hypot(poly(cx, t[i]) - pts[i].x, poly(cy, t[i]) - pts[i].y))
  }
  return { prim: { kind: 'bezier', cx, cy }, err, cost: 4 }
}

function ellipseCand(pts: Pt[]): Cand | null {
  const n = pts.length
  let A = 0
  let Sx = 0
  let Sy = 0
  let Sxx = 0
  let Syy = 0
  let Sxy = 0
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const r = pts[(i + 1) % n]
    const c = p.x * r.y - r.x * p.y
    A += c
    Sx += (p.x + r.x) * c
    Sy += (p.y + r.y) * c
    Sxx += (p.x * p.x + p.x * r.x + r.x * r.x) * c
    Syy += (p.y * p.y + p.y * r.y + r.y * r.y) * c
    Sxy += (p.x * r.y + 2 * p.x * p.y + 2 * r.x * r.y + r.x * p.y) * c
  }
  A /= 2
  if (Math.abs(A) < 1e-9) return null
  const mx = Sx / (6 * A)
  const my = Sy / (6 * A)
  const mxx = Sxx / (12 * A) - mx * mx
  const myy = Syy / (12 * A) - my * my
  const mxy = Sxy / (24 * A) - mx * my
  const tr = mxx + myy
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (mxx * myy - mxy * mxy)))
  const l1 = tr / 2 + disc
  const l2 = tr / 2 - disc
  if (l2 <= 0) return null
  const a = 2 * Math.sqrt(l1)
  const b = 2 * Math.sqrt(l2)
  const cx = q(mx)
  const cy = q(my)

  if (b / a > 0.94) {
    const r2 = q(((a + b) / 2) ** 2)
    const r = Math.sqrt(r2)
    let err = 0
    for (const p of pts) err = Math.max(err, Math.abs(Math.hypot(p.x - cx, p.y - cy) - r))
    return { prim: { kind: 'circle', cx, cy, r2, fill: false }, err, cost: 2 }
  }

  let th = 0.5 * Math.atan2(2 * mxy, mxx - myy)
  let A2 = a * a
  let B2 = b * b
  if (Math.abs(Math.abs(th) - Math.PI / 2) < 0.04) {
    ;[A2, B2] = [B2, A2]
    th = 0
  } else if (Math.abs(th) < 0.04) th = 0
  th = q(th)
  const a2 = q(A2)
  const b2 = q(B2)
  const c = Math.cos(th)
  const s = Math.sin(th)
  let err = 0
  for (const p of pts) {
    const dx = p.x - cx
    const dy = p.y - cy
    const u = dx * c + dy * s
    const v = dy * c - dx * s
    const rho = Math.sqrt((u * u) / a2 + (v * v) / b2)
    err = Math.max(err, rho > 0 ? Math.hypot(u, v) * Math.abs(1 - 1 / rho) : Infinity)
  }
  return { prim: { kind: 'ellipse', cx, cy, a2, b2, th, fill: false }, err, cost: 2 }
}

function pickOk(cands: (Cand | null)[], tol: number): Cand | null {
  let best: Cand | null = null
  for (const c of cands) {
    if (!c || c.err > tol) continue
    if (!best || c.cost < best.cost || (c.cost === best.cost && c.err < best.err)) best = c
  }
  return best
}

function bestFit(pts: Pt[], tol: number): Cand {
  const all: Cand[] = []
  const line = lineCand(pts, tol)
  if (line) {
    if (line.err <= tol) return line
    all.push(line)
  }

  if (pts.length >= 4) {
    const axes = (['x', 'y'] as const)
      .map((axis) => ({ axis, d: axisData(pts, axis) }))
      .filter(({ d }) => d.span > 2 * tol && monotonic(d.u, tol * 0.5))

    const lvl2 = [arcCand(pts, tol), ...axes.map(({ axis, d }) => parabolaCand(d, axis))]
    const ok2 = pickOk(lvl2, tol)
    if (ok2) return ok2

    const lvl3 = axes.flatMap(({ axis, d }) => [sqrtCand(d, axis), sineCand(d, axis), arcsinCand(d, axis)])
    const ok3 = pickOk(lvl3, tol)
    if (ok3) return ok3

    for (const c of [...lvl2, ...lvl3]) if (c) all.push(c)
  }

  const bez = bezierCand(pts)
  if (bez.err <= tol) return bez
  all.push(bez)
  return all.reduce((a, b) => (b.err < a.err ? b : a))
}

function splitIndex(pts: Pt[]): number {
  const n = pts.length
  const a = pts[0]
  const b = pts[n - 1]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  let best = Math.floor(n / 2)
  let bestD = -1
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i]
    const d =
      len > 1e-9
        ? Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
        : Math.hypot(p.x - a.x, p.y - a.y)
    if (d > bestD) {
      bestD = d
      best = i
    }
  }
  return n >= 8 ? Math.min(n - 4, Math.max(3, best)) : Math.min(n - 2, Math.max(1, best))
}

export function fitStroke(pts: Pt[], closed: boolean, tol: number): Prim[] {
  if (closed && pts.length >= 12) {
    const e = ellipseCand(pts)
    if (e && e.err <= tol * 1.3) return [e.prim]
  }

  const path = closed ? [...pts, pts[0]] : pts
  const segs: { pts: Pt[]; c: Cand }[] = []

  const split = (p: Pt[], depth: number) => {
    const c = bestFit(p, tol)
    if (c.err <= tol || p.length < 4 || depth > 30) {
      segs.push({ pts: p, c })
      return
    }
    const i = splitIndex(p)
    split(p.slice(0, i + 1), depth + 1)
    split(p.slice(i), depth + 1)
  }
  if (path.length >= 2) split(path, 0)

  for (let pass = 0, changed = true; changed && pass < 3; pass++) {
    changed = false
    for (let i = 0; i < segs.length - 1; i++) {
      const merged = segs[i].pts.concat(segs[i + 1].pts.slice(1))
      const c = bestFit(merged, tol)
      if (c.err <= tol && c.cost <= Math.max(segs[i].c.cost, segs[i + 1].c.cost)) {
        segs.splice(i, 2, { pts: merged, c })
        changed = true
      }
    }
  }

  return segs.map((s) => s.c.prim)
}
