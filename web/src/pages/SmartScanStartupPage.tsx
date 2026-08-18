import type { PrepareProgress } from '../smart-scan/prepareSmartScan'
import type { CapabilityStatus } from '../smart-scan/smartScanTypes'

type SmartScanStartupPageProps = {
  progress: Record<string, PrepareProgress>
  error: string | null
  onRetry: () => void
  onBack: () => void
}

const steps: Array<{ key: PrepareProgress['step']; label: string }> = [
  { key: 'camera', label: 'Camera' },
  { key: 'gps', label: 'GPS' },
  { key: 'orientation', label: 'Orientation' },
  { key: 'webxr', label: 'WebXR' },
  { key: 'ar-tracking', label: 'AR Tracking' },
]

export function SmartScanStartupPage({ progress, error, onRetry, onBack }: SmartScanStartupPageProps) {
  return (
    <main className="startup-page">
      <button className="back-button" type="button" onClick={onBack}>← Back</button>
      <div className="startup-content">
        <p className="eyebrow">Cemetery Mapper</p>
        <h1>Preparing<br />Smart Scan</h1>
        <p className="diagnostic-intro">Checking permissions and device capabilities…</p>
        <section className="startup-status" aria-label="Smart Scan preparation status">
          {steps.map(({ key, label }) => {
            const item = progress[key]
            const status = item?.status ?? 'checking'
            return <StartupRow key={key} label={label} status={status} message={item?.message} />
          })}
        </section>
        {error && (
          <div className="startup-error" role="alert">
            <strong>{error}</strong>
            <p>Camera access is required to start Smart Scan.</p>
            <button className="test-button" type="button" onClick={onRetry}>Try again</button>
          </div>
        )}
      </div>
    </main>
  )
}

function StartupRow({ label, status, message }: { label: string; status: CapabilityStatus; message?: string }) {
  const symbol = status === 'ready' ? '✓' : status === 'checking' ? '…' : '—'
  return (
    <div className="startup-row">
      <div><strong>{label}</strong>{message && <small>{message}</small>}</div>
      <span className={`status-symbol status-${status}`} aria-label={status}>{symbol}</span>
    </div>
  )
}
