import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from '../components/ConfirmDialog'

// jsdom stubs for <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
})

describe('ConfirmDialog', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="Delete?" onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('renders title, message, and buttons when open', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete item?"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Delete item?')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog open={true} title="Delete?" onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    await user.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog open={true} title="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />
    )
    await user.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('uses custom button labels', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Sure?"
        confirmLabel="Yes, delete"
        cancelLabel="No, keep"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Yes, delete')).toBeInTheDocument()
    expect(screen.getByText('No, keep')).toBeInTheDocument()
  })

  it('applies variant class to confirm button', () => {
    render(
      <ConfirmDialog open={true} title="Sure?" variant="warning" onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    const btn = screen.getByText('Confirm')
    expect(btn).toHaveClass('warning')
  })

  it('calls showModal when opened', () => {
    render(
      <ConfirmDialog open={true} title="Test" onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
  })
})
