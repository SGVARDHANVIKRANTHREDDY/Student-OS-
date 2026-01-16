import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Keep this minimal: log for developers without leaking internals into UI.
    console.error('UI crashed:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{ padding: 20 }}>
        <h2>Something went wrong.</h2>
        <p>Please reload the page. If this persists, sign out and sign in again.</p>
        <button type="button" onClick={this.handleReload}>
          Reload
        </button>
      </div>
    )
  }
}
