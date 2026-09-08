/**
 * Reading, rendering and filling the AcroForm fields of a real PDF.
 *
 * Two libraries with one job each, deliberately:
 *
 *   pdf-lib    the form itself — what fields exist, where their widgets sit,
 *              and writing values back out. It is the only one that can edit.
 *   pdfjs-dist pixels, and nothing else. It rasterises pages to a canvas so a
 *              person sees the actual document, and its viewport does the
 *              coordinate maths (PDF points, origin bottom-left, page rotation)
 *              that turns a field rectangle into a box we can position an HTML
 *              input over.
 *
 * Keeping field geometry in pdf-lib rather than reading pdfjs's own annotation
 * layer means there is one answer to "where is this field and what is it
 * called" -- the same answer used when writing the value back. Two sources
 * would drift on exactly the documents that matter: the hand-made ones.
 *
 * The inputs the person types into are ordinary HTML, absolutely positioned
 * over the rendered page. The browser's own PDF viewer can also appear to
 * accept typing, but an <iframe> is sealed off from the page, so nothing typed
 * there can ever be read back. That is the whole reason this file exists.
 */
import type {
  PDFDocument,
  PDFField as LibField,
  PDFForm,
  PDFPage,
  PDFRef,
} from 'pdf-lib'

/** The pdf-lib module namespace. Needed at runtime for the constructors the
 *  instanceof checks below compare against, which is why it is threaded through
 *  the helpers rather than imported at the top of the file. */
type PdfLib = typeof import('pdf-lib')

let pdfLibPromise: Promise<PdfLib> | null = null

/**
 * Loaded on demand, like pdfjs and for the same reason: pdf-lib is ~430 kB of
 * bundle (~180 kB gzipped) and only the people signing a fillable agreement
 * ever need it. A static import put it in the main chunk for every visitor on
 * every page, which is a real cost paid by everyone for a rare feature.
 *
 * Note this is why `readPdfForm` and friends are all async even where the work
 * itself would not have to be.
 */
async function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLibPromise) pdfLibPromise = import('pdf-lib')
  return pdfLibPromise
}

export type PdfFieldKind = 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown' | 'signature'

export interface PdfFieldWidget {
  pageIndex: number
  /** [x1, y1, x2, y2] in PDF user space, straight from the widget. */
  rect: [number, number, number, number]
}

export interface PdfField {
  name: string
  kind: PdfFieldKind
  required: boolean
  readOnly: boolean
  /** Choices for dropdown and radio fields. */
  options: string[]
  /** Most fields have one widget; a field repeated on every page has several. */
  widgets: PdfFieldWidget[]
  /** Whatever the document already has in it. */
  initial: string
}

/** What the person has typed. Checkboxes are 'Yes'/'' so one shape covers all. */
export type PdfFieldValues = Record<string, string>

// --------------------------------------------------------------------- pdfjs

type PdfJs = typeof import('pdfjs-dist')
let pdfjsPromise: Promise<PdfJs> | null = null

/**
 * Loaded on demand, never at module scope: pdfjs is the single largest thing in
 * this app's dependency tree, and only the handful of people signing a fillable
 * agreement should ever pay for it. A static import would put it in the main
 * bundle for everyone.
 *
 * The worker is resolved with Vite's `?url` import rather than a CDN, so it is
 * fingerprinted and served from our own origin -- no third-party request at the
 * moment someone is reading a contract, and nothing to break if a CDN does.
 */
export async function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, workerUrl] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ])
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
      return pdfjs
    })()
  }
  return pdfjsPromise
}

// ------------------------------------------------------------------- reading

function kindOf(field: LibField, L: PdfLib): PdfFieldKind {
  if (field instanceof L.PDFCheckBox) return 'checkbox'
  if (field instanceof L.PDFRadioGroup) return 'radio'
  if (field instanceof L.PDFDropdown || field instanceof L.PDFOptionList) return 'dropdown'
  if (field instanceof L.PDFSignature) return 'signature'
  if (field instanceof L.PDFTextField) return field.isMultiline() ? 'multiline' : 'text'
  return 'text'
}

function initialOf(field: LibField, L: PdfLib): string {
  try {
    if (field instanceof L.PDFTextField) return field.getText() ?? ''
    if (field instanceof L.PDFCheckBox) return field.isChecked() ? 'Yes' : ''
    if (field instanceof L.PDFRadioGroup) return field.getSelected() ?? ''
    if (field instanceof L.PDFDropdown || field instanceof L.PDFOptionList) {
      return field.getSelected()?.[0] ?? ''
    }
  } catch {
    // A malformed field reads as empty rather than taking the whole form down.
  }
  return ''
}

function optionsOf(field: LibField, L: PdfLib): string[] {
  try {
    if (field instanceof L.PDFRadioGroup) return field.getOptions()
    if (field instanceof L.PDFDropdown || field instanceof L.PDFOptionList) return field.getOptions()
  } catch {
    // As above.
  }
  return []
}

/**
 * Maps every widget annotation dictionary to the page it is drawn on.
 *
 * A widget's own /P entry is supposed to name its page, but plenty of
 * real-world PDFs -- particularly ones assembled by older tooling -- leave it
 * out. Walking each page's /Annots array instead is authoritative, because that
 * array is what actually puts the widget on the page.
 */
function buildWidgetPageMap(doc: PDFDocument): Map<unknown, number> {
  const map = new Map<unknown, number>()
  doc.getPages().forEach((page: PDFPage, pageIndex: number) => {
    const annots = page.node.Annots()
    if (!annots) return
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i) as PDFRef
      try {
        const dict = doc.context.lookup(ref)
        if (dict) map.set(dict, pageIndex)
      } catch {
        // A dangling reference — skip it rather than fail the document.
      }
    }
  })
  return map
}

export async function readPdfForm(bytes: ArrayBuffer | Uint8Array): Promise<{
  doc: PDFDocument
  fields: PdfField[]
}> {
  // ignoreEncryption: plenty of otherwise ordinary PDFs carry an owner password
  // that only restricts printing. Refusing to open those would reject documents
  // a person can already read perfectly well in any viewer.
  const L = await loadPdfLib()
  const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true })
  const pageMap = buildWidgetPageMap(doc)

  let form
  try {
    form = doc.getForm()
  } catch {
    return { doc, fields: [] } // No AcroForm at all — a flat PDF.
  }

  const fields: PdfField[] = []
  for (const field of form.getFields()) {
    const widgets: PdfFieldWidget[] = []
    for (const widget of field.acroField.getWidgets()) {
      const pageIndex = pageMap.get(widget.dict)
      if (pageIndex === undefined) continue
      const r = widget.getRectangle()
      widgets.push({
        pageIndex,
        rect: [r.x, r.y, r.x + r.width, r.y + r.height],
      })
    }
    if (widgets.length === 0) continue // Nothing visible to fill in.

    fields.push({
      name: field.getName(),
      kind: kindOf(field, L),
      required: field.isRequired(),
      readOnly: field.isReadOnly(),
      options: optionsOf(field, L),
      widgets,
      initial: initialOf(field, L),
    })
  }
  return { doc, fields }
}

/**
 * How many fields this document needs the form machinery for. Run once, on
 * upload.
 *
 * Signature fields are counted even though nobody types into one: they still
 * have to go through fill-and-flatten to get the typed name stamped onto them
 * and the widget removed. A document whose only field is a signature box would
 * otherwise be treated as flat and rendered in a plain iframe, and the signature
 * line would come out blank.
 *
 * Read-only fields are excluded — they are content, not something to complete.
 * A document we cannot parse counts as zero: we must not promise to fill a form
 * we were unable to read.
 */
export async function countPdfFormFields(bytes: ArrayBuffer | Uint8Array): Promise<number> {
  try {
    const { fields } = await readPdfForm(bytes)
    return fields.filter((f) => !f.readOnly).length
  } catch {
    return 0
  }
}

// ------------------------------------------------------------------- writing

/**
 * Unhooks a field from the document at the dictionary level.
 *
 * Used for signature fields, which have to go before flattening. This is not an
 * edge case: any contract with a real /Sig field hits it. pdf-lib cannot flatten
 * a signature field -- there is no appearance to bake in -- and it throws rather
 * than skipping, which takes the whole form down with it, leaving every other
 * answer as a live widget with none of them on the page. Confirmed by the test
 * fixture, which went from passing to three failures the moment a genuine
 * signature field was added.
 *
 * pdf-lib's own `removeField()` is no help here, because it reads each widget's
 * /AP /N appearance stream on the way out and signature widgets frequently have
 * none ("Unexpected N type: undefined"). So the reference is pulled straight out
 * of the AcroForm's /Fields array and out of every page's /Annots array instead,
 * which is all "remove this field" actually means.
 *
 * Dropping the field is also right on its own terms rather than a workaround:
 * the typed name has already been drawn onto the widget's rectangle, so the
 * visible signature is page content. Leaving an empty, un-signable signature
 * widget behind would only invite a PDF editor to fill it in afterwards.
 */
function detachField(doc: PDFDocument, form: PDFForm, field: LibField): void {
  // Compared by string ("12 0 R") rather than identity: pdf-lib interns PDFRef,
  // so identity does hold today, but a printed reference is what the file
  // actually contains and cannot be defeated by a second interning table.
  const target = field.acroField.ref.toString()

  const fieldsArray = form.acroForm.normalizedEntries().Fields
  for (let i = fieldsArray.size() - 1; i >= 0; i--) {
    if (fieldsArray.get(i)?.toString() === target) fieldsArray.remove(i)
  }

  for (const page of doc.getPages()) {
    const annots = page.node.Annots()
    if (!annots) continue
    for (let i = annots.size() - 1; i >= 0; i--) {
      if (annots.get(i)?.toString() === target) annots.remove(i)
    }
  }
}

export interface FlattenOptions {
  /** Typed name, drawn into any signature field the document declares. */
  signatureText?: string
  /** Stamped under the signature so the flattened copy is self-describing. */
  signedAtText?: string
}

/**
 * Writes the values in, draws the signature, and flattens.
 *
 * Flattening is what makes the result evidence rather than a form: afterwards
 * the values are page content, not editable widgets, so the stored copy cannot
 * be quietly altered by opening it in a PDF editor.
 *
 * It is also the step most likely to object, because it needs an appearance
 * stream for every widget and hand-built PDFs often lack them. So it degrades
 * in two steps instead of throwing away a completed form: flatten, else
 * regenerate appearances and flatten, else save unflattened. An unflattened
 * copy still carries every answer; losing the upload entirely would not.
 */
export async function fillAndFlatten(
  bytes: ArrayBuffer | Uint8Array,
  values: PdfFieldValues,
  options: FlattenOptions = {},
): Promise<{ bytes: Uint8Array; flattened: boolean }> {
  const L = await loadPdfLib()
  const { doc, fields } = await readPdfForm(bytes)
  const form = doc.getForm()

  for (const field of fields) {
    if (field.readOnly) continue
    const raw = values[field.name]
    if (raw === undefined) continue
    try {
      switch (field.kind) {
        case 'checkbox': {
          const box = form.getCheckBox(field.name)
          if (raw) box.check()
          else box.uncheck()
          break
        }
        case 'radio': {
          if (raw) form.getRadioGroup(field.name).select(raw)
          break
        }
        case 'dropdown': {
          if (!raw) break
          const dropdown = form.getFieldMaybe(field.name)
          if (dropdown instanceof L.PDFOptionList) dropdown.select(raw)
          else form.getDropdown(field.name).select(raw)
          break
        }
        case 'signature':
          // Left to the drawing pass below: pdf-lib cannot set a signature
          // field's value, and a real cryptographic signature is a different
          // thing from what is being collected here.
          break
        default:
          form.getTextField(field.name).setText(raw)
      }
    } catch {
      // One uncooperative field must not cost the other twenty.
    }
  }

  // Draw the typed name over any signature widget, since the field itself
  // cannot hold it. Without this, a document with a signature box would flatten
  // to a visibly blank one.
  if (options.signatureText) {
    const font = await doc.embedFont(L.StandardFonts.Helvetica)
    const pages = doc.getPages()
    for (const field of fields) {
      if (field.kind !== 'signature') continue
      for (const w of field.widgets) {
        const page = pages[w.pageIndex]
        if (!page) continue
        const [x1, y1, , y2] = w.rect
        const height = Math.max(8, Math.min(18, (y2 - y1) * 0.5))
        page.drawText(options.signatureText, {
          x: x1 + 4,
          y: y1 + (y2 - y1) / 2 - height / 4,
          size: height,
          font,
        })
        if (options.signedAtText) {
          page.drawText(options.signedAtText, {
            x: x1 + 4,
            y: y1 + 2,
            size: Math.max(6, height * 0.45),
            font,
          })
        }
      }
    }
  }

  for (const field of fields) {
    if (field.kind !== 'signature') continue
    try {
      const existing = form.getFieldMaybe(field.name)
      if (existing) detachField(doc, form, existing)
    } catch {
      // If it will not come out, the flatten fallbacks below still apply.
    }
  }

  let flattened = true
  try {
    form.flatten()
  } catch {
    try {
      form.updateFieldAppearances()
      form.flatten()
    } catch {
      flattened = false
    }
  }

  return { bytes: await doc.save({ useObjectStreams: false }), flattened }
}

/** The subset worth keeping in the database: answered, writable fields. */
export function meaningfulValues(fields: PdfField[], values: PdfFieldValues): PdfFieldValues {
  const out: PdfFieldValues = {}
  for (const f of fields) {
    if (f.readOnly || f.kind === 'signature') continue
    const v = values[f.name]
    if (v !== undefined && v !== '') out[f.name] = v
  }
  return out
}

/** Required, writable, still blank — what stops the sign button enabling. */
export function missingRequired(fields: PdfField[], values: PdfFieldValues): PdfField[] {
  return fields.filter(
    (f) => f.required && !f.readOnly && f.kind !== 'signature' && !values[f.name],
  )
}
