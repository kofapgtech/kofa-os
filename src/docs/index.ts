/** The docs content layer.
 *
 *  Articles are plain markdown files in ./articles, bundled at build time by
 *  Vite's glob import — no database, no fetch, no loading state. That is a
 *  deliberate trade: editing a doc means a commit and a deploy, but in exchange
 *  the docs are versioned alongside the code they describe, search can run over
 *  the full text with zero infrastructure, and a broken link is a build-time
 *  problem rather than a 404 a reader finds first.
 *
 *  Each file carries a small frontmatter block:
 *
 *    ---
 *    title: My work
 *    section: Daily work
 *    order: 10
 *    roles: all
 *    summary: One line shown under the title and in search results.
 *    ---
 *
 *  The slug is the filename, so ./articles/my-work.md is /docs/my-work. */

export type DocGate =
  | 'all'
  | 'leadership'
  | 'payroll'
  | 'finance'
  | 'hr'
  | 'admin'
  | 'admin-full'
  | 'workstreams'
  | 'owner'
  | 'timesheet-approvals'
  | 'non-contractor'

export interface Doc {
  slug: string
  title: string
  section: string
  /** Position within the section. Lower first; ties fall back to title. */
  order: number
  summary: string
  /** Any one of these gates passing is enough to see the article.
   *  ['all'] means everybody. */
  roles: DocGate[]
  /** Markdown body, frontmatter stripped. */
  body: string
  /** Lowercased title + summary + body, kept once so search doesn't rebuild it
   *  on every keystroke. */
  haystack: string
}

/** Section order in the sidebar. A section not listed here still renders, but
 *  after all the known ones, alphabetically. */
export const SECTION_ORDER = [
  'Start here',
  'Core concepts',
  'Daily work',
  'Approvals and money',
  'Clients',
  'Administration',
  'Your account',
  'Help',
] as const

const GATES: readonly DocGate[] = [
  'all',
  'leadership',
  'payroll',
  'finance',
  'hr',
  'admin',
  'admin-full',
  'workstreams',
  'owner',
  'timesheet-approvals',
  'non-contractor',
]

/** Human labels for the badge shown next to a gated article. */
export const GATE_LABELS: Record<DocGate, string> = {
  all: '',
  leadership: 'Leadership',
  payroll: 'Payroll',
  finance: 'Finance',
  hr: 'HR',
  admin: 'Admin',
  'admin-full': 'Admin',
  workstreams: 'Admin',
  owner: 'Owner',
  'timesheet-approvals': 'Approvers',
  // Everyone except contractors — not worth a badge, since the people who
  // would see it are exactly the people it does not exclude.
  'non-contractor': '',
}

interface Frontmatter {
  [key: string]: string
}

/** Deliberately minimal: `key: value` lines between two `---` fences, no
 *  nesting, no quoting rules, no YAML dependency. Anything the docs need
 *  beyond that belongs in the body. */
function splitFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!text.startsWith('---\n')) return { data: {}, body: text }

  const end = text.indexOf('\n---', 3)
  if (end === -1) return { data: {}, body: text }

  const data: Frontmatter = {}
  for (const line of text.slice(4, end).split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    // Surrounding quotes are stripped, so a value containing a colon can be
    // written `title: "Payroll: payment"` without the quotes reaching the page.
    const value = line.slice(colon + 1).trim()
    data[line.slice(0, colon).trim()] =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value
  }

  // Skip past the closing fence and the newline after it.
  const bodyStart = text.indexOf('\n', end + 1)
  return { data, body: bodyStart === -1 ? '' : text.slice(bodyStart + 1) }
}

function parseRoles(value: string | undefined): DocGate[] {
  if (!value) return ['all']
  const parsed = value
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is DocGate => (GATES as readonly string[]).includes(r))
  return parsed.length ? parsed : ['all']
}

const MODULES = import.meta.glob('./articles/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function build(): Doc[] {
  const docs = Object.entries(MODULES).map(([path, raw]) => {
    const slug = path.replace(/^.*\//, '').replace(/\.md$/, '')
    const { data, body } = splitFrontmatter(raw)
    const title = data.title || slug
    const summary = data.summary || ''
    return {
      slug,
      title,
      section: data.section || 'Help',
      order: Number(data.order) || 999,
      summary,
      roles: parseRoles(data.roles),
      body,
      haystack: `${title}\n${summary}\n${body}`.toLowerCase(),
    } satisfies Doc
  })

  return docs.sort((a, b) => {
    const sa = SECTION_ORDER.indexOf(a.section as (typeof SECTION_ORDER)[number])
    const sb = SECTION_ORDER.indexOf(b.section as (typeof SECTION_ORDER)[number])
    const ra = sa === -1 ? SECTION_ORDER.length : sa
    const rb = sb === -1 ? SECTION_ORDER.length : sb
    if (ra !== rb) return ra - rb
    if (a.section !== b.section) return a.section.localeCompare(b.section)
    if (a.order !== b.order) return a.order - b.order
    return a.title.localeCompare(b.title)
  })
}

export const DOCS: Doc[] = build()

export const DOCS_BY_SLUG: Record<string, Doc> = Object.fromEntries(
  DOCS.map((d) => [d.slug, d]),
)

/** Every slug referenced by a `?` icon or an in-article link should exist here;
 *  the docs test in Docs.tsx surfaces the ones that don't in development. */
export function docExists(slug: string): boolean {
  return slug in DOCS_BY_SLUG
}

export interface DocSection {
  name: string
  docs: Doc[]
}

/** DOCS is already sorted, so grouping preserves both orders. */
export function groupBySection(docs: Doc[]): DocSection[] {
  const out: DocSection[] = []
  for (const doc of docs) {
    const last = out[out.length - 1]
    if (last && last.name === doc.section) last.docs.push(doc)
    else out.push({ name: doc.section, docs: [doc] })
  }
  return out
}
