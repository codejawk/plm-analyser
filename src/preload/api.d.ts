import type { OrchestratorApi } from '../shared/types'

declare global {
  interface Window {
    api: OrchestratorApi
  }
}

export {}
