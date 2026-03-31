import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '../components/Toast'

function TestConsumer() {
  const toast = useToast()
  return (
    <div>
      <button onClick={() => toast.success('Saved!')}>trigger-success</button>
      <button onClick={() => toast.error('Failed!')}>trigger-error</button>
      <button onClick={() => toast.info('Note', { duration: 0 })}>trigger-info</button>
      <button onClick={() => toast.warning('Watch out')}>trigger-warning</button>
    </div>
  )
}

describe('Toast', () => {
  it('renders children without toasts initially', () => {
    render(
      <ToastProvider>
        <span>child</span>
      </ToastProvider>
    )
    expect(screen.getByText('child')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeInTheDocument() // container exists
  })

  it('shows success toast', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    )
    await user.click(screen.getByText('trigger-success'))
    expect(screen.getByText('Saved!')).toBeInTheDocument()
  })

  it('shows error toast', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    )
    await user.click(screen.getByText('trigger-error'))
    expect(screen.getByText('Failed!')).toBeInTheDocument()
  })

  it('dismiss button removes toast', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    )
    await user.click(screen.getByText('trigger-info'))
    expect(screen.getByText('Note')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('Note')).toBeNull()
  })

  it('useToast throws outside provider', () => {
    function Bad() {
      useToast()
      return null
    }
    expect(() => render(<Bad />)).toThrow('useToast must be used within ToastProvider')
  })
})
