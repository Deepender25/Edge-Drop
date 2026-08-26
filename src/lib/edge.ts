/**
 * Renderer-side access to the preload bridge.
 *
 * `window.edge` is injected by the preload script via contextBridge. We type it
 * from the shared `EdgeApi` contract so the rest of the renderer code gets full
 * autocomplete and type-safety without importing anything Electron-specific.
 */
import type { EdgeApi } from '../../shared/bridge'

declare global {
  interface Window {
    edge: EdgeApi
  }
}

export const edge: EdgeApi = new Proxy({} as EdgeApi, {
  get(_target, prop) {
    const g = globalThis as any
    if (g.window && g.window.edge) {
      const targetApi = g.window.edge
      const val = targetApi[prop]
      if (typeof val === 'function') return val.bind(targetApi)
      if (val !== undefined) return val
      return () => {}
    }
    return () => {}
  }
})
