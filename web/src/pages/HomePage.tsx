import { DeviceCheckButton } from '../components/DeviceCheckButton'

type HomePageProps = {
  onStartSmartScan: () => void
  onDeviceCheck: () => void
}

export function HomePage({ onStartSmartScan, onDeviceCheck }: HomePageProps) {
  return (
    <main className="home-page">
      <div className="hero-content">
        <p className="eyebrow">Cemetery Mapper</p>
        <h1>Smart Scan</h1>
        <p className="intro">Digital cemetery mapping.</p>
        <DeviceCheckButton onClick={onStartSmartScan} />
        <p className="auto-check-note">Camera and sensor check runs automatically</p>
        <button className="diagnostics-link" type="button" onClick={onDeviceCheck}>Device diagnostics</button>
      </div>
      <div className="page-mark" aria-hidden="true">CM</div>
    </main>
  )
}
