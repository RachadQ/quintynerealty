import { useEffect, useMemo, useRef, useState } from 'react'
import LocationMap from './LocationMap.jsx'
import { geocodeGoogleAddress, googleMapsConfigured } from './googleMaps.js'
import { api } from './api.js'
import PlaceInput from './PlaceInput.jsx'
import { machineDirectionsUrl } from './machineDirections.js'

const blank = { name: '', address: '', notes: '', latitude: null, longitude: null }
const hasPoint = machine => Number.isFinite(machine.latitude) && Number.isFinite(machine.longitude)

export default function VendingMachines({ can, Modal }) {
  const [machines, setMachines] = useState([])
  const locationMap = useRef(null)
  const [focusVersion, setFocusVersion] = useState(0)
  const showMachine = id => { setSelected(id); setFocusVersion(value => value + 1); locationMap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [placingPin, setPlacingPin] = useState(false)
  const [resolvingAddress, setResolvingAddress] = useState(false)
  const [success, setSuccess] = useState('')
  const visible = useMemo(() => machines.filter(machine => `${machine.name} ${machine.address} ${machine.notes}`.toLowerCase().includes(query.toLowerCase())), [machines, query])
  useEffect(() => {
    let active = true
    api('/vending-machines').then(data => { if (active) setMachines(data) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const open = machine => { setEditing(machine || {}); setForm(machine ? { name: machine.name, address: machine.address, notes: machine.notes || '', latitude: machine.latitude ?? null, longitude: machine.longitude ?? null } : blank); setPlacingPin(Boolean(machine && hasPoint(machine))); setResolvingAddress(false); setFormError('') }
  const close = () => { if (!busy && !resolvingAddress) setEditing(null) }
  const save = async event => {
    event.preventDefault(); if (resolvingAddress) return; setBusy(true); setFormError('')
    try {
      let payload = form
      if (googleMapsConfigured && !hasPoint(form)) {
        try { const point = await geocodeGoogleAddress(form.address); if (point) payload = { ...form, ...point } } catch { /* Keep the entered address saveable when Google is unavailable. */ }
      }
      const saved = await api(editing.id ? `/vending-machines/${editing.id}` : '/vending-machines', { method: editing.id ? 'PUT' : 'POST', body: JSON.stringify(payload) })
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
    <div className="vending-explorer">
    <div className="vending-explorer-map" ref={locationMap}><LocationMap machines={visible} selected={selected} focusVersion={focusVersion} onSelect={setSelected}/></div>
    <div className="vending-directory"><header><strong>Machine locations</strong><span>{visible.filter(hasPoint).length} mapped</span></header><p className="vending-directory-hint">Select a machine to fly to its location.</p>
    {!loading && !visible.length && <p className="empty">{query ? 'No machines match your search.' : 'Add your first machine with its full address to place a pin on the map.'}</p>}
    <div className="vending-library">{visible.map((machine, index) => <article className={`panel vending-card ${selected === machine.id ? 'selected' : ''}`} key={machine.id}>
      <button type="button" className="vending-destination" onClick={() => showMachine(machine.id)} disabled={!hasPoint(machine)} aria-label={`Show ${machine.name} on the map`} aria-pressed={selected === machine.id}><div className="vending-card-heading"><span className="vending-number">{index + 1}</span><h3>{machine.name}</h3></div><p>{machine.address}</p></button>{!hasPoint(machine) && <p className="vending-pin-needed">Address saved - map pin needed</p>}{machine.notes && <p className="vending-notes">{machine.notes}</p>}
      <div className="vending-card-actions"><button className="button secondary" onClick={() => showMachine(machine.id)} disabled={!hasPoint(machine)}>Show pin</button><a className="button secondary" href={machineDirectionsUrl(machine)} target="_blank" rel="noreferrer">Directions</a>{can('RECEIPTS_UPDATE') && <button className="text-button" onClick={() => open(machine)}>Edit</button>}{can('RECEIPTS_DELETE') && <button className="danger-link" disabled={busy} onClick={() => remove(machine)}>Remove</button>}</div>
    </article>)}</div></div></div>
    {editing && <Modal title={editing.id ? 'Edit vending machine' : 'Add vending machine'} onClose={close}><form className="form vending-form" onSubmit={save}>
      <label>Machine name<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Lobby snack machine"/></label>
      <PlaceInput label="Full address" required maxLength={200} endpoint="/vending-machines/locations" value={form.address} onChange={address => { setForm(current => ({ ...current, address, latitude: null, longitude: null })); setPlacingPin(false) }} onResolvingChange={setResolvingAddress} onPlaceSelected={point => { setForm(current => ({ ...current, ...point })); setPlacingPin(true) }} placeholder="Start typing a place or address"/>
      <small>Search for the full street address, then select a suggestion to show the machine on the map.</small>
      <button type="button" className="button secondary" onClick={() => setPlacingPin(value => !value)}>{placingPin ? 'Hide location map' : hasPoint(form) ? 'Show location map' : 'Choose location on map (optional)'}</button>
      {placingPin && <div className="vending-pin-picker"><p>This pin shows where the machine is located. Tap the map to adjust its position if needed.</p><LocationMap machines={hasPoint(form) ? [{ ...form, id: 'draft', name: form.name || 'Machine location' }] : []} center={hasPoint(form) ? [form.latitude, form.longitude] : undefined} onPick={point => setForm(current => ({ ...current, ...point }))}/>{hasPoint(form) && <p role="status">Pin selected: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</p>}</div>}
      <label>Location notes<textarea rows={3} maxLength={1000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Floor, entrance, or access details"/></label>
      <p>We try to place a pin from your address when saving. If no exact match is available, the address is still saved and you can place the pin manually.</p>
      {formError && <p className="rfi-error" role="alert">{formError}</p>}
      <footer><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button><button className="button" disabled={busy || resolvingAddress}>{resolvingAddress ? 'Finding address...' : busy ? 'Saving location...' : 'Save machine'}</button></footer>
    </form></Modal>}
  </section>
}
