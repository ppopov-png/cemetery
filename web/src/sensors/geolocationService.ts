export type LocationReading = {
  latitude: number
  longitude: number
  accuracy: number
  altitude: number | null
  timestamp: number
}

export function isGeolocationSupported() {
  return 'geolocation' in navigator
}

export function getCurrentLocation(): Promise<LocationReading> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(new Error('Geolocation API is not available in this browser.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        altitude: coords.altitude,
        timestamp,
      }),
      (error) => reject(new Error(getGeolocationError(error))),
      { enableHighAccuracy: true },
    )
  })
}

function getGeolocationError(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Allow location access in Chrome settings and try again.'
    case error.POSITION_UNAVAILABLE:
      return 'Location is currently unavailable. Check GPS and try again.'
    case error.TIMEOUT:
      return 'The location request timed out. Try again outdoors or with GPS enabled.'
    default:
      return 'Could not determine the current location.'
  }
}
