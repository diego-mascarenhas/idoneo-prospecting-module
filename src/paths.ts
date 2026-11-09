export type ProspectingPaths = {
  index: string
  search: string
  import: string
  importFilters: string
}

export const defaultProspectingPaths: ProspectingPaths = {
  index: '/mailer/prospects',
  search: '/mailer/prospects/search',
  import: '/mailer/prospects/import',
  importFilters: '/mailer/prospects/imports',
}
