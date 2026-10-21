// github - https://github.com/qweqqae
import { vectorize } from './pipeline'
import type { EraseStroke, VectorOptions } from './types'

type Request = { id: number; image: ImageData; options: VectorOptions; erase: EraseStroke[] }

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null
  postMessage: (msg: unknown) => void
}

ctx.onmessage = (e) => {
  const { id, image, options, erase } = e.data
  try {
    ctx.postMessage({ id, result: vectorize(image, options, erase) })
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
