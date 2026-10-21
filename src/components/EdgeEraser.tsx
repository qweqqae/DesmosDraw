// github - https://github.com/qweqqae
import { useEffect, useRef, useState } from 'react'
import type { EraseStroke, Pt } from '../lib/vector/types'

type Props = {
  image: HTMLImageElement
  edges: Uint8Array
  width: number
  height: number
  radius: number
  onStroke: (stroke: EraseStroke) => void
}

export function EdgeEraser({ image, edges, width, height, radius, onStroke }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<Pt[] | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [boxSide, setBoxSide] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 0.18
    ctx.drawImage(image, 0, 0, width, height)
    ctx.globalAlpha = 1
    const img = ctx.getImageData(0, 0, width, height)
    for (let i = 0; i < edges.length; i++) {
      if (!edges[i]) continue
      img.data[i * 4] = 25
      img.data[i * 4 + 1] = 25
      img.data[i * 4 + 2] = 25
    }
    ctx.putImageData(img, 0, 0)
  }, [image, edges, width, height])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect()
      setBoxSide(Math.max(r.width, r.height))
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  const toImage = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  const mark = (a: Pt, b: Pt) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2 * radius * Math.max(width, height)
    ctx.beginPath()
    ctx.moveTo(a.x * width, a.y * height)
    ctx.lineTo(b.x * width, b.y * height)
    ctx.stroke()
  }

  const finish = () => {
    const pts = drawing.current
    drawing.current = null
    if (pts && pts.length) onStroke({ r: radius, pts })
  }

  return (
    <div className="eraser">
      <canvas
        ref={canvasRef}
        className="edges"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const p = toImage(e)
          drawing.current = [p]
          mark(p, p)
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setCursor({ x: e.clientX - r.left, y: e.clientY - r.top })
          const pts = drawing.current
          if (!pts) return
          const p = toImage(e)
          mark(pts[pts.length - 1], p)
          pts.push(p)
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={() => setCursor(null)}
      />
      {cursor && (
        <span
          className="eraser-cursor"
          style={{
            left: cursor.x,
            top: cursor.y,
            width: 2 * radius * boxSide,
            height: 2 * radius * boxSide,
          }}
        />
      )}
    </div>
  )
}
