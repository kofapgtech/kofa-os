import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, LifeBuoy, ListTree } from 'lucide-react'
import { DOCS_BY_SLUG, GATE_LABELS, groupBySection, type Doc } from '@/docs'
import { useDocAccess } from '@/docs/access'
import { DocsSidebar, RoleBadge } from '@/components/docs/DocsSidebar'
import { Markdown, extractHeadings } from '@/components/docs/Markdown'
import { EmptyState } from '@/components/ui'
import { SUPPORT_EMAIL, SUPPORT_ROUTE } from '@/lib/support'

/** The docs live inside the authenticated shell rather than as a separate site.
 *  That buys three things for free: the reader is already identified, so
 *  articles about screens they can't reach are filtered out instead of
 *  taunting them; every `?` icon in the app is a plain router link; and the
 *  docs inherit the app's chrome, so they read as part of KofaOS rather than a
 *  manual bolted to the side of it. */
export function Docs() {
  const { slug } = useParams()
  const { visibleDocs } = useDocAccess()

  const doc = slug ? DOCS_BY_SLUG[slug] : undefined
  const readable = doc && visibleDocs.some((d) => d.slug === doc.slug)

  return (
    <div className="mx-auto flex max-w-[86rem] flex-col gap-6 lg:flex-row">
      {/* Docs nav. Sticky under the 4rem app header on desktop; on mobile it
          sits above the article, which keeps it reachable without a second
          drawer competing with the app's own. */}
      <aside className="w-full shrink-0 lg:sticky lg:top-[5rem] lg:max-h-[calc(100vh-7rem)] lg:w-60 lg:overflow-y-auto lg:pr-1">
        <Link
          to="/docs"
          className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900 hover:text-brand-700"
        >
          <BookOpen size={16} className="text-brand-600" />
          KofaOS docs
        </Link>
        <DocsSidebar docs={visibleDocs} />
      </aside>

      <div className="min-w-0 flex-1">
        {!slug ? (
          <DocsHome docs={visibleDocs} />
        ) : !doc ? (
          <NotFound slug={slug} />
        ) : !readable ? (
          <Restricted doc={doc} />
        ) : (
          <Article doc={doc} docs={visibleDocs} />
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ landing

function DocsHome({ docs }: { docs: Doc[] }) {
  const sections = useMemo(() => groupBySection(docs), [docs])

  return (
    <div>
      <div className="card mb-6 bg-brand-700 p-6 text-cream-50">
        <h1 className="text-2xl font-semibold">How KofaOS works</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-cream-200/90">
          A guide to every part of the app — what each screen is for, who can see it, and how the
          pieces fit together. You're only shown the articles that match what your account can
          actually reach.
        </p>
      </div>

      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.name}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
              {section.name}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {section.docs.map((doc) => (
                <Link
                  key={doc.slug}
                  to={`/docs/${doc.slug}`}
                  className="card p-4 transition-colors hover:border-brand-300 hover:bg-cream-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-ink-900">{doc.title}</p>
                    <RoleBadge doc={doc} />
                  </div>
                  {doc.summary && (
                    <p className="mt-1 text-sm leading-6 text-ink-500">{doc.summary}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <SupportFooter />
    </div>
  )
}

// ------------------------------------------------------------------ article

function Article({ doc, docs }: { doc: Doc; docs: Doc[] }) {
  const headings = useMemo(() => extractHeadings(doc.body), [doc.body])
  const index = docs.findIndex((d) => d.slug === doc.slug)
  const prev = index > 0 ? docs[index - 1] : null
  const next = index >= 0 && index < docs.length - 1 ? docs[index + 1] : null

  return (
    <div className="flex gap-8">
      <article className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{doc.section}</p>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold text-ink-900">
          {doc.title}
          <RoleBadge doc={doc} />
        </h1>
        {doc.summary && <p className="mt-2 text-[15px] leading-7 text-ink-500">{doc.summary}</p>}

        <div className="mt-6">
          <Markdown body={doc.body} />
        </div>

        {(prev || next) && (
          <div className="mt-10 grid gap-3 border-t border-cream-300 pt-5 sm:grid-cols-2">
            {prev ? (
              <Link to={`/docs/${prev.slug}`} className="card p-3 hover:border-brand-300">
                <p className="flex items-center gap-1.5 text-xs text-ink-400">
                  <ArrowLeft size={12} /> Previous
                </p>
                <p className="mt-0.5 text-sm font-medium text-ink-800">{prev.title}</p>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={`/docs/${next.slug}`} className="card p-3 text-right hover:border-brand-300">
                <p className="flex items-center justify-end gap-1.5 text-xs text-ink-400">
                  Next <ArrowRight size={12} />
                </p>
                <p className="mt-0.5 text-sm font-medium text-ink-800">{next.title}</p>
              </Link>
            )}
          </div>
        )}

        <SupportFooter />
      </article>

      {/* On this page. Hidden below xl, where the column would squeeze the
          prose past comfortable reading width. */}
      {headings.length > 2 && (
        <aside className="hidden w-48 shrink-0 xl:block">
          <div className="sticky top-[5rem]">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              <ListTree size={12} /> On this page
            </p>
            <ul className="space-y-1 border-l border-cream-300">
              {headings.map((h) => (
                <li key={h.id}>
                  <a
                    href={`#${h.id}`}
                    className={`block border-l-2 border-transparent py-0.5 text-sm text-ink-500 hover:border-brand-400 hover:text-brand-700 ${
                      h.level === 3 ? 'pl-6' : 'pl-3'
                    }`}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ states

function NotFound({ slug }: { slug: string }) {
  return (
    <div className="card p-8">
      <EmptyState
        title="No such article"
        hint={`Nothing here is filed under "${slug}". Try the search box, or start from the docs home.`}
      />
      <div className="mt-4 flex justify-center">
        <Link to="/docs" className="btn-ghost">
          <BookOpen size={15} /> Docs home
        </Link>
      </div>
    </div>
  )
}

/** Reached by deep-linking to an article your role can't see — a colleague
 *  pasting a link, usually. Says so plainly rather than pretending the article
 *  doesn't exist, because the reader can then ask the right person for access
 *  instead of assuming the link was wrong. */
function Restricted({ doc }: { doc: Doc }) {
  const label = doc.roles.map((r) => GATE_LABELS[r]).find(Boolean) ?? 'restricted'
  return (
    <div className="card p-8">
      <EmptyState
        title={`"${doc.title}" isn't part of your access`}
        hint={`This article covers a ${label.toLowerCase()} screen. If you think you should have it, ask an admin to check your role.`}
      />
      <div className="mt-4 flex justify-center">
        <Link to="/docs" className="btn-ghost">
          <BookOpen size={15} /> Back to the docs
        </Link>
      </div>
    </div>
  )
}

function SupportFooter() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-cream-300 bg-cream-200/60 px-4 py-3">
      <LifeBuoy size={17} className="text-ink-500" />
      <p className="min-w-0 flex-1 text-sm text-ink-600">
        Still stuck, or something here is out of date?
      </p>
      {SUPPORT_ROUTE ? (
        <Link to={SUPPORT_ROUTE} className="btn-ghost !min-h-0 !py-1.5 text-sm">
          Submit a ticket
        </Link>
      ) : (
        <a href={`mailto:${SUPPORT_EMAIL}`} className="btn-ghost !min-h-0 !py-1.5 text-sm">
          Email {SUPPORT_EMAIL}
        </a>
      )}
    </div>
  )
}
