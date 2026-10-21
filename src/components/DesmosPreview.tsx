// github - https://github.com/qweqqae
import Desmos, { type DesmosCalculator } from 'desmos'
import { useEffect, useRef } from 'react'
import type { DesmosExpression } from '../lib/vector/types'

type Props = {
  expressions: DesmosExpression[]
  halfWidth: number
  halfHeight: number
}

export function DesmosPreview({ expressions, halfWidth, halfHeight }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const calcRef = useRef<DesmosCalculator | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const calc = Desmos.GraphingCalculator(hostRef.current, {
      settingsMenu: false,
      zoomButtons: true,
      expressionsCollapsed: true,
    })
    calcRef.current = calc
    const ro = new ResizeObserver(() => calc.resize())
    ro.observe(hostRef.current)
    return () => {
      ro.disconnect()
      calc.destroy()
      calcRef.current = null
    }
  }, [])

  useEffect(() => {
    const calc = calcRef.current
    if (!calc) return
    calc.setBlank()
    calc.setExpressions(
      expressions.map(({ fillOpacity, ...e }) =>
        fillOpacity === undefined ? { ...e, lineWidth: 1.5 } : { ...e, fillOpacity, lineWidth: 1 },
      ),
    )
    const pad = 1.1
    calc.setMathBounds({
      left: -halfWidth * pad,
      right: halfWidth * pad,
      bottom: -halfHeight * pad,
      top: halfHeight * pad,
    })
  }, [expressions, halfWidth, halfHeight])

  return <div ref={hostRef} className="desmos-host" aria-label="Desmos preview" />
}
