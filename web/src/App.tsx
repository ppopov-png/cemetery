import { useRef, useState } from 'react'
import { DeviceCheckPage } from './pages/DeviceCheckPage'
import { HomePage } from './pages/HomePage'
import { SmartScanPage } from './pages/SmartScanPage'
import { SmartScanStartupPage } from './pages/SmartScanStartupPage'
import { cleanupPreparedSmartScan, prepareSmartScan, type PrepareProgress, type PreparedSmartScan } from './smart-scan/prepareSmartScan'

type Screen = 'home' | 'device-check' | 'startup' | 'smart-scan'

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [prepared, setPrepared] = useState<PreparedSmartScan | null>(null)
  const [startupProgress, setStartupProgress] = useState<Record<string, PrepareProgress>>({})
  const [startupError, setStartupError] = useState<string | null>(null)
  const preparationToken = useRef(0)

  const startSmartScan = () => {
    setScreen('startup')
    const token = ++preparationToken.current
    setStartupError(null)
    setStartupProgress({})
    void prepareSmartScan(
      (progress) => setStartupProgress((current) => ({ ...current, [progress.step]: progress })),
    ).then((next) => {
      if (token !== preparationToken.current) {
        cleanupPreparedSmartScan(next)
        return
      }
      setPrepared(next)
      setScreen('smart-scan')
    }).catch((error: unknown) => {
      setStartupError(error instanceof Error ? error.message : 'Smart Scan could not be prepared.')
    })
  }

  if (screen === 'device-check') {
    return <DeviceCheckPage onBack={() => setScreen('home')} />
  }

  if (screen === 'startup') {
    return <SmartScanStartupPage progress={startupProgress} error={startupError} onRetry={startSmartScan} onBack={() => { preparationToken.current += 1; setScreen('home') }} />
  }

  if (screen === 'smart-scan' && prepared) {
    return <SmartScanPage prepared={prepared} onExit={() => { setPrepared(null); setScreen('home') }} />
  }

  return <HomePage onStartSmartScan={startSmartScan} onDeviceCheck={() => setScreen('device-check')} />
}
