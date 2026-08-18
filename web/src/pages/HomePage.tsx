import { DeviceCheckButton } from '../components/DeviceCheckButton'

type HomePageProps = {
  onDeviceCheck: () => void
}

export function HomePage({ onDeviceCheck }: HomePageProps) {
  return (
    <main className="home-page">
      <div className="hero-content">
        <p className="eyebrow">Cemetery Mapper</p>
        <h1>Smart Scan</h1>
        <p className="intro">Ready to map what matters.</p>
        <DeviceCheckButton onClick={onDeviceCheck} />
      </div>
      <div className="page-mark" aria-hidden="true">CM</div>
    </main>
  )
}
