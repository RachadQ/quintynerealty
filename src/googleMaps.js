/** Shared browser-only Google Maps loader. Use a referrer-restricted Maps key. */
export const googleMapsConfigured = Boolean(import.meta.env.GOOGLE_MAPS_API_KEY)
let loading
export function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  if (!googleMapsConfigured) return Promise.reject(new Error('Google Maps is not configured yet.'))
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = setTimeout(() => fail(), 20000)
    const fail = () => { clearTimeout(timeout); delete window.__quintyneMapsReady; script.remove(); loading = null; reject(new Error('Google Maps could not load. Check the Maps key, API access, billing, and website restrictions.')) }
    window.__quintyneMapsReady = () => { clearTimeout(timeout); delete window.__quintyneMapsReady; resolve(window.google.maps) }
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: import.meta.env.GOOGLE_MAPS_API_KEY, v: 'weekly', loading: 'async', callback: '__quintyneMapsReady', libraries: 'places,marker', region: 'CA', language: 'en' })}`
    script.async = true
    script.onerror = fail
    document.head.appendChild(script)
  })
  return loading
}

export async function geocodeGoogleAddress(address) {
  const maps = await loadGoogleMaps()
  const { Geocoder } = await maps.importLibrary('geocoding')
  const { results } = await new Geocoder().geocode({ address, region: 'ca' })
  const number = address.trim().match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+/)?.[1]
  const result = results.find(item => !item.partial_match && (!number || item.address_components.some(part => part.types.includes('street_number') && part.long_name.toLowerCase() === number.toLowerCase())))
  if (!result) return null
  return { latitude: result.geometry.location.lat(), longitude: result.geometry.location.lng() }
}
