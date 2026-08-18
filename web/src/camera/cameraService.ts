export type CameraSupport = 'supported' | 'unsupported'

export type CameraTestResult = {
  stream: MediaStream
}

export function getCameraSupport(): CameraSupport {
  return typeof navigator.mediaDevices?.getUserMedia === 'function'
    ? 'supported'
    : 'unsupported'
}

export async function testCamera(): Promise<CameraTestResult> {
  if (getCameraSupport() === 'unsupported') {
    throw new Error('Camera API is not available in this browser or context.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })

  return { stream }
}

export function stopCameraStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
}
