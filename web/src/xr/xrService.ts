type XRSessionType = 'immersive-ar'

type XRSystemLike = {
  isSessionSupported: (sessionMode: XRSessionType) => Promise<boolean>
}

export function isWebXRSupported() {
  return typeof (navigator as Navigator & { xr?: XRSystemLike }).xr !== 'undefined'
}

export async function isImmersiveARSupported() {
  const xr = (navigator as Navigator & { xr?: XRSystemLike }).xr
  if (!xr) return false

  try {
    return await xr.isSessionSupported('immersive-ar')
  } catch {
    return false
  }
}
