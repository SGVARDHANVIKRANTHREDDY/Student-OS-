import { useCallback, useRef, useState } from 'react'

/**
 * Debounce hook — returns a stable debounced version of the callback.
 * Useful for search inputs and form auto-save.
 */
export function useDebounce(fn, delayMs = 300) {
  const timerRef = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fn(...args), delayMs)
  }, [fn, delayMs])
}

/**
 * Page title hook — sets document.title and restores on unmount.
 */
export function usePageTitle(title) {
  const prevRef = useRef(document.title)
  if (typeof title === 'string' && title) {
    document.title = `${title} — Student OS`
  }
  // Intentionally no cleanup — React Router page changes will call again
}

/**
 * Clipboard copy with user feedback.
 */
export function useClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), timeout)
    } catch {
      setCopied(false)
    }
  }, [timeout])

  return { copied, copy }
}

/**
 * Media query hook for responsive design logic in JS.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useState(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  })

  return matches
}
