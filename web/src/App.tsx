import { useState } from 'react'
import { DeviceCheckPage } from './pages/DeviceCheckPage'
import { HomePage } from './pages/HomePage'

type Screen = 'home' | 'device-check'

export function App() {
  const [screen, setScreen] = useState<Screen>('home')

  if (screen === 'device-check') {
    return <DeviceCheckPage onBack={() => setScreen('home')} />
  }

  return <HomePage onDeviceCheck={() => setScreen('device-check')} />
}
