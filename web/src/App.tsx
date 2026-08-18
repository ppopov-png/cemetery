import { useState } from 'react'
import { DeviceCheckPage } from './pages/DeviceCheckPage'
import { HomePage } from './pages/HomePage'
import { SmartScanPage } from './pages/SmartScanPage'
import { SmartScanStartupPage } from './pages/SmartScanStartupPage'
import type { PreparedSmartScan } from './smart-scan/prepareSmartScan'

type Screen = 'home' | 'device-check' | 'startup' | 'smart-scan'

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [prepared, setPrepared] = useState<PreparedSmartScan | null>(null)

  if (screen === 'device-check') {
    return <DeviceCheckPage onBack={() => setScreen('home')} />
  }

  if (screen === 'startup') {
    return <SmartScanStartupPage onBack={() => setScreen('home')} onReady={(next) => { setPrepared(next); setScreen('smart-scan') }} />
  }

  if (screen === 'smart-scan' && prepared) {
    return <SmartScanPage prepared={prepared} onExit={() => { setPrepared(null); setScreen('home') }} />
  }

  return <HomePage onStartSmartScan={() => setScreen('startup')} onDeviceCheck={() => setScreen('device-check')} />
}
