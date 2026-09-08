import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import {
  loadPdfjs,
  readPdfForm,
  type PdfField,
  type PdfFieldValues,
} from '@/lib/pdfForm'

/**
 * A fillable PDF, rendered as pixels with HTML inputs sitting exactly on top of
 * its real form fields.
 *
 * One page at a time, not a scrolling stack. A contract's fields are usually
 * clustered on one or two pages, continuous scroll makes the canvas memory grow
 * with the document, and paging gives an honest "page 3 of 9" — which is the
 * thing someone actually wants to know before they start.
 *
 * The inputs are positioned by converting each widget's PDF rectangle through
 * pdfjs's own viewport, so rotation and scale are handled by the library that
 * rasterised the page rather than by arithmetic here that would drift from it.
 */
export function PdfFormFiller({
  bytes,
  values,
  onChange,
  onFieldsRead,
  disabled,
}: {
  bytes: ArrayBuffer
  values: PdfFieldValues
  onChange: (next: PdfFieldValues) => void
  /** Handed back once, so the parent can gate signing on required fields. */
  onFieldsRead: (fields: PdfField[]) => void
  disabled?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // Held in a ref, not state: a PDFDocumentProxy is a handle to a worker-side
  // object, not data to render, and putting it in state would re-render the
  // whole tree every time a page is drawn.
  const docRef = useRef<Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']> | null>(null)

  const [fields, setFields] = useState<PdfField[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null)
  const [convert, setConvert] = useState<((r: [number, number, number, number]) => number[]) | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [width, setWidth] = useState(0)

  // Measure the container so the page renders at the width it will be shown at.
  // Rendering at a fixed scale and CSS-scaling the canvas afterwards is what
  // makes overlaid inputs drift off their boxes as the window changes.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Read the form once. pdf-lib consumes the buffer, so each reader gets a copy
  // — handing the same ArrayBuffer to pdfjs and pdf-lib leaves one of them
  // looking at a detached buffer.
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const { fields: read } = await readPdfForm(bytes.slice(0))
        if (!alive) return
        setFields(read)
        onFieldsRead(read)

        const pdfjs = await loadPdfjs()
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
        if (!alive) return
        docRef.current = doc
        setPageCount(doc.numPages)
        setLoading(false)
      } catch (err) {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'Could not open this document.')
        setLoading(false)
      }
    })()
    return () => {
      alive = false
      void docRef.current?.destroy()
      docRef.current = null
    }
    // onFieldsRead is intentionally excluded: the parent passes a fresh closure
    // each render, and including it would re-parse the PDF on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes])

  const renderPage = useCallback(async () => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || width === 0) return
    const page = await doc.getPage(pageIndex + 1)

    // Fit the page to the container, then draw at device pixel ratio so text is
    // sharp on a retina screen while the CSS box stays the fitted size.
    const unscaled = page.getViewport({ scale: 1 })
    const scale = width / unscaled.width
    const vp = page.getViewport({ scale })
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = Math.floor(vp.width * dpr)
    canvas.height = Math.floor(vp.height * dpr)
    canvas.style.width = `${Math.floor(vp.width)}px`
    canvas.style.height = `${Math.floor(vp.height)}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, vp.width, vp.height)
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise

    setViewport({ width: vp.width, height: vp.height })
    setConvert(() => (r: [number, number, number, number]) => vp.convertToViewportRectangle(r))
  }, [pageIndex, width])

  useEffect(() => {
    void renderPage()
  }, [renderPage])

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-rose-800">
          <AlertTriangle size={15} /> {error}
        </p>
        <p className="mt-1 text-xs text-rose-700">
          Ask an admin to re-upload this document, or to replace it with a version you can read.
        </p>
      </div>
    )
  }

  const pageFields = fields.flatMap((f) =>
    f.widgets
      .filter((w) => w.pageIndex === pageIndex)
      .map((w, i) => ({ field: f, widget: w, key: `${f.name}::${pageIndex}::${i}` })),
  )

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border border-cream-200 bg-cream-50"
      >
        {loading && (
          <div className="grid h-64 place-items-center">
            <p className="flex items-center gap-2 text-sm text-ink-500">
              <Loader2 size={15} className="animate-spin" /> Opening document…
            </p>
          </div>
        )}

        <div className="relative" style={viewport ? { height: viewport.height } : undefined}>
          <canvas ref={canvasRef} className="block" />

          {convert &&
            viewport &&
            pageFields.map(({ field, widget, key }) => {
              const [a, b, c, d] = convert(widget.rect)
              const left = Math.min(a, c)
              const top = Math.min(b, d)
              const w = Math.abs(c - a)
              const h = Math.abs(d - b)
              const common = {
                style: { left, top, width: w, height: h },
                // Sits visibly on the page rather than invisibly over it: a
                // faint brand tint is what tells someone there is something to
                // fill in at all, which a transparent input does not.
                className:
                  'absolute rounded-[3px] border border-brand-400/70 bg-brand-50/70 px-1 text-[inherit] text-ink-900 outline-none focus:border-brand-600 focus:bg-white disabled:opacity-60',
              }
              const ro = field.readOnly || disabled

              if (field.kind === 'checkbox') {
                return (
                  <span
                    key={key}
                    className="absolute grid place-items-center rounded-[3px] border border-brand-400/70 bg-brand-50/70"
                    style={{ left, top, width: w, height: h }}
                  >
                    <input
                      type="checkbox"
                      disabled={ro}
                      checked={!!values[field.name]}
                      onChange={(e) => onChange({ ...values, [field.name]: e.target.checked ? 'Yes' : '' })}
                      // Sized to the widget so a tiny tick box stays tiny.
                      style={{ width: Math.min(w, h) * 0.8, height: Math.min(w, h) * 0.8 }}
                    />
                  </span>
                )
              }

              if (field.kind === 'dropdown' || field.kind === 'radio') {
                return (
                  <select
                    key={key}
                    {...common}
                    disabled={ro}
                    value={values[field.name] ?? ''}
                    style={{ ...common.style, fontSize: Math.max(8, Math.min(13, h * 0.6)) }}
                    onChange={(e) => onChange({ ...values, [field.name]: e.target.value })}
                  >
                    <option value="">—</option>
                    {field.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )
              }

              if (field.kind === 'signature') {
                return (
                  <span
                    key={key}
                    className="absolute grid place-items-center rounded-[3px] border border-dashed border-brand-400 bg-white/60 text-[10px] font-medium uppercase tracking-wide text-brand-700"
                    style={{ left, top, width: w, height: h }}
                  >
                    Signature
                  </span>
                )
              }

              if (field.kind === 'multiline') {
                return (
                  <textarea
                    key={key}
                    {...common}
                    disabled={ro}
                    value={values[field.name] ?? ''}
                    style={{ ...common.style, fontSize: Math.max(8, Math.min(13, h * 0.25)), resize: 'none' }}
                    onChange={(e) => onChange({ ...values, [field.name]: e.target.value })}
                  />
                )
              }

              return (
                <input
                  key={key}
                  {...common}
                  type="text"
                  disabled={ro}
                  value={values[field.name] ?? ''}
                  style={{ ...common.style, fontSize: Math.max(8, Math.min(13, h * 0.6)) }}
                  onChange={(e) => onChange({ ...values, [field.name]: e.target.value })}
                />
              )
            })}
        </div>
      </div>

      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn-ghost !py-1.5 !px-2.5 text-sm"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft size={15} /> Previous
          </button>
          <p className="text-xs text-ink-500">
            Page {pageIndex + 1} of {pageCount}
            {/* Tells someone there is more to fill in before they reach the end
                and wonder why the sign button is still disabled. */}
            {fields.some((f) => f.required && !f.readOnly && !values[f.name]) && (
              <span className="ml-1 text-amber-700">· fields still blank</span>
            )}
          </p>
          <button
            type="button"
            className="btn-ghost !py-1.5 !px-2.5 text-sm"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
          >
            Next <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
