// github - https://github.com/qweqqae
export type Pt = { x: number; y: number }

export type FnKind = 'line' | 'parabola' | 'sine' | 'sqrt' | 'arcsin' | 'arccos'

export type Prim =
  | { kind: FnKind; axis: 'x' | 'y'; p: number[]; lo: number; hi: number }
  | { kind: 'arc'; cx: number; cy: number; r: number; a0: number; da: number }
  | { kind: 'circle'; cx: number; cy: number; r2: number; fill: boolean; color?: string }
  | {
      kind: 'ellipse'
      cx: number
      cy: number
      a2: number
      b2: number
      th: number
      fill: boolean
      color?: string
    }
  | { kind: 'bezier'; cx: number[]; cy: number[] }

export type PrimKind = Prim['kind']

export type DesmosExpression = {
  id: string
  latex: string
  color: string
  fillOpacity?: number
}

export type ImageMode = 'lineart' | 'photo'

export type EraseStroke = { r: number; pts: Pt[] }

export type VectorOptions = {
  mode: ImageMode
  tolerance: number
  minLength: number
  sensitivity: number
  fill: boolean
  dots: boolean
  span: number
}

export type VectorResult = {
  width: number
  height: number
  scale: number
  expressions: DesmosExpression[]
  prims: Prim[]
  counts: Partial<Record<PrimKind, number>>
  edges: Uint8Array
}
