import { Fragment, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Info, Lightbulb, Lock } from 'lucide-react'

/** A small markdown renderer, written rather than installed.
 *
 *  Two reasons it is hand-rolled. First, the docs need to look like the rest of
 *  KofaOS, which means every element maps onto the app's own Tailwind classes
 *  (.card, .th/.td, the brand palette) — with a library that mapping is most of
 *  the code anyway. Second, it keeps the dependency list where it is; this
 *  renderer only has to handle the subset of markdown the docs actually use:
 *
 *    # headings (h1 comes from frontmatter, so ## and below)
 *    paragraphs, **bold**, *italic*, `code`, [links](/docs/slug), ![images](/docs/img/x.png)
 *    - bullet lists (one level of nesting) and 1. numbered lists
 *    | GFM | tables |
 *    ```fenced code```
 *    > blockquotes and > [!NOTE] / [!TIP] / [!WARNING] / [!ROLE] callouts
 *    --- rules
 *
 *  Anything outside that set renders as plain text rather than throwing, which
 *  is the right failure mode for content: a mangled paragraph is recoverable,
 *  a blank page is not. */

// ------------------------------------------------------------------ inline

/** Ordered so the greedier constructs win: code spans swallow their contents
 *  whole (so `**` inside backticks stays literal), images before links because
 *  they differ only by the leading `!`.
 *
 *  Kept as a source string and compiled fresh on each call rather than shared
 *  as one /g regex: renderInline recurses into bold and link text, and a
 *  shared regex carries `lastIndex` across those nested calls — which makes
 *  the outer loop restart mid-string and spin forever. A new regex per call
 *  costs nothing here and cannot do that. */
const INLINE_SOURCE =
  '(`[^`]+`)|!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)|\\[([^\\]]+)\\]\\(([^)\\s]+)\\)|\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*'

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const inline = new RegExp(INLINE_SOURCE, 'g')
  let last = 0
  let match: RegExpExecArray | null
  let n = 0

  while ((match = inline.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const key = `${keyPrefix}-i${n++}`
    const [, code, imgAlt, imgSrc, linkText, linkHref, bold, italic] = match

    if (code) {
      out.push(
        <code key={key} className="rounded bg-cream-200 px-1.5 py-0.5 font-mono text-[0.85em] text-ink-800">
          {code.slice(1, -1)}
        </code>,
      )
    } else if (imgSrc) {
      out.push(<DocImage key={key} src={imgSrc} alt={imgAlt ?? ''} />)
    } else if (linkHref) {
      out.push(
        <DocLink key={key} href={linkHref}>
          {renderInline(linkText, `${key}-l`)}
        </DocLink>,
      )
    } else if (bold) {
      // Recursed, not rendered flat: **[My work](/docs/my-work)** is a bold
      // link, and emphasis wrapping a link is ordinary enough in prose that
      // rendering the inner markdown literally is a visible bug.
      out.push(
        <strong key={key} className="font-semibold text-ink-900">
          {renderInline(bold, `${key}-b`)}
        </strong>,
      )
    } else if (italic) {
      out.push(
        <em key={key} className="italic">
          {renderInline(italic, `${key}-e`)}
        </em>,
      )
    }
    last = match.index + match[0].length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

/** In-app destinations go through the router so the docs never full-reload the
 *  SPA; anything with a scheme opens in a new tab. */
function DocLink({ href, children }: { href: string; children: ReactNode }) {
  const external = /^[a-z]+:/i.test(href)
  const cls = 'font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-600'

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    )
  }
  return (
    <Link to={href} className={cls}>
      {children}
    </Link>
  )
}

/** Screenshots live in /public/docs/img and are captioned by their alt text.
 *  Bordered and rounded so a screenshot of a white screen still reads as a
 *  figure against the cream page.
 *
 *  A missing file removes the whole figure rather than leaving a broken-image
 *  icon behind. That is what lets an article ship with its screenshots already
 *  referenced before anyone has taken them: the prose reads correctly on its
 *  own, and each picture appears the moment its file lands in /public/docs/img,
 *  with no edit to the article.
 *
 *  Width defaults to the full column, which is right for a screenshot of a
 *  whole screen and much too big for a tall narrow one — a side panel or a
 *  dropdown. Append `?w=<percent>` to the path to scale it down and centre it:
 *
 *    ![The task drawer](/docs/img/my-work-task-drawer.png?w=67)
 *
 *  The hint is stripped before it reaches `src`, so the file is still requested
 *  by its real name. */
function DocImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  const [path, query] = src.split('?')
  const pct = Number(new URLSearchParams(query ?? '').get('w'))
  const width = Number.isFinite(pct) && pct > 0 && pct <= 100 ? `${pct}%` : undefined

  return (
    <figure className={`my-5${width ? ' mx-auto' : ''}`} style={width ? { maxWidth: width } : undefined}>
      <img
        src={path}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full rounded-xl border border-cream-300 shadow-card"
      />
      {alt && <figcaption className="mt-2 text-xs text-ink-500">{alt}</figcaption>}
    </figure>
  )
}

// ------------------------------------------------------------------ blocks

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export interface Heading {
  id: string
  text: string
  level: number
}

/** Powers the "on this page" rail. Runs over the raw body rather than the
 *  rendered tree, and skips fenced code so a `# comment` in a snippet doesn't
 *  turn into a navigation entry. */
export function extractHeadings(body: string): Heading[] {
  const out: Heading[] = []
  let inFence = false
  for (const line of body.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{2,3})\s+(.*)$/.exec(line)
    if (m) {
      const text = m[2].trim()
      out.push({ id: slugifyHeading(text), text, level: m[1].length })
    }
  }
  return out
}

const CALLOUTS = {
  NOTE: { icon: Info, cls: 'border-brand-200 bg-brand-50 text-brand-900', iconCls: 'text-brand-600' },
  TIP: { icon: Lightbulb, cls: 'border-accent-200 bg-accent-50 text-accent-700', iconCls: 'text-accent-500' },
  WARNING: { icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50 text-amber-900', iconCls: 'text-amber-600' },
  ROLE: { icon: Lock, cls: 'border-cream-400 bg-cream-200 text-ink-700', iconCls: 'text-ink-500' },
} as const

type CalloutKind = keyof typeof CALLOUTS

function isListLine(line: string) {
  return /^\s*([-*]\s+|\d+\.\s+)/.test(line)
}

function isBlockStart(line: string) {
  const t = line.trimStart()
  return (
    t === '' ||
    t.startsWith('#') ||
    t.startsWith('>') ||
    t.startsWith('```') ||
    t.startsWith('|') ||
    /^(-{3,}|\*{3,})\s*$/.test(t) ||
    isListLine(line)
  )
}

interface ListItem {
  content: string[]
  children: ParsedList | null
}

interface ParsedList {
  ordered: boolean
  items: ListItem[]
}

/** Consumes one list block starting at `start`, including nested lists that are
 *  indented by two or more spaces. Returns where the caller should resume. */
function parseList(lines: string[], start: number, indent: number): { list: ParsedList; next: number } {
  const items: ListItem[] = []
  let ordered = false
  let i = start

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      // A blank line ends the list unless another item follows immediately.
      const next = lines[i + 1]
      if (next === undefined || !isListLine(next)) break
      i++
      continue
    }

    const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line)
    if (!m) break
    const lineIndent = m[1].length
    if (lineIndent < indent) break

    if (lineIndent > indent) {
      // Deeper marker: attach to the item we just added.
      const parent = items[items.length - 1]
      const nested = parseList(lines, i, lineIndent)
      if (parent) parent.children = nested.list
      i = nested.next
      continue
    }

    ordered = /\d/.test(m[2])
    const item: ListItem = { content: [m[3]], children: null }
    items.push(item)
    i++

    // Wrapped continuation lines belong to the item they follow.
    while (i < lines.length && lines[i].trim() !== '' && !isListLine(lines[i]) && !isBlockStart(lines[i])) {
      item.content.push(lines[i].trim())
      i++
    }
  }

  return { list: { ordered, items }, next: i }
}

function renderList(list: ParsedList, key: string): ReactNode {
  const Tag = list.ordered ? 'ol' : 'ul'
  return (
    <Tag
      key={key}
      className={`my-3 space-y-1.5 pl-5 text-[15px] leading-7 text-ink-700 ${
        list.ordered ? 'list-decimal' : 'list-disc'
      } marker:text-ink-400`}
    >
      {list.items.map((item, idx) => (
        <li key={`${key}-li${idx}`} className="pl-1">
          {renderInline(item.content.join(' '), `${key}-li${idx}`)}
          {item.children && renderList(item.children, `${key}-li${idx}-sub`)}
        </li>
      ))}
    </Tag>
  )
}

function renderTable(rows: string[], key: string): ReactNode {
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim())

  const header = cells(rows[0])
  // rows[1] is the |---|---| separator, which carries no content.
  const body = rows.slice(2).map(cells)

  return (
    <div key={key} className="card my-5 overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse">
        <thead className="border-b border-cream-300 bg-cream-100">
          <tr>
            {header.map((h, i) => (
              <th key={i} className="th">
                {renderInline(h, `${key}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="border-b border-cream-200 last:border-0">
              {row.map((cell, c) => (
                <td key={c} className="td">
                  {renderInline(cell, `${key}-r${r}c${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderQuote(lines: string[], key: string): ReactNode {
  const first = lines[0] ?? ''
  // `> [!NOTE] Optional heading` — the GitHub spelling. The heading is
  // optional; without one the callout is titled after its kind.
  const tag = /^\[!([A-Z]+)\]:?\s*(.*)$/.exec(first.trim())

  if (tag && tag[1] in CALLOUTS) {
    const kind = tag[1] as CalloutKind
    const { icon: Icon, cls, iconCls } = CALLOUTS[kind]
    const heading = tag[2]?.trim() || (kind === 'ROLE' ? 'Who can do this' : kind.charAt(0) + kind.slice(1).toLowerCase())
    const rest = lines.slice(1).join(' ').trim()

    return (
      <div key={key} className={`my-4 flex gap-3 rounded-xl border px-4 py-3 ${cls}`}>
        <Icon size={17} className={`mt-0.5 shrink-0 ${iconCls}`} />
        <div className="min-w-0 text-[15px] leading-7">
          <span className="font-semibold">{heading}</span>
          {rest && <span> — {renderInline(rest, key)}</span>}
        </div>
      </div>
    )
  }

  return (
    <blockquote
      key={key}
      className="my-4 border-l-[3px] border-cream-400 pl-4 text-[15px] italic leading-7 text-ink-600"
    >
      {renderInline(lines.join(' '), key)}
    </blockquote>
  )
}

function renderBlocks(body: string): ReactNode[] {
  const lines = body.split('\n')
  const out: ReactNode[] = []
  let i = 0
  let n = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    const key = `b${n++}`

    if (trimmed === '') {
      i++
      continue
    }

    // Fenced code
    if (trimmed.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        code.push(lines[i])
        i++
      }
      i++ // closing fence
      out.push(
        <pre
          key={key}
          className="my-4 overflow-x-auto rounded-xl border border-cream-300 bg-ink-900 px-4 py-3 text-[13px] leading-6 text-cream-100"
        >
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Rules
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      out.push(<hr key={key} className="my-8 border-cream-300" />)
      i++
      continue
    }

    // Headings. h1 is the article title, rendered by the page, so ## is the
    // top level here and gets an anchor id for the "on this page" rail.
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const text = heading[2].trim()
      const id = slugifyHeading(text)
      const level = heading[1].length
      if (level <= 2) {
        out.push(
          <h2
            key={key}
            id={id}
            className="mt-10 scroll-mt-24 border-b border-cream-300 pb-2 text-lg font-semibold text-ink-900 first:mt-0"
          >
            {renderInline(text, key)}
          </h2>,
        )
      } else if (level === 3) {
        out.push(
          <h3 key={key} id={id} className="mt-7 scroll-mt-24 text-[15px] font-semibold text-ink-900">
            {renderInline(text, key)}
          </h3>,
        )
      } else {
        out.push(
          <h4 key={key} id={id} className="mt-5 scroll-mt-24 text-sm font-semibold text-ink-700">
            {renderInline(text, key)}
          </h4>,
        )
      }
      i++
      continue
    }

    // Blockquote / callout
    if (trimmed.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        quote.push(lines[i].trimStart().replace(/^>\s?/, ''))
        i++
      }
      out.push(renderQuote(quote, key))
      continue
    }

    // Table: a pipe row followed by a |---| separator.
    if (trimmed.startsWith('|') && /^\|?[\s:|-]+\|/.test(lines[i + 1]?.trim() ?? '')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i])
        i++
      }
      out.push(renderTable(rows, key))
      continue
    }

    // Lists
    if (isListLine(line)) {
      const indent = /^(\s*)/.exec(line)![1].length
      const { list, next } = parseList(lines, i, indent)
      out.push(renderList(list, key))
      i = next
      continue
    }

    // Paragraph: everything up to the next blank line or block start.
    const para: string[] = [trimmed]
    i++
    while (i < lines.length && !isBlockStart(lines[i])) {
      para.push(lines[i].trim())
      i++
    }
    out.push(
      <p key={key} className="my-3 text-[15px] leading-7 text-ink-700">
        {renderInline(para.join(' '), key)}
      </p>,
    )
  }

  return out
}

export function Markdown({ body }: { body: string }) {
  return <div className="max-w-none">{renderBlocks(body).map((node, i) => <Fragment key={i}>{node}</Fragment>)}</div>
}
