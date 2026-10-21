// github - https://github.com/qweqqae
import type { Chain } from './trace'

type End = { c: number; head: boolean; x: number; y: number; dx: number; dy: number }

export function linkChains(chains: Chain[], w: number, gap: number): Chain[] {
  const pos = (i: number) => {
    const x = i % w
    return { x, y: (i - x) / w }
  }
  const ends: End[] = []
  chains.forEach((ch, c) => {
    if (ch.closed || ch.pixels.length < 2) return
    for (const head of [true, false]) {
      const px = ch.pixels
      const k = Math.min(px.length - 1, 5)
      const e = pos(head ? px[0] : px[px.length - 1])
      const inner = pos(head ? px[k] : px[px.length - 1 - k])
      const len = Math.hypot(e.x - inner.x, e.y - inner.y) || 1
      ends.push({ c, head, x: e.x, y: e.y, dx: (e.x - inner.x) / len, dy: (e.y - inner.y) / len })
    }
  })

  const cell = Math.max(1, Math.ceil(gap))
  const grid = new Map<string, number[]>()
  ends.forEach((e, i) => {
    const key = `${Math.floor(e.x / cell)},${Math.floor(e.y / cell)}`
    const list = grid.get(key)
    if (list) list.push(i)
    else grid.set(key, [i])
  })

  const pairs: { a: number; b: number; score: number }[] = []
  ends.forEach((a, i) => {
    const gx = Math.floor(a.x / cell)
    const gy = Math.floor(a.y / cell)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (const j of grid.get(`${gx + ox},${gy + oy}`) ?? []) {
          if (j <= i) continue
          const b = ends[j]
          if (a.c === b.c && chains[a.c].pixels.length < 12) continue
          const vx = b.x - a.x
          const vy = b.y - a.y
          const d = Math.hypot(vx, vy)
          if (d > gap) continue
          const facing = -(a.dx * b.dx + a.dy * b.dy)
          if (facing < 0.3) continue
          if (d > 1.5) {
            const ahead = Math.min((a.dx * vx + a.dy * vy) / d, -(b.dx * vx + b.dy * vy) / d)
            if (ahead < 0.5) continue
          }
          pairs.push({ a: i, b: j, score: d * (2 - facing) })
        }
      }
    }
  })
  pairs.sort((p, q) => p.score - q.score)

  const link = new Map<number, number>()
  for (const { a, b } of pairs) {
    if (link.has(a) || link.has(b)) continue
    link.set(a, b)
    link.set(b, a)
  }

  const endIndex = new Map<string, number>()
  ends.forEach((e, i) => endIndex.set(`${e.c}:${e.head}`, i))
  const linkedTo = (c: number, head: boolean) => {
    const i = endIndex.get(`${c}:${head}`)
    return i === undefined ? undefined : link.get(i)
  }

  const used = new Uint8Array(chains.length)
  const out: Chain[] = []
  const walkFrom = (c: number, enterHead: boolean) => {
    const pixels: number[] = []
    let cur = c
    let head = enterHead
    let closed = false
    for (;;) {
      used[cur] = 1
      const px = chains[cur].pixels
      pixels.push(...(head ? px : [...px].reverse()))
      const next = linkedTo(cur, !head)
      if (next === undefined) break
      const e = ends[next]
      if (used[e.c]) {
        closed = true
        break
      }
      cur = e.c
      head = e.head
    }
    out.push({ pixels, closed: closed && pixels.length > 8 })
  }

  chains.forEach((ch, c) => {
    if (used[c]) return
    if (ch.closed || ch.pixels.length < 2) {
      used[c] = 1
      out.push(ch)
      return
    }
    if (linkedTo(c, true) === undefined) walkFrom(c, true)
    else if (linkedTo(c, false) === undefined) walkFrom(c, false)
  })
  chains.forEach((_, c) => {
    if (!used[c]) walkFrom(c, true)
  })
  return out
}
