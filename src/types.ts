export type ProspectAccess = {
  enabled: boolean
  reason: string | null
  credits: number
}

export type ProspectPerson = {
  id: string
  first_name?: string
  last_name?: string | null
  last_name_obfuscated?: string
  title?: string | null
  organization_name?: string
  has_email?: boolean
  has_phone?: boolean
  credits?: number
  search_id?: number
  apollo_raw?: Record<string, unknown>
}

export type ProspectSearchResult = {
  search_id: number
  people: ProspectPerson[]
  total_entries: number
  page: number
  per_page: number
  credits: number
}

export type ProspectImportResult = {
  message: string | null
  imported: Array<{ id: number; name: string; email: string | null }>
  skipped: number
  credits: number
}

export type ProspectSearchFilters = {
  person_titles?: string[]
  person_locations?: string[]
  person_seniorities?: string[]
  organization_locations?: string[]
  q_organization_domains_list?: string[]
  q_keywords?: string
  page?: number
}

export type ProspectList = {
  id: number
  name: string
}
