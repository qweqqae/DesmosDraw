// github - https://github.com/qweqqae
import { useEffect, useMemo, useRef, useState } from 'react'
import { DesmosPreview } from './components/DesmosPreview'
import { EdgeEraser } from './components/EdgeEraser'
import { expressionsToText } from './lib/vector/latex'
import type {
  EraseStroke,
  ImageMode,
  PrimKind,
  VectorOptions,
  VectorResult,
} from './lib/vector/types'
import './App.css'

const KIND_LABELS: Record<PrimKind, string> = {
  line: 'lines y = kx + b',
  arc: 'arcs via cos / sin',
  circle: 'circles',
  ellipse: 'ellipses',
  parabola: 'parabolas',
  sine: 'sine waves',
  sqrt: 'square roots √',
  arcsin: 'arcsin',
  arccos: 'arccos',
  bezier: 'cubic curves',
}

function loadImage(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => reject(new Error('Could not open image'))
    img.src = url
  })
}

function rasterize(img: HTMLImageElement, maxSide: number): ImageData {
  const scale = Math.min(2, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<VectorResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [mode, setMode] = useState<ImageMode>('lineart')
  const [detail, setDetail] = useState(700)
  const [tolerance, setTolerance] = useState(1.25)
  const [span, setSpan] = useState(20)
  const [fullscreen, setFullscreen] = useState(false)
  const [sensitivity, setSensitivity] = useState(5)
  const [minLength, setMinLength] = useState(6)
  const [fill, setFill] = useState(true)
  const [dots, setDots] = useState(true)
  const [erase, setErase] = useState<EraseStroke[]>([])
  const [brush, setBrush] = useState(3)

  const workerRef = useRef<Worker | null>(null)
  const workerBusy = useRef(false)
  const requestId = useRef(0)

  const spawnWorker = () => {
    const worker = new Worker(new URL('./lib/vector/worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<{ id: number; result?: VectorResult; error?: string }>) => {
      workerBusy.current = false
      if (e.data.id !== requestId.current) return
      setBusy(false)
      if (e.data.error) setError(e.data.error)
      else if (e.data.result) setResult(e.data.result)
    }
    workerRef.current = worker
    return worker
  }

  useEffect(() => {
    const worker = spawnWorker()
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    if (!image) return
    const t = setTimeout(() => {
      const options: VectorOptions = { mode, tolerance, sensitivity, minLength, fill, dots, span }
      const id = ++requestId.current
      setBusy(true)
      setError(null)
      // Drop stale worker job when sliders change.
      if (workerBusy.current) {
        workerRef.current?.terminate()
        spawnWorker()
      }
      workerBusy.current = true
      workerRef.current?.postMessage({ id, image: rasterize(image, detail), options, erase })
    }, 200)
    return () => clearTimeout(t)
  }, [image, mode, detail, tolerance, sensitivity, minLength, fill, dots, span, erase])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const el = e.target as HTMLElement
        if (el.closest('.desmos-host') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return
        setErase((s) => (s.length ? s.slice(0, -1) : s))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Please choose an image file: PNG, JPG, or WebP')
      return
    }
    try {
      const { img, url } = await loadImage(file)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(url)
      setErase([])
      setImage(img)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  const exportText = useMemo(() => (result ? expressionsToText(result.expressions) : ''), [result])

  const copy = async () => {
    await navigator.clipboard.writeText(exportText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const counts = result
    ? (Object.entries(result.counts) as [PrimKind, number][]).sort((a, b) => b[1] - a[1])
    : []

  return (
    <div className="app">
      <header className="header">
        <h1>Desmos Draw</h1>
      </header>

      <main className="layout">
        <section className="panel controls">
          <label
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void onFile(e.dataTransfer.files[0])
            }}
          >
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {previewUrl ? (
              <img className="thumb" src={previewUrl} alt="Uploaded image" />
            ) : (
              <span className="drop-title">Drop an image here or click to choose</span>
            )}
          </label>

          <div className="sliders">
            <label className="select-row">
              <span>Processing mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as ImageMode)}>
                <option value="lineart">Line art (trace strokes)</option>
                <option value="photo">Photo (find edges)</option>
              </select>
            </label>
            <label className="select-row">
              <span>Drawing scale</span>
              <select value={span} onChange={(e) => setSpan(Number(e.target.value))}>
                <option value={20}>20 grid units</option>
                <option value={50}>50 grid units</option>
                <option value={100}>100 grid units</option>
                <option value={200}>200 grid units</option>
                <option value={500}>500 grid units</option>
              </select>
            </label>
            <label>
              <span>Analysis resolution, px</span>
              <input
                type="range"
                min={200}
                max={1200}
                step={20}
                value={detail}
                onChange={(e) => setDetail(Number(e.target.value))}
              />
              <strong>{detail}</strong>
            </label>
            <label>
              <span>Formula tolerance px, lower is more accurate</span>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.25}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
              />
              <strong>{tolerance}</strong>
            </label>
            <label>
              <span>Sensitivity</span>
              <input
                type="range"
                min={1}
                max={10}
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
              />
              <strong>{sensitivity}</strong>
            </label>
            <label>
              <span>Skip lines shorter than, px</span>
              <input
                type="range"
                min={2}
                max={40}
                value={minLength}
                onChange={(e) => setMinLength(Number(e.target.value))}
              />
              <strong>{minLength}</strong>
            </label>
            {mode === 'lineart' && (
              <label className="check-row custom-check">
                <input
                  type="checkbox"
                  className="custom-check-input"
                  checked={fill}
                  onChange={(e) => setFill(e.target.checked)}
                />
                <span className="custom-check-box" aria-hidden />
                <span className="custom-check-label">Fill dark ovals (pupils, etc.)</span>
              </label>
            )}
            <label className="check-row custom-check">
              <input
                type="checkbox"
                className="custom-check-input"
                checked={dots}
                onChange={(e) => setDots(e.target.checked)}
              />
              <span className="custom-check-box" aria-hidden />
              <span className="custom-check-label">Draw dots and specks as small circles</span>
            </label>
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {result && (
            <div className="stats">
              <p>
                {busy ? 'Recalculating…' : 'Formulas:'} <strong>{result.expressions.length}</strong>
              </p>
              <ul className="kinds">
                {counts.map(([kind, n]) => (
                  <li key={kind}>
                    <span>{KIND_LABELS[kind]}</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="primary" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy formulas'}
              </button>
              <div className="paste-help">
                <p className="paste-help-title">
                  <svg className="info-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
                    <path
                      fill="currentColor"
                      d="M6.35 6.1h1.3V10H6.35V6.1zm0-2.45h1.3v1.35H6.35V3.65z"
                    />
                  </svg>
                  How to add graphs in Desmos?
                </p>
                <p className="hint">
                  In Desmos, click an empty row in the expression list and paste (Ctrl+V or Cmd+V). Each
                  line becomes its own graph.
                </p>
              </div>
            </div>
          )}
          {!result && busy && <p className="hint">Fitting formulas…</p>}
        </section>

        <section className="panel previews">
          <div className="preview-block wide">
            <div className="preview-head">
              <h2>Desmos</h2>
              {result && (
                <button type="button" className="secondary" onClick={() => setFullscreen(true)}>
                  Full screen
                </button>
              )}
            </div>
            <div className={`preview-frame desmos-frame${fullscreen ? ' fullscreen' : ''}`}>
              {fullscreen && (
                <button
                  type="button"
                  className="secondary close-fullscreen"
                  onClick={() => setFullscreen(false)}
                >
                  Close (Esc)
                </button>
              )}
              {result ? (
                <DesmosPreview
                  expressions={result.expressions}
                  halfWidth={(result.width * result.scale) / 2}
                  halfHeight={(result.height * result.scale) / 2}
                />
              ) : (
                <span className="placeholder">Upload an image on the left</span>
              )}
            </div>
          </div>
          {result && image && (
            <div className="preview-block wide">
              <div className="eraser-head">
                <h2>Eraser</h2>
                <p className="hint">Ctrl/Cmd+Z undoes the last stroke.</p>
              </div>
              <div className="eraser-tools">
                <label>
                  <span>Eraser size</span>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={brush}
                    onChange={(e) => setBrush(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={!erase.length}
                  onClick={() => setErase((s) => s.slice(0, -1))}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!erase.length}
                  onClick={() => setErase([])}
                >
                  Restore all
                </button>
              </div>
              <EdgeEraser
                image={image}
                edges={result.edges}
                width={result.width}
                height={result.height}
                radius={brush / 250}
                onStroke={(st) => setErase((s) => [...s, st])}
              />
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <a
          className="footer-link"
          href="https://github.com/qweqqae"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg className="footer-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 0 2-.27 7.7 7.7 0 0 0 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          byebakov
        </a>
        <a
          className="footer-link"
          href="https://www.reddit.com/user/byessa/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg className="footer-icon" viewBox="0 0 640 640" width="16" height="16" aria-hidden>
            <path
              fill="currentColor"
              d="M64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576L101.1 576C87.4 576 80.6 559.5 90.2 549.8L139 501C92.7 454.7 64 390.7 64 320zM413.6 217.6C437.2 217.6 456.3 198.5 456.3 174.9C456.3 151.3 437.2 132.2 413.6 132.2C393 132.2 375.8 146.8 371.8 166.2C337.3 169.9 310.4 199.2 310.4 234.6L310.4 234.8C272.9 236.4 238.6 247.1 211.4 263.9C201.3 256.1 188.6 251.4 174.9 251.4C141.9 251.4 115.1 278.2 115.1 311.2C115.1 335.2 129.2 355.8 149.5 365.3C151.5 434.7 227.1 490.5 320.1 490.5C413.1 490.5 488.8 434.6 490.7 365.2C510.9 355.6 524.8 335 524.8 311.2C524.8 278.2 498 251.4 465 251.4C451.3 251.4 438.7 256 428.6 263.8C401.2 246.8 366.5 236.1 328.6 234.7L328.6 234.5C328.6 209.1 347.5 188 372 184.6C376.4 203.4 393.3 217.4 413.5 217.4L413.6 217.6zM241.1 310.9C257.8 310.9 270.6 328.5 269.6 350.2C268.6 371.9 256.1 379.8 239.3 379.8C222.5 379.8 207.9 371 208.9 349.3C209.9 327.6 224.3 311 241 311L241.1 310.9zM431.2 349.2C432.2 370.9 417.5 379.7 400.8 379.7C384.1 379.7 371.5 371.8 370.5 350.1C369.5 328.4 382.3 310.8 399 310.8C415.7 310.8 430.2 327.4 431.1 349.1L431.2 349.2zM383.1 405.9C372.8 430.5 348.5 447.8 320.1 447.8C291.7 447.8 267.4 430.5 257.1 405.9C255.9 403 257.9 399.7 261 399.4C279.4 397.5 299.3 396.5 320.1 396.5C340.9 396.5 360.8 397.5 379.2 399.4C382.3 399.7 384.3 403 383.1 405.9z"
            />
          </svg>
          byessa
        </a>
      </footer>
    </div>
  )
}

export default App
