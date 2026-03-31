import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmptyState from '../components/EmptyState'

describe('EmptyState', () => {
  it('renders title and default icon', () => {
    render(<EmptyState title="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByText('📭')).toBeInTheDocument()
  })

  it('renders custom icon', () => {
    render(<EmptyState icon="🔍" title="No results" />)
    expect(screen.getByText('🔍')).toBeInTheDocument()
  })

  it('renders optional message', () => {
    render(<EmptyState title="Empty" message="Try adding something" />)
    expect(screen.getByText('Try adding something')).toBeInTheDocument()
  })

  it('hides message when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />)
    expect(container.querySelector('.empty-state-message')).toBeNull()
  })

  it('renders action button when action + onAction provided', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    render(<EmptyState title="Empty" action="Add Item" onAction={onAction} />)
    const btn = screen.getByText('Add Item')
    expect(btn).toBeInTheDocument()
    await user.click(btn)
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('hides action button when no onAction', () => {
    const { container } = render(<EmptyState title="Empty" action="Add" />)
    expect(container.querySelector('.empty-state-action')).toBeNull()
  })
})
