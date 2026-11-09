'use client'

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchProspectAccess, importProspects, prospectingQueryKey, queueProspectImport, searchProspects } from './api'
import { InfoIcon, MailIcon, PhoneIcon, SearchIcon, SpinnerIcon, UploadIcon } from './icons'
import type { ProspectImportResult, ProspectList, ProspectPerson, ProspectSearchFilters } from './types'

const PAGE_SIZE = 25

const SENIORITIES = [
  { value: 'owner', label: 'Owner' },
  { value: 'founder', label: 'Founder' },
  { value: 'c_suite', label: 'C-Suite' },
  { value: 'vp', label: 'VP' },
  { value: 'head', label: 'Head' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior', label: 'Senior' },
  { value: 'entry', label: 'Entry' },
  { value: 'intern', label: 'Intern' },
]

const cardClass =
  'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-solid)] p-5 shadow-[var(--shadow-soft)]'
const fieldClass =
  'w-full rounded-2xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-[var(--accent)]'

export type ProspectListField = {
  value: string
  onChange: (value: string) => void
  creating: boolean
  onCreate: (name: string) => void
  options: Array<{ value: string; label: string }>
}

function ListSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) {
      return
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Lista"
        onClick={() => setOpen((current) => !current)}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate text-[var(--text)]">{selected?.label ?? 'Sin lista'}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-[var(--muted)] transition ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-1 shadow-[var(--shadow)]"
        >
          {options.map((option) => {
            const active = option.value === value

            return (
              <li key={option.value || 'none'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={[
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm',
                    active
                      ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent-strong)]'
                      : 'text-[var(--text)] hover:bg-[var(--chip)]',
                  ].join(' ')}
                >
                  <span className="truncate">{option.label}</span>
                  {active && (
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function errorText(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback
}

function personName(person: ProspectPerson): string {
  const last = person.last_name || person.last_name_obfuscated || ''
  return `${person.first_name ?? ''} ${last}`.trim() || '—'
}

function flagYes(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || (typeof value === 'string' && value.toLowerCase() === 'yes')
}

function sourceHasPhone(source: Record<string, unknown>): boolean {
  if (flagYes(source.has_direct_phone) || flagYes(source.has_phone)) {
    return true
  }
  for (const key of ['phone', 'sanitized_phone', 'primary_phone']) {
    const phone = source[key]
    if (typeof phone === 'string' && phone.trim()) {
      return true
    }
    if (phone && typeof phone === 'object' && !Array.isArray(phone)) {
      const number = (phone as { number?: unknown; sanitized_number?: unknown }).number
        ?? (phone as { sanitized_number?: unknown }).sanitized_number
      if (typeof number === 'string' && number.trim()) {
        return true
      }
    }
  }
  for (const key of ['phone_numbers', 'contact_phone_numbers']) {
    const numbers = source[key]
    if (Array.isArray(numbers) && numbers.length > 0) {
      return true
    }
  }
  return false
}

function personHasEmail(person: ProspectPerson): boolean {
  const raw = person.apollo_raw ?? {}
  if (flagYes(person.has_email) || flagYes(raw.has_email)) {
    return true
  }
  for (const value of [raw.email, raw.primary_email, raw.sanitized_email]) {
    if (typeof value === 'string' && value.includes('@')) {
      return true
    }
  }
  return false
}

function serverChannels(
  email: boolean,
  phone: boolean,
  rest: boolean,
): Array<'email' | 'phone' | 'rest'> | undefined {
  if ((email && phone && rest) || (!email && !phone && !rest)) {
    return undefined
  }
  const channels: Array<'email' | 'phone' | 'rest'> = []
  if (email) {
    channels.push('email')
  }
  if (phone) {
    channels.push('phone')
  }
  if (rest) {
    channels.push('rest')
  }
  return channels
}

function channelNotice(email: boolean, phone: boolean, rest: boolean): string | null {
  if (!email && !phone && !rest) {
    return null
  }
  if (email && phone && rest) {
    return 'Toda la búsqueda se importa en el servidor. Podés cerrar la página después de confirmar.'
  }
  if (email && phone) {
    return 'Se importan en el servidor las personas con email o teléfono. Podés cerrar la página después de confirmar.'
  }
  if (email) {
    return 'Se importan en el servidor las personas con email. Podés cerrar la página después de confirmar.'
  }
  if (phone) {
    return 'Se importan en el servidor las personas con teléfono. Podés cerrar la página después de confirmar.'
  }
  return 'Se importan en el servidor las personas sin email ni teléfono. Podés cerrar la página después de confirmar.'
}

function channelSummary(email: boolean, phone: boolean, rest: boolean): string {
  if (email && phone && rest) {
    return 'Toda la búsqueda, en el servidor'
  }
  if (email && phone) {
    return 'Con email o teléfono, en el servidor'
  }
  if (email) {
    return 'Con email, en el servidor'
  }
  if (phone) {
    return 'Con teléfono, en el servidor'
  }
  return 'Sin email ni teléfono, en el servidor'
}

function personHasPhone(person: ProspectPerson): boolean {
  const raw = person.apollo_raw ?? {}
  const sources = [raw, person as unknown as Record<string, unknown>]
  for (const key of ['contact', 'organization']) {
    const nested = raw[key]
    if (nested && typeof nested === 'object') {
      sources.push(nested as Record<string, unknown>)
    }
  }
  return sources.some((source) => sourceHasPhone(source))
}

async function importInChunks(people: ProspectPerson[], categoryId?: number): Promise<ProspectImportResult> {
  let imported: ProspectImportResult['imported'] = []
  let skipped = 0
  let message: string | null = null
  let credits = 0

  for (let index = 0; index < people.length; index += PAGE_SIZE) {
    const remainingAfterChunk = Math.max(0, people.length - index - PAGE_SIZE)
    try {
      const result = await importProspects({
        people: people.slice(index, index + PAGE_SIZE),
        category_id: categoryId,
      })
      imported = imported.concat(result.imported)
      credits = result.credits
      if (result.skipped > 0) {
        skipped += result.skipped + remainingAfterChunk
        message = result.message
        break
      }
    } catch (caught) {
      if (imported.length === 0) {
        throw caught
      }
      skipped += people.length - index
      message = errorText(caught, 'No se pudo importar el resto.')
      break
    }
  }

  return { message, imported, skipped, credits }
}

function Banner({
  tone,
  children,
}: {
  tone: 'info' | 'danger'
  children: ReactNode
}) {
  const info = tone === 'info'
  return (
    <div
      role={info ? 'status' : 'alert'}
      className={`flex items-start gap-2.5 rounded-2xl px-3 py-2.5 text-sm ${
        info
          ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
          : 'bg-[var(--danger-soft)] text-[var(--danger)]'
      }`}
    >
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function ProspectSearch({
  description = 'Encontrá personas por cargo, ubicación y empresa e importalas como contactos.',
  lists = [],
  onCreateList,
  renderList,
  fallbackLocked = false,
  fallbackReason = 'Disponible al contratar el plan.',
  invalidateKeys = [],
}: {
  description?: string
  lists?: ProspectList[]
  onCreateList?: (name: string) => Promise<ProspectList | void>
  renderList?: (field: ProspectListField) => ReactNode
  fallbackLocked?: boolean
  fallbackReason?: string
  invalidateKeys?: QueryKey[]
}) {
  const queryClient = useQueryClient()
  const access = useQuery({
    queryKey: prospectingQueryKey,
    queryFn: fetchProspectAccess,
  })
  const locked = access.data ? !access.data.enabled : fallbackLocked
  const lockedReason = access.data?.reason ?? fallbackReason
  const showList = Boolean(renderList || onCreateList || lists.length > 0)
  const [titles, setTitles] = useState('')
  const [locations, setLocations] = useState('')
  const [domains, setDomains] = useState('')
  const [orgLocations, setOrgLocations] = useState('')
  const [keywords, setKeywords] = useState('')
  const [seniorities, setSeniorities] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [createdLists, setCreatedLists] = useState<ProspectList[]>([])
  const [creatingList, setCreatingList] = useState(false)
  const [people, setPeople] = useState<ProspectPerson[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Record<string, ProspectPerson>>({})
  const [selectEmail, setSelectEmail] = useState(false)
  const [selectPhone, setSelectPhone] = useState(false)
  const [selectRest, setSelectRest] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState<ProspectSearchFilters | null>(null)
  const mounted = useRef(true)
  const creditsReady = useRef(false)
  const [creditsLeft, setCreditsLeft] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const listOptions = [...createdLists, ...lists].filter(
    (list, index, all) => all.findIndex((item) => item.id === list.id) === index,
  )
  const listField: ProspectListField = {
    value: categoryId,
    onChange: setCategoryId,
    creating: creatingList,
    onCreate: (name) => {
      void createList(name)
    },
    options: [
      { value: '', label: 'Sin lista' },
      ...listOptions.map((list) => ({ value: String(list.id), label: list.name })),
    ],
  }

  async function createList(name: string) {
    if (!onCreateList) {
      return
    }
    setCreatingList(true)
    setError(null)
    try {
      const created = await onCreateList(name)
      if (created) {
        setCreatedLists((current) => [created, ...current])
        setCategoryId(String(created.id))
      }
    } catch (caught) {
      setError(errorText(caught, 'No se pudo crear la lista.'))
    } finally {
      setCreatingList(false)
    }
  }

  const filters = {
    person_titles: splitList(titles),
    person_locations: splitList(locations),
    person_seniorities: seniorities,
    q_organization_domains_list: splitList(domains),
    organization_locations: splitList(orgLocations),
    q_keywords: keywords.trim() || undefined,
  }
  const hasFilters = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  )

  const search = useMutation({
    mutationFn: (variables: { page: number; reset?: boolean; filters: ProspectSearchFilters }) =>
      searchProspects({ ...variables.filters, page: variables.page }),
    onSuccess: (result, variables) => {
      setPeople(result.people)
      setTotal(result.total_entries)
      setPage(result.page)
      setCreditsLeft(result.credits)
      setAppliedFilters(variables.filters)
      if (variables.reset) {
        setPicked({})
        setSelectEmail(false)
        setSelectPhone(false)
        setSelectRest(false)
        setNotice(null)
      }
      setSearched(true)
      setError(null)
    },
    onError: (caught) => {
      setError(errorText(caught, 'No se pudo buscar.'))
    },
  })

  const queue = useMutation({
    mutationFn: () =>
      queueProspectImport({
        ...(appliedFilters ?? {}),
        category_id: categoryId ? Number(categoryId) : undefined,
        channels: serverChannels(selectEmail, selectPhone, selectRest),
      }),
    onSuccess: (result) => {
      setNotice(result.message)
      setPicked({})
      setSelectEmail(false)
      setSelectPhone(false)
      setSelectRest(false)
      setError(null)
    },
    onError: (caught) => {
      setError(errorText(caught, 'No se pudo encolar la importación.'))
    },
  })

  const upload = useMutation({
    mutationFn: () =>
      importInChunks(Object.values(picked), categoryId ? Number(categoryId) : undefined),
    onSuccess: async (result) => {
      setCreditsLeft(result.credits)
      setPicked({})
      setSelectEmail(false)
      setSelectPhone(false)
      setSelectRest(false)
      const imported = result.imported.length
      const withoutEmail = result.imported.filter((person) => !person.email).length
      const parts = [
        imported === 1 ? 'Se importó 1 contacto.' : `Se importaron ${imported} contactos.`,
      ]
      if (withoutEmail > 0) {
        parts.push(
          withoutEmail === 1
            ? '1 no tiene email y no entra en la audiencia.'
            : `${withoutEmail} no tienen email y no entran en la audiencia.`,
        )
      }
      if (result.skipped > 0) {
        parts.push(result.message ?? 'Algunos contactos no se importaron.')
      }
      setNotice(parts.join(' '))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: prospectingQueryKey })
      for (const queryKey of invalidateKeys) {
        await queryClient.invalidateQueries({ queryKey })
      }
    },
    onError: (caught) => {
      setError(errorText(caught, 'No se pudo importar.'))
    },
  })

  const pending = search.isPending || upload.isPending || queue.isPending
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (access.data && !creditsReady.current) {
      creditsReady.current = true
      setCreditsLeft(access.data.credits)
    }
  }, [access.data])

  function toggleSeniority(value: string) {
    setSeniorities((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )
  }

  function togglePerson(person: ProspectPerson) {
    setSelectEmail(false)
    setSelectPhone(false)
    setSelectRest(false)
    setPicked((current) => {
      if (current[person.id]) {
        const next = { ...current }
        delete next[person.id]
        return next
      }
      return { ...current, [person.id]: person }
    })
  }

  const selectedPeople = Object.values(picked)
  const selectedCount = selectedPeople.length
  const selectedEmailCount = selectedPeople.filter((person) => personHasEmail(person)).length
  const selectedPhoneCount = selectedPeople.filter((person) => personHasPhone(person)).length
  const bulkImport = selectEmail || selectPhone || selectRest
  const selectionSubtitle = bulkImport
    ? channelSummary(selectEmail, selectPhone, selectRest)
    : [
        selectedCount === 0 ? 'Nada seleccionado' : selectedCount === 1 ? '1 seleccionado' : `${selectedCount} seleccionados`,
        selectedEmailCount === 0 ? null : selectedEmailCount === 1 ? '1 con email' : `${selectedEmailCount} con email`,
        selectedPhoneCount === 0 ? null : selectedPhoneCount === 1 ? '1 con teléfono' : `${selectedPhoneCount} con teléfono`,
      ]
        .filter(Boolean)
        .join(' · ')

  function toggleChannel(channel: 'all' | 'email' | 'phone') {
    let email = selectEmail
    let phone = selectPhone
    let rest = selectRest
    if (channel === 'all') {
      const next = !(email && phone && rest)
      email = next
      phone = next
      rest = next
    } else if (channel === 'email') {
      email = !email
      if (!email) {
        rest = false
      }
    } else {
      phone = !phone
      if (!phone) {
        rest = false
      }
    }
    setSelectEmail(email)
    setSelectPhone(phone)
    setSelectRest(rest)
    setPicked({})
    setNotice(channelNotice(email, phone, rest))
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-semibold">Prospecting</h1>
          <button
            type="button"
            disabled={pending || (bulkImport ? !appliedFilters : selectedCount < 1)}
            onClick={() => {
              if (bulkImport) {
                queue.mutate()
                return
              }
              upload.mutate()
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {upload.isPending || queue.isPending ? <SpinnerIcon className="h-4 w-4" /> : <UploadIcon className="h-4 w-4" />}
            {bulkImport ? 'Importar búsqueda' : 'Importar'}
          </button>
        </div>
        <p className="mt-1 text-[var(--muted)]">{description}</p>
      </div>
      {locked ? (
        <Banner tone="info">{lockedReason}</Banner>
      ) : (
        <>
          {error && <Banner tone="danger">{error}</Banner>}
          {notice && <Banner tone="info">{notice}</Banner>}
          <div className="mt-4 grid items-start gap-4 md:grid-cols-12">
            <div className="md:col-span-4">
              <div className={`${cardClass} space-y-4`}>
                <h2 className="font-display text-lg font-semibold">Búsqueda</h2>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[var(--muted)]">Títulos</span>
                  <input
                    value={titles}
                    onChange={(event) => setTitles(event.target.value)}
                    placeholder="director comercial, gerente de ventas"
                    className={fieldClass}
                  />
                </label>
                <div className="grid gap-3">
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-[var(--muted)]">Ubicación de la persona</span>
                    <input
                      value={locations}
                      onChange={(event) => setLocations(event.target.value)}
                      placeholder="Buenos Aires, Argentina"
                      className={fieldClass}
                    />
                  </label>
                  <div className="text-sm">
                    <span className="mb-1.5 block text-[var(--muted)]">Posición</span>
                    <div className="flex flex-wrap gap-1.5">
                      {SENIORITIES.map((item) => {
                        const active = seniorities.includes(item.value)
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => toggleSeniority(item.value)}
                            className={[
                              'rounded-full px-2.5 py-1 text-xs font-medium',
                              active
                                ? 'bg-[var(--accent)] text-white'
                                : 'border border-[var(--border)] bg-[var(--chip)] text-[var(--muted)]',
                            ].join(' ')}
                          >
                            {item.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-[var(--muted)]">Dominios de la empresa</span>
                    <input
                      value={domains}
                      onChange={(event) => setDomains(event.target.value)}
                      placeholder="empresa.com"
                      className={fieldClass}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-[var(--muted)]">Ubicación de la empresa</span>
                    <input
                      value={orgLocations}
                      onChange={(event) => setOrgLocations(event.target.value)}
                      placeholder="California"
                      className={fieldClass}
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[var(--muted)]">Palabras clave</span>
                  <input
                    value={keywords}
                    onChange={(event) => setKeywords(event.target.value)}
                    placeholder="tecnología, software"
                    className={fieldClass}
                  />
                </label>
                {showList && (
                  <div className="block text-sm">
                    <span className="mb-1.5 block text-[var(--muted)]">Lista</span>
                    {renderList ? (
                      renderList(listField)
                    ) : (
                      <ListSelect value={categoryId} onChange={setCategoryId} options={listField.options} />
                    )}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!hasFilters || pending}
                  onClick={() => search.mutate({ page: 1, reset: true, filters })}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
                >
                  {search.isPending ? <SpinnerIcon className="h-4 w-4" /> : <SearchIcon className="h-4 w-4" />}
                  {search.isPending ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
            </div>
            <div className="md:col-span-8">
              <div className={cardClass}>
                {searched ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="font-display text-lg font-semibold">
                          {total === 0 ? 'Ningún registro' : total === 1 ? '1 registro' : `${total} registros`}
                        </h2>
                        <p className="text-sm font-normal text-[var(--muted)]">{selectionSubtitle}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {people.length > 0 &&
                          (
                            [
                              ['all', 'Todos', selectEmail && selectPhone && selectRest],
                              ['email', 'Email', selectEmail],
                              ['phone', 'Teléfono', selectPhone],
                            ] as const
                          ).map(([channel, label, active]) => (
                            <button
                              key={channel}
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                void toggleChannel(channel)
                              }}
                              className={[
                                'rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-60',
                                active
                                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                  : 'border-[var(--border)] bg-[var(--chip)] text-[var(--muted)]',
                              ].join(' ')}
                            >
                              {label}
                            </button>
                          ))}
                      </div>
                    </div>
                    {people.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">
                        No hay personas con estos filtros. Añadí títulos o palabras clave.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-sm">
                          <thead>
                            <tr className="text-xs uppercase tracking-wide text-[var(--muted)]">
                              <th className="pb-2 font-medium">Contacto</th>
                              <th className="pb-2 text-right font-medium">Canales</th>
                            </tr>
                          </thead>
                          <tbody>
                            {people.map((person) => {
                              const checked = Boolean(picked[person.id])
                              return (
                                <tr key={person.id} className="border-t border-[var(--border)]">
                                  <td className="py-3">
                                    <label className="flex cursor-pointer items-start gap-3">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => togglePerson(person)}
                                        className="mt-1"
                                      />
                                      <span className="min-w-0">
                                        <span className="block truncate font-medium">{personName(person)}</span>
                                        <span className="block truncate text-xs text-[var(--muted)]">
                                          {[person.title, person.organization_name].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                      </span>
                                    </label>
                                  </td>
                                  <td className="py-3">
                                    <span className="ml-auto grid w-max grid-cols-2 gap-1.5 text-[var(--accent-strong)]">
                                      <span className="flex h-4 w-4 items-center justify-center" title={personHasEmail(person) ? 'Tiene email' : undefined}>
                                        {personHasEmail(person) ? <MailIcon className="h-4 w-4" /> : null}
                                      </span>
                                      <span className="flex h-4 w-4 items-center justify-center" title={personHasPhone(person) ? 'Tiene teléfono' : undefined}>
                                        {personHasPhone(person) ? <PhoneIcon className="h-4 w-4" /> : null}
                                      </span>
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {total > people.length && (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={page <= 1 || pending || !appliedFilters}
                          onClick={() => {
                            if (appliedFilters) {
                              search.mutate({ page: page - 1, filters: appliedFilters })
                            }
                          }}
                          className="rounded-2xl border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          disabled={page * PAGE_SIZE >= total || pending || !appliedFilters}
                          onClick={() => {
                            if (appliedFilters) {
                              search.mutate({ page: page + 1, filters: appliedFilters })
                            }
                          }}
                          className="rounded-2xl border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
                        >
                          Siguiente
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <h2 className="mb-4 font-display text-lg font-semibold">Resultados</h2>
                    <p className="text-sm text-[var(--muted)]">Los resultados aparecen aquí.</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
