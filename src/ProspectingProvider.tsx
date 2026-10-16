'use client'

import { useMemo, type ReactNode } from 'react'
import { configureProspecting, type ProspectingRequest } from './http'
import { defaultProspectingPaths, type ProspectingPaths } from './paths'

function messageFromBody(data: unknown, status: number): string {
  if (typeof data === 'object' && data) {
    if ('message' in data && data.message != null) {
      return String(data.message)
    }
  }

  return `Request failed (${status})`
}

function createRequest(getToken: () => string | null, baseUrl: string): ProspectingRequest {
  const root = baseUrl.replace(/\/$/, '')

  return async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const token = getToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${root}${path.startsWith('/') ? path : `/${path}`}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
    const text = await response.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    if (!response.ok) {
      throw new Error(messageFromBody(data, response.status))
    }

    return data as T
  }
}

export function ProspectingProvider({
  getToken,
  baseUrl = 'https://cms8.test/api',
  paths = defaultProspectingPaths,
  children,
}: {
  getToken: () => string | null
  baseUrl?: string
  paths?: ProspectingPaths
  children: ReactNode
}) {
  useMemo(() => {
    configureProspecting({
      request: createRequest(getToken, baseUrl),
      paths,
    })
  }, [baseUrl, getToken, paths])

  return children
}
