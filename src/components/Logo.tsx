import { useState } from 'react'

/**
 * The Kofa P/G lockup: the bird badge (public/kofa-logo.svg) plus the
 * wordmark, matching the header on kofapg.com.
 *
 * The badge is self-contained (cream circle, forest-green bird), so it reads
 * cleanly on both the green header and light surfaces without extra wrapping.
 */
const LOGO_SRC = '/kofa-logo.svg'

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

  const wordmarkClass = tone === 'onBrand' ? 'text-cream-50' : 'text-brand-800'
  const productClass = tone === 'onBrand' ? 'text-cream-200/80' : 'text-brand-600/70'
  const dividerClass = tone === 'onBrand' ? 'bg-cream-200/30' : 'bg-brand-600/20'

  return (
    <span className="flex items-center gap-2.5">
      {failed ? (
        <BadgeFallback height={height} />
      ) : (
        <img
          src={LOGO_SRC}
          alt="Kofa P/G"
          style={{ height, width: height }}
          className="shrink-0 rounded-full"
          onError={() => setFailed(true)}
        />
      )}

      <span
        className={`font-bold tracking-tight ${wordmarkClass}`}
        style={{ fontSize: height * 0.5 }}
      >
        Kofa P/G
      </span>

      {showProduct && (
        <>
          <span className={`h-5 w-px ${dividerClass}`} aria-hidden />
          <span className={`text-sm font-semibold tracking-[0.14em] ${productClass}`}>OS</span>
        </>
      )}
    </span>
  )
}

/** Only used if kofa-logo.svg ever fails to load, so the app never shows a broken image. */
function BadgeFallback({ height }: { height: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-cream-100 font-bold text-brand-700"
      style={{ height, width: height, fontSize: height * 0.42 }}
    >
      K
    </span>
  )
}
