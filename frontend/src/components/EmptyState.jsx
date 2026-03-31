import './EmptyState.css'

export default function EmptyState({ icon = '📭', title, message, action, onAction }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3 className="empty-state-title">{title}</h3>
      {message && <p className="empty-state-message">{message}</p>}
      {action && onAction && (
        <button className="empty-state-action" onClick={onAction}>{action}</button>
      )}
    </div>
  )
}
