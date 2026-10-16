import { defaultProspectingPaths, type ProspectingPaths } from './paths'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export type ProspectingRequest = <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>

type Client = {
  request: ProspectingRequest
  paths: ProspectingPaths
}

let client: Client | null = null

export function configureProspecting(next: Client): void {
  client = next
}

export function getProspectingClient(): Client {
  if (!client) {
    throw new ApiError('idoneo-prospecting-module no está configurado.', 500, null)
  }

  return client
}

export { defaultProspectingPaths }
