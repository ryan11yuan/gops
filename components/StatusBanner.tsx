import { AlertIcon } from '@/components/Marks'

export function StatusBanner({
  message,
  tone = 'info',
}: {
  message: string | null
  tone?: 'info' | 'alert'
}) {
  if (!message) return null
  return (
    <div className={`status-banner${tone === 'alert' ? ' is-alert' : ''}`} role="status">
      {tone === 'alert' ? (
        <AlertIcon />
      ) : (
        <span className="waiting-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {message}
    </div>
  )
}
