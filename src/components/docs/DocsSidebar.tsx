import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { GATE_LABELS, groupBySection, type Doc } from '@/docs'

/** Ranked substring search over title, summary and body.
 *
 *  Deliberately not an index: the corpus is a few dozen short articles already
 *  in memory, so a linear scan per keystroke is far below the threshold anyone
 *  can feel, and it costs no dependency and no build step. Revisit only if the
 *  docs grow by an order of magnitude. */
function search(docs: Doc[], query: string): Doc[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const terms = q.split(/\s+/)

  return docs
    .map((doc) => {
      let score = 0
      for (const term of terms) {
        if (!doc.haystack.includes(term)) return { doc, score: -1 }
        // A title hit is what the reader almost always meant.
        if (doc.title.toLowerCase().includes(term)) score += 10
        if (doc.summary.toLowerCase().includes(term)) score += 4
        score += 1
      }
      return { doc, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .map((r) => r.doc)
}

/** The badge that says an article covers a screen not everyone has. Only shown
 *  for articles that are gated at all — `roles: all` renders nothing. */
export function RoleBadge({ doc }: { doc: Doc }) {
  const label = doc.roles.map((r) => GATE_LABELS[r]).find(Boolean)
  if (!label) return null
  return (
    <span className="chip shrink-0 bg-cream-200 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
      {label}
    </span>
  )
}

export function DocsSidebar({ docs, onNavigate }: { docs: Doc[]; onNavigate?: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => search(docs, query), [docs, query])
  const sections = useMemo(() => groupBySection(docs), [docs])
  const searching = query.trim().length >= 2

  // Ctrl/Cmd+K focuses the box from anywhere in the docs, and Escape clears it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
      isActive ? 'bg-brand-600 font-medium text-white' : 'text-ink-600 hover:bg-cream-200'
    }`

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder="Search the docs"
          className="input !py-1.5 pl-9 pr-8 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-cream-200"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {searching ? (
        <div className="space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            {results.length} result{results.length === 1 ? '' : 's'}
          </p>
          {results.map((doc) => (
            <NavLink
              key={doc.slug}
              to={`/docs/${doc.slug}`}
              onClick={() => {
                setQuery('')
                onNavigate?.()
              }}
              className={linkClass}
            >
              <span className="min-w-0 flex-1 truncate">{doc.title}</span>
              <RoleBadge doc={doc} />
            </NavLink>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-500">
              Nothing matched. Try a word you'd see on the screen itself.
            </p>
          )}
        </div>
      ) : (
        <nav className="space-y-4">
          {sections.map((section) => (
            <div key={section.name}>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                {section.name}
              </p>
              <div className="space-y-0.5">
                {section.docs.map((doc) => (
                  <NavLink
                    key={doc.slug}
                    to={`/docs/${doc.slug}`}
                    onClick={onNavigate}
                    className={linkClass}
                  >
                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                    <RoleBadge doc={doc} />
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      )}
    </div>
  )
}
