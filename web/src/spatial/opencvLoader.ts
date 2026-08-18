let loadPromise: Promise<boolean> | null = null

declare global {
  interface Window { cv?: { onRuntimeInitialized?: () => void } }
}

export function loadOpenCVForVision() {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.cv) return Promise.resolve(true)
  if (loadPromise) return loadPromise
  loadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://docs.opencv.org/4.x/opencv.js'
    const timeout = window.setTimeout(() => resolve(false), 15000)
    script.onload = () => {
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => { window.clearTimeout(timeout); resolve(true) }
      } else {
        window.clearTimeout(timeout)
        resolve(false)
      }
    }
    script.onerror = () => { window.clearTimeout(timeout); resolve(false) }
    document.head.appendChild(script)
  })
  return loadPromise
}
