import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, googleMapsConfigured } from './googleMaps.js'
import { machineDirectionsUrl } from './machineDirections.js'

export default function GoogleLocationMap({ machines, selected, onSelect, onPick, center }) {
  const element = useRef(null)
  const map = useRef(null)
  const markers = useRef(new Map())
  const popup = useRef(null)
  const callbacks = useRef({ onSelect, onPick })
  callbacks.current = { onSelect, onPick }
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let listener
    loadGoogleMaps().then(async maps => {
      const { Map } = await maps.importLibrary('maps')
      await maps.importLibrary('marker')
      if (!active) return
      map.current = new Map(element.current, { center: { lat: center?.[0] ?? 43.65, lng: center?.[1] ?? -79.38 }, zoom: 10, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID', streetViewControl: false, mapTypeControl: false, gestureHandling: 'cooperative' })
      popup.current = new maps.InfoWindow()
      listener = map.current.addListener('click', event => { if (event.latLng) callbacks.current.onPick?.({ latitude: event.latLng.lat(), longitude: event.latLng.lng() }) })
      setReady(true)
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false; listener?.remove(); markers.current.forEach(marker => { marker.map = null }); markers.current.clear(); popup.current?.close(); map.current = null }
  }, [])
  useEffect(() => {
    if (!ready || !map.current) return
    const maps = window.google.maps
    markers.current.forEach(marker => { marker.map = null }); markers.current.clear()
    const bounds = new maps.LatLngBounds()
    machines.filter(machine => Number.isFinite(machine.latitude) && Number.isFinite(machine.longitude)).forEach((machine, index) => {
      const pin = new maps.marker.PinElement({ background: '#6658e8', borderColor: '#4c3fc4', glyphColor: 'white', glyphText: String(index + 1) })
      const marker = new maps.marker.AdvancedMarkerElement({ map: map.current, position: { lat: machine.latitude, lng: machine.longitude }, title: machine.name })
      marker.append(pin)
      const content = document.createElement('div')
      const name = document.createElement('strong'); name.textContent = machine.name
      const address = document.createElement('p'); address.textContent = machine.address
      const directions = document.createElement('a')
      directions.href = machineDirectionsUrl(machine)
      directions.textContent = 'Directions'
      directions.target = '_blank'; directions.rel = 'noreferrer'
      directions.style.cssText = 'display:inline-flex;align-items:center;min-height:44px'
      content.append(name, address, directions)
      marker.addListener('click', () => { callbacks.current.onSelect?.(machine.id); popup.current.setContent(content); popup.current.open({ map: map.current, anchor: marker }) })
      markers.current.set(machine.id, marker); bounds.extend(marker.position)
    })
    if (markers.current.size === 1) { map.current.setCenter(bounds.getCenter()); map.current.setZoom(16) }
    else if (markers.current.size) map.current.fitBounds(bounds, 40)
  }, [machines, ready])
  useEffect(() => {
    const marker = markers.current.get(selected)
    if (marker && map.current) { map.current.setCenter(marker.position); map.current.setZoom(16) }
  }, [selected, machines, ready])
  if (!googleMapsConfigured) return <div className="vending-map-setup" role="status">Google Maps will be available after the Google Maps API key is configured. Saved machine addresses are still available.</div>
  const showWorld = () => {
    if (!map.current) return
    popup.current?.close()
    callbacks.current.onSelect?.(null)
    map.current.setCenter({ lat: 0, lng: 0 })
    map.current.setZoom(1)
  }
  return <div className="vending-map-wrap"><div className="vending-map-actions"><button type="button" className="button secondary" disabled={!ready || Boolean(error)} onClick={showWorld}>World view</button></div><div ref={element} className="vending-map" role="region" aria-label="Google map of vending machine locations"/>{!ready && !error && <p role="status">Loading Google Maps...</p>}{error && <p role="alert">{error}</p>}</div>
}
