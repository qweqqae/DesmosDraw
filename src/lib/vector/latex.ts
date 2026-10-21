// github - https://github.com/qweqqae
import type { DesmosExpression, Prim } from './types'

const num = (n: number) => {
  const s = n.toFixed(10).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}
const coef = (a: number, body: string) =>
  a === 1 ? body : a === -1 ? `-${body}` : `${num(a)}${body}`
const signed = (c: number) => (c === 0 ? '' : c > 0 ? `+${num(c)}` : `-${num(-c)}`)
const shift = (u: string, h: number) => (h === 0 ? u : h > 0 ? `${u}-${num(h)}` : `${u}+${num(-h)}`)
const linear = (k: number, b: number, u: string) => (k === 0 ? num(b) : coef(k, u) + signed(b))
const paren = (s: string) => `\\left(${s}\\right)`
const restrict = (u: string, lo: number, hi: number) =>
  `\\left\\{${num(lo)}\\le ${u}\\le ${num(hi)}\\right\\}`

function poly(c: number[], t: string): string {
  const body = ['', t, `${t}^{2}`, `${t}^{3}`]
  let out = ''
  c.forEach((v, i) => {
    if (v === 0) return
    const mag = Math.abs(v)
    const term = i === 0 ? num(mag) : mag === 1 ? body[i] : num(mag) + body[i]
    out += (v < 0 ? '-' : out ? '+' : '') + term
  })
  return out || '0'
}

export function primToLatex(prim: Prim): string {
  switch (prim.kind) {
    case 'arc': {
      const ang = `\\pi${paren(linear(prim.da, prim.a0, 't'))}`
      const part = (c: number, fn: string) => `${c !== 0 ? `${num(c)}+` : ''}${coef(prim.r, `\\${fn}${paren(ang)}`)}`
      return `\\left(${part(prim.cx, 'cos')},${part(prim.cy, 'sin')}\\right)`
    }
    case 'circle':
      return `${paren(shift('x', prim.cx))}^{2}+${paren(shift('y', prim.cy))}^{2}${prim.fill ? '\\le' : '='}${num(prim.r2)}`
    case 'ellipse': {
      const X = shift('x', prim.cx)
      const Y = shift('y', prim.cy)
      const rel = prim.fill ? '\\le' : '='
      if (prim.th === 0) {
        return `\\frac{${paren(X)}^{2}}{${num(prim.a2)}}+\\frac{${paren(Y)}^{2}}{${num(prim.b2)}}${rel}1`
      }
      const c = `\\cos${paren(num(prim.th))}`
      const s = `\\sin${paren(num(prim.th))}`
      const u = paren(`${paren(X)}${c}+${paren(Y)}${s}`)
      const v = paren(`${paren(Y)}${c}-${paren(X)}${s}`)
      return `\\frac{${u}^{2}}{${num(prim.a2)}}+\\frac{${v}^{2}}{${num(prim.b2)}}${rel}1`
    }
    case 'bezier':
      return `\\left(${poly(prim.cx, 't')},${poly(prim.cy, 't')}\\right)`
    default: {
      const u = prim.axis
      const v = u === 'x' ? 'y' : 'x'
      const p = prim.p
      let rhs: string
      switch (prim.kind) {
        case 'line':
          rhs = linear(p[0], p[1], u)
          break
        case 'parabola':
          rhs = coef(p[0], `${paren(shift(u, p[1]))}^{2}`) + signed(p[2])
          break
        case 'sine':
          rhs = coef(p[0], `\\sin${paren(linear(p[1], p[2], u))}`) + signed(p[3])
          break
        case 'sqrt': {
          const inner = p[2] === 1 ? shift(u, p[1]) : linear(-1, p[1], u)
          rhs = coef(p[0], `\\sqrt{${inner}}`) + signed(p[3])
          break
        }
        case 'arcsin':
        case 'arccos':
          rhs = coef(p[0], `\\${prim.kind}${paren(coef(p[1], paren(shift(u, p[2]))))}`) + signed(p[3])
          break
      }
      return `${v}=${rhs}${restrict(u, prim.lo, prim.hi)}`
    }
  }
}

export function expressionsToText(expressions: DesmosExpression[]): string {
  return expressions.map((e) => e.latex).join('\n')
}
