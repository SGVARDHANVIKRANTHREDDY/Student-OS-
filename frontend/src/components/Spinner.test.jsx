import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Spinner from '../components/Spinner'

describe('Spinner', () => {
  it('renders with default size', () => {
    render(<Spinner />)
    const el = screen.getByRole('status')
    expect(el).toBeInTheDocument()
    expect(el).toHaveClass('spinner', 'spinner-md')
  })

  it('renders with custom size', () => {
    render(<Spinner size="lg" />)
    const el = screen.getByRole('status')
    expect(el).toHaveClass('spinner-lg')
  })

  it('applies custom className', () => {
    render(<Spinner className="extra" />)
    const el = screen.getByRole('status')
    expect(el).toHaveClass('extra')
  })

  it('has accessible aria-label', () => {
    render(<Spinner />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })
})
