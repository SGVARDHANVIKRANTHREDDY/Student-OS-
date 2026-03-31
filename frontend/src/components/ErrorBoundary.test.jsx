import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary'

function ThrowingChild({ shouldThrow = true }) {
  if (shouldThrow) throw new Error('Test crash')
  return <span>OK</span>
}

describe('ErrorBoundary', () => {
  // Suppress the expected console.error from React + componentDidCatch
  const origError = console.error
  beforeAll(() => {
    console.error = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('UI crashed')) return
      if (typeof args[0] === 'string' && args[0].includes('Error Boundary')) return
      if (typeof args[0] === 'string' && args[0].includes('The above error')) return
      origError(...args)
    }
  })
  afterAll(() => { console.error = origError })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <span>All good</span>
      </ErrorBoundary>
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows reload button', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })
})
