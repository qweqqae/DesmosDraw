// github - https://github.com/qweqqae
declare module 'desmos' {
  export interface DesmosCalculator {
    setExpressions: (expressions: unknown[]) => void
    setExpression: (expression: unknown) => void
    setBlank: () => void
    setMathBounds: (bounds: {
      left: number
      right: number
      bottom: number
      top: number
    }) => void
    resize: () => void
    destroy: () => void
  }

  const Desmos: {
    GraphingCalculator: (
      element: HTMLElement,
      options?: Record<string, unknown>,
    ) => DesmosCalculator
  }

  export default Desmos
}
