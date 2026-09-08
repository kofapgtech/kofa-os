import { Link } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { DOCS_BY_SLUG } from '@/docs'

/** The `?` next to a page title. Rendered by PageHeader whenever a page passes
 *  a `helpSlug`, so wiring a new page up is one prop rather than a layout
 *  change.
 *
 *  Renders nothing at all if the slug doesn't resolve to an article. That is on
 *  purpose: a help icon that leads to a "not found" page is worse than no icon,
 *  and it means stub slugs can be referenced before their article is written
 *  without shipping a dead end. */
export function HelpLink({ slug }: { slug: string }) {
  const doc = DOCS_BY_SLUG[slug]
  if (!doc) return null

  return (
    <Link
      to={`/docs/${slug}`}
      title={`Help: ${doc.title}`}
      aria-label={`Help: ${doc.title}`}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-cream-200 hover:text-brand-600"
    >
      <HelpCircle size={16} />
    </Link>
  )
}
