// github - https://github.com/qweqqae
export type Chain = { pixels: number[]; closed: boolean }

const N4 = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]
const ND = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]
const N8 = [...N4, ...ND]

export function trace(m: Uint8Array, w: number, h: number): Chain[] {
  const visited = new Uint8Array(w * h)
  const chains: Chain[] = []

  const neighbors = (i: number, dirs: number[][]) => {
    const x = i % w
    const y = (i - x) / w
    const out: number[] = []
    for (const [dx, dy] of dirs) {
      const xx = x + dx
      const yy = y + dy
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
      const j = yy * w + xx
      if (m[j]) out.push(j)
    }
    return out
  }

  const degree = (i: number) => neighbors(i, N8).length

  const nextFrom = (i: number) => {
    for (const j of neighbors(i, N4)) if (!visited[j]) return j
    for (const j of neighbors(i, ND)) if (!visited[j]) return j
    return -1
  }

  const walk = (start: number, path: number[]) => {
    let cur = start
    for (;;) {
      const nx = nextFrom(cur)
      if (nx < 0) return
      visited[nx] = 1
      path.push(nx)
      cur = nx
    }
  }

  const attach = (path: number[], atHead: boolean) => {
    const end = atHead ? path[0] : path[path.length - 1]
    const near = new Set(atHead ? path.slice(0, 3) : path.slice(-3))
    for (const j of neighbors(end, N8)) {
      if (visited[j] && !near.has(j)) {
        if (atHead) path.unshift(j)
        else path.push(j)
        return
      }
    }
  }

  const start = (i: number) => {
    visited[i] = 1
    const fwd = [i]
    walk(i, fwd)
    const bwd: number[] = []
    walk(i, bwd)
    const path = bwd.reverse().concat(fwd)
    attach(path, true)
    attach(path, false)

    let closed = false
    const first = path[0]
    const last = path[path.length - 1]
    if (path.length > 8) {
      if (first === last) {
        path.pop()
        closed = true
      } else {
        const fx = first % w
        const fy = (first - fx) / w
        const lx = last % w
        const ly = (last - lx) / w
        closed = Math.abs(fx - lx) <= 1 && Math.abs(fy - ly) <= 1
      }
    }
    chains.push({ pixels: path, closed })
  }

  for (let i = 0; i < w * h; i++) if (m[i] && !visited[i] && degree(i) === 1) start(i)
  for (let i = 0; i < w * h; i++) if (m[i] && !visited[i]) start(i)

  return chains
}
