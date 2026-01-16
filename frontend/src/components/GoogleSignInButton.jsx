import { useEffect, useRef } from 'react'

export default function GoogleSignInButton({ onCredential, disabled = false }) {
  const elRef = useRef(null)

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return

    const google = window.google
    if (!google?.accounts?.id || !elRef.current) return

    elRef.current.innerHTML = ''

    google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => {
        if (disabled) return
        if (resp?.credential) onCredential(resp.credential)
      },
    })

    google.accounts.id.renderButton(elRef.current, {
      theme: 'outline',
      size: 'large',
      width: 320,
    })
  }, [onCredential, disabled])

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null

  return <div ref={elRef} />
}
