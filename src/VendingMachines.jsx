import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from './api.js'
import PlaceInput from './PlaceInput.jsx'

const blank = { name: '', address: '', notes: '', latitude: null, longitude: null }
const hasPoint = machine => Number.isFinite(machine.latitude) && Number.isFinite(machine.longitude)

function LocationMap({ machines, selected, onSelect, onPick, center }) {
  const element = useRef(null)
  const map = useRef(null)
  const pins = useRef(new Map())
  const select = useRef(onSelect)
  const pick = useRef(onPick)
  pick.current = onPick
  const [tileError, setTileError] = useState(false)
  select.current = onSelect
  useEffect(() => {
    const instance = L.map(element.current, { scrollWheelZoom: false }).setView(center || [43.65, -79.38], 9)
    instance.on('click', event => pick.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }))
    map.current = instance
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => setTileError(true)).addTo(instance)
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(element.current)
    return () => { observer.disconnect(); instance.remove(); map.current = null }
  }, [])
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    pins.current.forEach(marker => marker.remove())
    pins.current.clear()
    const bounds = []
    machines.filter(hasPoint).forEach((machine, index) => {
      const popup = document.createElement('div')
      const title = document.createElement('strong'); title.textContent = machine.name
      const address = document.createElement('p'); address.textContent = machine.address
      popup.append(title, address)
      const marker = L.marker([machine.latitude, machine.longitude], {
        title: machine.name, alt: `${machine.name}, ${machine.address}`,
        icon: L.divIcon({ className: 'vending-pin', html: `<span><b>${index + 1}</b></span>`, iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] }),
      }).bindPopup(popup, { maxWidth: 220, minWidth: 120 }).on('click', () => select.current?.(machine.id)).addTo(instance)
      pins.current.set(machine.id, marker)
      bounds.push([machine.latitude, machine.longitude])
    })
    if (bounds.length) instance.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
  }, [machines])
  useEffect(() => {
    const marker = pins.current.get(selected)
    if (marker) { map.current.setView(marker.getLatLng(), 16); marker.openPopup() }
  }, [selected, machines])
  return <div className="vending-map-wrap"><div ref={element} className="vending-map" role="region" aria-label="Map of vending machine locations"/>{tileError && <p role="status">Map tiles could not load. Your saved locations and directions are still available below.</p>}</div>
}

export default function VendingMachines({ can, Modal }) {
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [placingPin, setPlacingPin] = useState(false)
  const [success, setSuccess] = useState('')
  const visible = useMemo(() => machines.filter(machine => `${machine.name} ${machine.address} ${machine.notes}`.toLowerCase().includes(query.toLowerCase())), [machines, query])
  useEffect(() => {
    let active = true
    api('/vending-machines').then(data => { if (active) setMachines(data) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const open = machine => { setEditing(machine || {}); setForm(machine ? { name: machine.name, address: machine.address, notes: machine.notes || '', latitude: machine.latitude ?? null, longitude: machine.longitude ?? null } : blank); setPlacingPin(false); setFormError('') }
  const close = () => { if (!busy) setEditing(null) }
  const save = async event => {
    event.preventDefault(); setBusy(true); setFormError('')
    try {
      const saved = await api(editing.id ? `/vending-machines/${editing.id}` : '/vending-machines', { method: editing.id ? 'PUT' : 'POST', body: JSON.stringify(form) })
      setMachines(current => [...current.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)))
      setQuery(''); setSelected(saved.id); setEditing(null)
      setSuccess(hasPoint(saved) ? 'Machine and map pin saved.' : 'Machine saved with your full address. The map provider could not find an exact match. Edit the machine to place its pin on the map.')
    } catch (e) { setFormError(e.message) }
    finally { setBusy(false) }
  }
  const remove = async machine => {
    if (!window.confirm(`Remove ${machine.name} from your vending machine library?`)) return
    setBusy(true); setError('')
    try { await api(`/vending-machines/${machine.id}`, { method: 'DELETE' }); setMachines(current => current.filter(item => item.id !== machine.id)); if (selected === machine.id) setSelected(null) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <section className="vending-view">
    <div className="section-head"><div><h2>Vending machine library</h2><p>All your machines, mapped by address.</p></div>{can('RECEIPTS_CREATE') && <button className="button" onClick={() => open(null)}>+ Add machine</button>}</div>
    {success && <p role="status">{success}</p>}
    {error && <p className="rfi-error" role="alert">{error}</p>}
    <div className="vending-toolbar"><label>Find a machine<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or address"/></label><span role="status">{loading ? 'Loading locations...' : `${visible.length} of ${machines.length} machines`}</span></div>
    <LocationMap machines={visible} selected={selected} onSelect={setSelected}/>
    {!loading && !visible.length && <p className="empty">{query ? 'No machines match your search.' : 'Add your first machine with its full address to place a pin on the map.'}</p>}
    <div className="vending-library">{visible.map((machine, index) => <article className={`panel vending-card ${selected === machine.id ? 'selected' : ''}`} key={machine.id}>
      <div className="vending-card-heading"><span className="vending-number">{index + 1}</span><h3>{machine.name}</h3></div><p>{machine.address}</p>{!hasPoint(machine) && <p className="vending-pin-needed">Address saved ? map pin needed</p>}{machine.notes && <p className="vending-notes">{machine.notes}</p>}
      <div className="vending-card-actions"><button className="button secondary" onClick={() => setSelected(machine.id)} disabled={!hasPoint(machine)}>Show pin</button><a className="button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(hasPoint(machine) ? `${machine.latitude},${machine.longitude}` : machine.address)}`} target="_blank" rel="noreferrer">Directions</a>{can('RECEIPTS_UPDATE') && <button className="text-button" onClick={() => open(machine)}>Edit</button>}{can('RECEIPTS_DELETE') && <button className="danger-link" disabled={busy} onClick={() => remove(machine)}>Remove</button>}</div>
    </article>)}</div>
    {editing && <Modal title={editing.id ? 'Edit vending machine' : 'Add vending machine'} onClose={close}><form className="form vending-form" onSubmit={save}>
      <label>Machine name<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Lobby snack machine"/></label>
      <PlaceInput label="Full address" required maxLength={200} endpoint="/vending-machines/locations" value={form.address} onChange={address => { setForm(current => ({ ...current, address, latitude: null, longitude: null })); setPlacingPin(false) }} placeholder="Start typing a place or address"/>
      <small>Include city and province, then select the matching address suggestion.</small>
      <button type="button" className="button secondary" onClick={() => setPlacingPin(value => !value)}>{placingPin ? 'Hide pin picker' : hasPoint(form) ? 'Adjust map pin' : 'Place pin on map (optional)'}</button>
      {placingPin && <div className="vending-pin-picker"><p>Zoom to the machine's location, then tap the map to place its pin. Your address stays unchanged.</p><LocationMap machines={hasPoint(form) ? [{ ...form, id: 'draft', name: form.name || 'Machine location' }] : []} center={hasPoint(form) ? [form.latitude, form.longitude] : undefined} onPick={point => setForm(current => ({ ...current, ...point }))}/>{hasPoint(form) && <p role="status">Pin selected: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</p>}</div>}
      <label>Location notes<textarea rows={3} maxLength={1000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Floor, entrance, or access details"/></label>
      <p>We try to place a pin from your address when saving. If no exact match is available, the address is still saved and you can place the pin manually.</p>
      {formError && <p className="rfi-error" role="alert">{formError}</p>}
      <footer><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Saving location...' : 'Save machine'}</button></footer>
    </form></Modal>}
  </section>
}
