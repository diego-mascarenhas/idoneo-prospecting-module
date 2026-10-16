import { getProspectingClient } from './http'
import type {
  ProspectAccess,
  ProspectImportResult,
  ProspectPerson,
  ProspectSearchFilters,
  ProspectSearchResult,
} from './types'

export const prospectingQueryKey = ['prospecting'] as const

export function fetchProspectAccess(): Promise<ProspectAccess> {
  const { request, paths } = getProspectingClient()
  return request<ProspectAccess>(paths.index)
}

export async function searchProspects(filters: ProspectSearchFilters): Promise<ProspectSearchResult> {
  const { request, paths } = getProspectingClient()
  const result = await request<ProspectSearchResult>(paths.search, {
    method: 'POST',
    body: filters,
  })

  return {
    ...result,
    people: result.people.map((person) => ({ ...person, search_id: result.search_id })),
  }
}

export function importProspects(payload: {
  people: ProspectPerson[]
  category_id?: number
}): Promise<ProspectImportResult> {
  const { request, paths } = getProspectingClient()
  return request<ProspectImportResult>(paths.import, {
    method: 'POST',
    body: payload,
  })
}
