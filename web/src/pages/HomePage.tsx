import { DeviceCheckButton } from '../components/DeviceCheckButton'

export function HomePage() {
  return (
    <main className="home-page">
      <div className="hero-content">
        <p className="eyebrow">Cemetery Mapper</p>
        <h1>Smart Scan</h1>
        <p className="intro">Ready to map what matters.</p>
        <DeviceCheckButton />
      </div>
      <div className="page-mark" aria-hidden="true">CM</div>
    </main>
  )
}
