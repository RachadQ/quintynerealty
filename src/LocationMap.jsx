import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { machineDirectionsUrl } from './machineDirections.js'

const WORLD = [25, 10]
const hasPoint = machine => Number.isFinite(machine.latitude) && Number.isFinite(machine.longitude)
  && Math.abs(machine.latitude) <= 90 && Math.abs(machine.longitude) <= 180
const layers = {
  streets: { label: 'Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  satellite: { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
  dark: { label: 'Dark', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ' },
}

export default function LocationMap({ machines, selected, onSelect, onPick, center, focusVersion }) {
  const element = useRef(null)
  const panel = useRef(null)
  const map = useRef(null)
  const markers = useRef(new Map())
  const callbacks = useRef({ onSelect, onPick })
  callbacks.current = { onSelect, onPick }
  const [ready, setReady] = useState(false)
  const [style, setStyle] = useState('streets')
  const [expanded, setExpanded] = useState(false)
  const [localSelection, setLocalSelection] = useState(null)
  const [tileError, setTileError] = useState(false)
  const selectedId = selected === undefined ? localSelection : selected
  const machine = machines.find(item => item.id === selectedId)
  const navigate = (point, zoom) => {
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.current?.flyTo(point, zoom, { animate, duration: 1.2 })
  }
  useEffect(() => {
    const instance = L.map(element.current, { center: center || WORLD, zoom: center ? 16 : 2, minZoom: 0, maxZoom: 18, zoomControl: false, worldCopyJump: true })
    map.current = instance
    if (!center) instance.fitWorld({ animate: false })
    L.control.zoom({ position: 'bottomright' }).addTo(instance)
    instance.on('click', event => callbacks.current.onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.wrap().lng }))
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(element.current)
    setReady(true)
    return () => { observer.disconnect(); instance.remove(); markers.current.clear(); map.current = null }
  }, [])
  useEffect(() => {
    if (!ready || !map.current) return
    setTileError(false)
    const layer = L.tileLayer(layers[style].url, { attribution: layers[style].attribution, maxZoom: 19 }).addTo(map.current)
    layer.on('tileerror', () => setTileError(true))
    return () => { layer.remove() }
  }, [style, ready])
  useEffect(() => {
    if (!ready || !map.current) return
    markers.current.forEach(marker => marker.remove()); markers.current.clear()
    machines.forEach((item, index) => {
      if (!hasPoint(item)) return
      const label = document.createElement('span')
      label.className = 'machine-map-label'
      label.textContent = `${index + 1} · ${item.name}`
      const icon = L.divIcon({ className: 'machine-map-marker', html: label, iconSize: [44, 44], iconAnchor: [22, 22] })
      const marker = L.marker([item.latitude, item.longitude], { icon, title: item.name, alt: `Show ${item.name}`, keyboard: true }).addTo(map.current)
      marker.getElement()?.setAttribute('aria-label', `Show ${item.name}`)
      marker.on('click', () => { setLocalSelection(item.id); callbacks.current.onSelect?.(item.id); navigate([item.latitude, item.longitude], 16) })
      markers.current.set(item.id, marker)
    })
  }, [machines, ready])
  useEffect(() => {
    if (!ready) return
    markers.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle('is-selected', id === selectedId)
      marker.setZIndexOffset(id === selectedId ? 1000 : 0)
    })
    const marker = markers.current.get(selectedId)
    if (marker) navigate(marker.getLatLng(), 16)
  }, [selectedId, machines, ready, focusVersion])
  useEffect(() => {
    if (ready && center) navigate(center, 16)
  }, [center?.[0], center?.[1], ready])
  useEffect(() => {
    if (!expanded) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('select, button')?.focus()
    const close = event => {
      if (event.key === 'Escape') setExpanded(false)
      if (event.key !== 'Tab') return
      const controls = [...panel.current.querySelectorAll('button:not(:disabled), select, a[href], [tabindex="0"]')]
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('keydown', close); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [expanded])
  const clearSelection = () => { setLocalSelection(null); callbacks.current.onSelect?.(null) }
  const showWorld = () => {
    clearSelection()
    map.current?.flyToBounds([[-80, -180], [80, 180]], { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, duration: 1.2 })
  }
  const fitMachines = () => {
    const points = machines.filter(hasPoint).map(item => [item.latitude, item.longitude])
    if (!points.length) return
    clearSelection()
    map.current.fitBounds(points, { padding: [48, 48], maxZoom: 16 })
  }
  return <div ref={panel} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? 'Expanded vending machine map' : undefined} className={`vending-map-wrap location-explorer-map ${expanded ? 'is-expanded' : ''}`}>
    <div className="vending-map-actions">
      <label className="map-style-label">Map style<select value={style} onChange={event => setStyle(event.target.value)}>{Object.entries(layers).map(([id, layer]) => <option key={id} value={id}>{layer.label}</option>)}</select></label>
      <button type="button" className="button secondary" onClick={fitMachines} disabled={!ready || !machines.some(hasPoint)}>All machines</button>
      <button type="button" className="button secondary" onClick={showWorld} disabled={!ready}>World view</button>
      <button type="button" className="button secondary" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Close full map' : 'Expand map'}</button>
    </div>
    <div ref={element} className="vending-map" style={{ backgroundColor: style === 'dark' ? '#202326' : '#e7edf0' }} role="region" aria-label="Map of vending machine locations"/>
    {tileError && <p className="map-tile-error" role="alert">Some map tiles could not load. Try another map style or check your connection.</p>}
    {machine && hasPoint(machine) && <div className="machine-map-detail" aria-live="polite"><div><small>VENDING MACHINE</small><h3>{machine.name}</h3><p>{machine.address}</p>{machine.notes && <p className="vending-notes">{machine.notes}</p>}</div><div className="machine-map-detail-actions"><a className="button secondary" href={machineDirectionsUrl(machine)} target="_blank" rel="noreferrer">Directions</a><button type="button" className="button secondary" onClick={clearSelection}>Close details</button></div></div>}
  </div>
}
