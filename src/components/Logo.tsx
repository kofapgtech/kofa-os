import { useState } from 'react'

/**
 * The Kofa P/G lockup.
 *
 * The real artwork lives at `public/kofa-logo.png` (or .svg — change LOGO_SRC
 * to match). Until that file exists the component falls back to a wordmark in
 * the brand colours, so the app never renders a broken image.
 *
 * The artwork already carries its own forest-green background, so on cream
 * surfaces it is wrapped in a matching green tile to read as one shape.
 */
const LOGO_SRC = '/kofa-logo.png'

export function Logo({
  height = 30,
  showProduct = true,
  tone = 'onBrand',
}: {
  height?: number
  /** Appends the "OS" product label after the lockup. */
  showProduct?: boolean
  /** `onBrand` sits on the green header; `light` sits on cream. */
  tone?: 'onBrand' | 'light'
}) {
  const [failed, setFailed] = useState(false)

  const productClass = tone === 'onBrand' ? 'text-cream-200/80' : 'text-brand-600/70'
  const dividerClass = tone === 'onBrand' ? 'bg-cream-200/30' : 'bg-brand-600/20'

  return (
    <span className="flex items-center gap-2.5">
      {failed ? (
        <FallbackMark height={height} tone={tone} />
      ) : (
        <img
          src={LOGO_SRC}
          alt="Kofa P/G"
          style={{ height }}
          className={`w-auto ${tone === 'light' ? 'rounded-lg' : ''}`}
          onError={() => setFailed(true)}
        />
      )}

      {showProduct && (
        <>
          <span className={`h-5 w-px ${dividerClass}`} aria-hidden />
          <span className={`text-sm font-semibold tracking-[0.14em] ${productClass}`}>OS</span>
        </>
      )}
    </span>
  )
}

/** Used only until the artwork is dropped into public/. */
function FallbackMark({ height, tone }: { height: number; tone: 'onBrand' | 'light' }) {
  return (
    <span
      className={`flex items-center gap-2 rounded-lg pr-2.5 ${
        tone === 'onBrand' ? '' : 'bg-brand-600 pl-1 py-1'
      }`}
    >
      <span
        className="grid shrink-0 place-items-center rounded-full bg-cream-100 font-bold text-brand-700"
        style={{ height: height * 0.92, width: height * 0.92, fontSize: height * 0.42 }}
      >
        K
      </span>
      <span
        className="font-bold tracking-tight text-cream-50"
        style={{ fontSize: height * 0.52 }}
      >
        Kofa P/G
      </span>
    </span>
  )
}
