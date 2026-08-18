export type OrientationReading = {
  alpha: number | null
  beta: number | null
  gamma: number | null
}

type PermissionResult = 'granted' | 'denied' | 'not-required'

type PermissionCapableOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export function isOrientationSupported() {
  return 'DeviceOrientationEvent' in window
}

export async function requestOrientationPermission(): Promise<PermissionResult> {
  if (!isOrientationSupported()) return 'denied'

  const orientationEvent = DeviceOrientationEvent as PermissionCapableOrientationEvent
  if (typeof orientationEvent.requestPermission !== 'function') return 'not-required'

  return (await orientationEvent.requestPermission())
}

export function subscribeToOrientation(
  onReading: (reading: OrientationReading) => void,
) {
  const handleOrientation = (event: DeviceOrientationEvent) => {
    onReading({ alpha: event.alpha, beta: event.beta, gamma: event.gamma })
  }

  window.addEventListener('deviceorientation', handleOrientation)
  return () => window.removeEventListener('deviceorientation', handleOrientation)
}
