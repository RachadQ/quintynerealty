import { useEffect, useId, useRef, useState } from 'react'
import { api } from './api.js'

const vehicleCatalogCache = new Map()
const placeSuggestionCache = new Map()

function PlaceInput({ label, value, onChange, placeholder }) {
  const inputId = useId()
  const selectedAddress = useRef('')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(false)
    if (value === selectedAddress.current) { setOpen(false); return }
    if (value.trim().length < 6) { setSuggestions([]); setOpen(false); return }
    const cached = placeSuggestionCache.get(value.trim().toLowerCase())
    if (cached) { setSuggestions(cached); setOpen(true); return }
    setSuggestions([]); setOpen(true); setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setOpen(true)
      api(`/vehicles/place-suggestions?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal })
        .then(items => { if (!controller.signal.aborted) { if (items.length) { if (placeSuggestionCache.size >= 250) placeSuggestionCache.delete(placeSuggestionCache.keys().next().value); placeSuggestionCache.set(value.trim().toLowerCase(), items) } setSuggestions(items) } })
        .catch(error => { if (!controller.signal.aborted) setSuggestions([]) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [value])
  return <label className="place-field">{label}<input id={inputId} autoComplete="off" maxLength="300" value={value} onFocus={() => value.trim().length >= 6 && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>{open && <div className="place-suggestions" role="listbox"><button type="button" role="option" className="use-entered-address" onMouseDown={e => e.preventDefault()} onClick={() => setOpen(false)}><strong>Use entered address</strong><span>{value.trim()}</span></button>{loading && <p className="place-search-status">Searching Canadian addresses…</p>}{!loading && suggestions.length === 0 && <p className="place-search-status">No matching suggestions. You can use the address exactly as entered.</p>}{suggestions.filter(item => item.label.toLowerCase() !== value.trim().toLowerCase()).map((item,index) => <button type="button" role="option" key={`${item.longitude}-${item.latitude}-${index}`} onMouseDown={e => e.preventDefault()} onClick={() => { selectedAddress.current = item.label; onChange(item.label); setOpen(false) }}>{item.label}</button>)}</div>}</label>
}

export default function GasVehicles({ vehicles, receipts, canCreate, canDelete, onRefresh, onAddReceipt }) {
  const [vehicleForm, setVehicleForm] = useState({ name: '', make: '', model: '', year: '', fuel_efficiency_l_per_100km: '' })
  const [trip, setTrip] = useState({ vehicle_id: vehicles.find(vehicle => vehicle.is_default)?.id || vehicles[0]?.id || '', receipt_id: '', distance_km: '', purpose: 'business', occurred_at: new Date().toISOString().slice(0, 10), notes: '', start_location: '', end_location: '' })
  const [busy, setBusy] = useState(false)
  const [routeBusy, setRouteBusy] = useState(false)
  const [routeMessage, setRouteMessage] = useState('')
  const [routeError, setRouteError] = useState('')
  const lastAutoRoute = useRef('')
  const [catalogMakes, setCatalogMakes] = useState([])
  const [catalogModels, setCatalogModels] = useState({})
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [vehicleSaving, setVehicleSaving] = useState(false)
  const [vehicleError, setVehicleError] = useState('')
  const [catalogVehicles, setCatalogVehicles] = useState([])
  const [manualVehicle, setManualVehicle] = useState(false)
  const [catalogSelection, setCatalogSelection] = useState('')
  const [insuranceDrafts, setInsuranceDrafts] = useState({})
  useEffect(() => {
    const year = Number(vehicleForm.year)
    setCatalogMakes([]); setCatalogModels({}); setCatalogError(''); setCatalogLoading(false)
    if (manualVehicle || year < 1995 || year > 2026) return undefined
    const controller = new AbortController()
    const apply = data => { setCatalogMakes(data.makes || []); setCatalogModels(data.models_by_make || {}) }
    if (vehicleCatalogCache.has(year)) { apply(vehicleCatalogCache.get(year)); return undefined }
    setCatalogLoading(true)
    api(`/vehicles/catalog?year=${year}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { vehicleCatalogCache.set(year, data); apply(data) } })
      .catch(error => { if (!controller.signal.aborted) setCatalogError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false) })
    return () => controller.abort()
  }, [vehicleForm.year, manualVehicle])
  useEffect(() => {
    setCatalogVehicles(catalogModels[vehicleForm.make] || [])
  }, [vehicleForm.make, catalogModels])
  useEffect(() => { if (!trip.vehicle_id && vehicles.length) setTrip(current => ({ ...current, vehicle_id: vehicles.find(vehicle => vehicle.is_default)?.id || vehicles[0].id })) }, [vehicles, trip.vehicle_id])
  const setDefault = async vehicle => { setBusy(true); try { await api(`/vehicles/${vehicle.id}/default`, { method: 'PATCH' }); setTrip(current => ({ ...current, vehicle_id: vehicle.id, receipt_id: '' })); await onRefresh() } finally { setBusy(false) } }
  const removeVehicle = async vehicle => {
    if (!window.confirm(`Remove ${vehicle.name}?`)) return
    setBusy(true)
    try {
      await api(`/vehicles/${vehicle.id}`, { method: 'DELETE' })
      if (trip.vehicle_id === vehicle.id) setTrip(current => ({ ...current, vehicle_id: '' }))
      await onRefresh()
    } finally { setBusy(false) }
  }
  const saveInsurance = async (event, vehicle) => {
    event.preventDefault()
    const draft = insuranceDrafts[vehicle.id] || {}
    setBusy(true)
    try {
      await api(`/vehicles/${vehicle.id}/insurance`, { method: 'PATCH', body: JSON.stringify({
        monthly_insurance_cost: Number(draft.monthly_insurance_cost ?? vehicle.insurance?.monthly_cost ?? 0),
      }) })
      await onRefresh()
    } finally { setBusy(false) }
  }
  const createVehicle = async event => {
    event.preventDefault(); setVehicleSaving(true); setVehicleError('')
    try {
      await api('/vehicles', { method: 'POST', body: JSON.stringify({ ...vehicleForm, name: vehicleForm.name.trim() || [vehicleForm.year, vehicleForm.make, vehicleForm.model].filter(Boolean).join(' '), year: vehicleForm.year ? Number(vehicleForm.year) : null, fuel_efficiency_l_per_100km: Number(vehicleForm.fuel_efficiency_l_per_100km) }) })
      setVehicleForm({ name: '', make: '', model: '', year: '', fuel_efficiency_l_per_100km: '' }); setCatalogSelection(''); await onRefresh()
    } catch (error) { setVehicleError(error.message) }
    finally { setVehicleSaving(false) }
  }
  const calculateDistance = async () => {
    if (!trip.start_location.trim() || !trip.end_location.trim()) return
    setRouteBusy(true); setRouteError(''); setRouteMessage('Finding addresses and calculating the driving route...')
    try {
      const result = await api('/vehicles/route-distance', { method: 'POST', body: JSON.stringify({ start_location: trip.start_location, end_location: trip.end_location }) })
      lastAutoRoute.current = `${result.start_location.trim()}|${result.end_location.trim()}`
      setTrip(current => ({ ...current, distance_km: String(result.distance_km), start_location: result.start_location, end_location: result.end_location }))
      setRouteMessage(`${result.distance_km} km driving distance calculated.`)
    } catch (error) {
      setRouteMessage(''); setRouteError(`${error.message} Try a complete street address with city and province, or enter the distance manually.`)
    } finally { setRouteBusy(false) }
  }
  useEffect(() => {
    const start = trip.start_location.trim()
    const end = trip.end_location.trim()
    if (start.length < 3 || end.length < 3) return undefined
    const routeKey = `${start}|${end}`
    if (routeKey === lastAutoRoute.current) return undefined
    const timer = setTimeout(() => {
      lastAutoRoute.current = routeKey
      calculateDistance()
    }, 900)
    return () => clearTimeout(timer)
  }, [trip.start_location, trip.end_location])
  const selectedVehicle = vehicles.find(vehicle => vehicle.id === trip.vehicle_id)
  const activeFuel = selectedVehicle?.receipt_usage?.find(item => item.remaining_litres > 0)
  const activeReceipt = receipts.find(item => item.id === activeFuel?.receipt_id)
  const hasGasReceipts = receipts.some(item => item.vehicle_id === trip.vehicle_id)
  const [tripError, setTripError] = useState('')
  const [spreadsheetSync, setSpreadsheetSync] = useState(null)
  const [lastSavedTrip, setLastSavedTrip] = useState(null)
  const retrySpreadsheet = async () => {
    if (!lastSavedTrip) return
    setBusy(true)
    try { setSpreadsheetSync(await api(`/vehicles/${lastSavedTrip.vehicle_id}/trips/${lastSavedTrip.id}/sync-spreadsheet`, { method: 'POST' })) }
    catch (error) { setTripError(error.message) }
    finally { setBusy(false) }
  }
  const createTrip = async event => {
    event.preventDefault(); setBusy(true); setTripError(''); setSpreadsheetSync({status:'syncing', message:'Saving trip and updating the OneDrive spreadsheet...'})
    try {
      const saved = await api(`/vehicles/${trip.vehicle_id}/trips`, { method: 'POST', body: JSON.stringify({ ...trip, distance_km: Number(trip.distance_km), vehicle_id: undefined, receipt_id: undefined }) })
      setLastSavedTrip(saved); setSpreadsheetSync(saved.spreadsheet_sync)
      setTrip(current => ({ ...current, distance_km: '', notes: '' })); await onRefresh()
    } catch (error) { setTripError(error.message); setSpreadsheetSync(null) }
    finally { setBusy(false) }
  }
  return <section className="gas-vehicles">
    <div className="section-head"><div><h2>Gas receipts & vehicles</h2><p>Gas receipts add litres. Trips use fuel based on each vehicle’s L/100 km rating.</p></div>{canCreate && <button className="button" onClick={onAddReceipt}>+ Add gas receipt</button>}</div>
    {vehicles.length > 0 && <div className="panel default-vehicle-picker"><label>Default vehicle<select name="default_vehicle_id" value={vehicles.find(vehicle => vehicle.is_default)?.id || ''} disabled={busy} onChange={e => { const vehicle = vehicles.find(item => item.id === e.target.value); if (vehicle) setDefault(vehicle) }}><option value="">Select default vehicle</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}{vehicle.make || vehicle.model ? ` - ${[vehicle.make, vehicle.model].filter(Boolean).join(' ')}` : ''}</option>)}</select></label><small>New gas receipts and trips will use this vehicle automatically.</small></div>}
    <div className="vehicle-grid">{vehicles.map(vehicle => <article className="panel vehicle-card" key={vehicle.id}><div className="vehicle-title"><h3>{vehicle.name}</h3><div className="vehicle-actions">{vehicle.is_default ? <span className="tag purple">Default vehicle</span> : canCreate && <button type="button" className="text-button" disabled={busy} onClick={() => setDefault(vehicle)}>Set as default</button>}{canDelete && <button type="button" className="danger-link" disabled={busy} onClick={() => removeVehicle(vehicle)}>Remove vehicle</button>}</div></div><p>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle details not set'}</p><div className="job-budget-stats"><div><span>Efficiency</span><strong>{vehicle.fuel_efficiency_l_per_100km} L/100 km</strong></div><div><span>Fuel balance</span><strong>{vehicle.fuel.remaining_litres} L</strong><small>{vehicle.fuel.gas_receipt_count} gas receipts</small></div><div><span>Estimated range</span><strong>{vehicle.fuel.estimated_range_km} km</strong><small>{vehicle.fuel.trip_distance_km} km logged</small></div></div><section className="vehicle-insurance"><div className="vehicle-insurance-summary"><div><span>Monthly insurance</span><strong>CA${Number(vehicle.insurance?.monthly_cost || 0).toFixed(2)}</strong></div><div><span>{vehicle.insurance?.year} business use</span><strong>{vehicle.insurance?.business_use_percent || 0}%</strong><small>{vehicle.insurance?.business_km || 0} of {vehicle.insurance?.annual_total_km || 0} km</small></div><div><span>Estimated business share of insurance</span><strong>CA${Number(vehicle.insurance?.deductible_amount || 0).toFixed(2)}</strong><small>Annual cost × business use</small></div></div>{canCreate && <form className="vehicle-insurance-form" onSubmit={event => saveInsurance(event, vehicle)}><label>Monthly insurance (CAD)<input name={`vehicles[${vehicle.id}][monthly_insurance_cost]`} required type="number" min="0" max="100000" step="0.01" value={insuranceDrafts[vehicle.id]?.monthly_insurance_cost ?? vehicle.insurance?.monthly_cost ?? ''} onChange={event => setInsuranceDrafts(current => ({...current, [vehicle.id]: {...current[vehicle.id], monthly_insurance_cost:event.target.value}}))}/></label><label>{vehicle.insurance?.year} logged kilometres<input readOnly value={vehicle.insurance?.annual_total_km || 0} aria-label="Annual kilometres calculated from logged trips"/><small>Updates automatically as you log trips.</small></label><button className="button secondary" disabled={busy}>Save insurance</button></form>}<p className="vehicle-mileage-note">Annual totals include business and personal trips logged for this year. Include all driving for a complete total. Earlier trips count as business trips.</p></section>{vehicle.fuel.overdrawn && <p className="job-budget-alert">Trips use more fuel than the litres currently recorded.</p>}</article>)}{!vehicles.length && <p className="empty">Add a vehicle to start tracking fuel and trips.</p>}</div>
    {canCreate && <div className="gas-forms"><form className="panel form" onSubmit={createVehicle}><div className="vehicle-title"><h3>Add vehicle</h3><button type="button" className="text-button" onClick={() => setManualVehicle(value => !value)}>{manualVehicle ? 'Use Canadian vehicle library' : 'Enter manually'}</button></div>{manualVehicle ? <><label>Vehicle name<input name="vehicle_name" required value={vehicleForm.name} onChange={e => setVehicleForm({...vehicleForm, name:e.target.value})} placeholder="Work van"/></label><div className="form-row"><label>Make<input name="vehicle_make" required value={vehicleForm.make} onChange={e => setVehicleForm({...vehicleForm, make:e.target.value})}/></label><label>Model<input name="vehicle_model" required value={vehicleForm.model} onChange={e => setVehicleForm({...vehicleForm, model:e.target.value})}/></label></div><div className="form-row"><label>Year<input name="vehicle_year" type="number" min="1981" max="2100" value={vehicleForm.year} onChange={e => setVehicleForm({...vehicleForm, year:e.target.value})}/></label><label>Fuel efficiency (L/100 km)<input name="vehicle_fuel_efficiency_l_per_100km" required type="number" min="0.1" max="100" step="0.1" value={vehicleForm.fuel_efficiency_l_per_100km} onChange={e => setVehicleForm({...vehicleForm, fuel_efficiency_l_per_100km:e.target.value})}/></label></div></> : <><label>Model year<select name="vehicle_year" required value={vehicleForm.year} onChange={e => { setCatalogSelection(''); setVehicleForm({...vehicleForm, year:e.target.value, make:'', model:'', fuel_efficiency_l_per_100km:''}) }}><option value="">Select year</option>{Array.from({length:32},(_,index)=>2026-index).map(year => <option key={year} value={year}>{year}</option>)}</select></label><label>Make<select name="vehicle_make" required disabled={catalogLoading || !vehicleForm.year || !catalogMakes.length} value={vehicleForm.make} onChange={e => { setCatalogSelection(''); setVehicleForm({...vehicleForm, make:e.target.value, model:'', fuel_efficiency_l_per_100km:''}) }}><option value="">{catalogLoading ? 'Loading vehicle makes...' : vehicleForm.year ? 'Select make' : 'Select year first'}</option>{catalogMakes.map(make => <option key={make} value={make}>{make}</option>)}</select></label><label>Model and configuration<select name="vehicle_catalog_selection" required disabled={!vehicleForm.make || !catalogVehicles.length} value={catalogSelection} onChange={e => { if (e.target.value === '') { setCatalogSelection(''); setVehicleForm({...vehicleForm, model:'', name:'', fuel_efficiency_l_per_100km:''}); return } const option=catalogVehicles[Number(e.target.value)]; setCatalogSelection(e.target.value); if(option) setVehicleForm({...vehicleForm, model:option.model, fuel_efficiency_l_per_100km:String(option.fuel_efficiency_l_per_100km), name:`${vehicleForm.year} ${vehicleForm.make} ${option.model}`}) }}><option value="">{vehicleForm.make ? 'Select model' : 'Select make first'}</option>{catalogVehicles.map((item,index) => <option key={`${item.model}-${item.fuel_efficiency_l_per_100km}-${index}`} value={index}>{item.model} - {item.fuel_efficiency_l_per_100km} L/100 km</option>)}</select></label>{vehicleForm.fuel_efficiency_l_per_100km && <div className="vehicle-rating"><span>Combined fuel rating</span><strong>{vehicleForm.fuel_efficiency_l_per_100km} L/100 km</strong><small>Natural Resources Canada</small></div>}</>}<div aria-live="polite">{catalogLoading && !manualVehicle && <p>Loading Canadian vehicle ratings... The first download can take a moment.</p>}{catalogError && !manualVehicle && <p className="rfi-error" role="alert">{catalogError} You can enter the vehicle manually.</p>}{vehicleError && <p className="rfi-error" role="alert">{vehicleError}</p>}</div><button className="button" disabled={busy || vehicleSaving || (!manualVehicle && (!vehicleForm.model || catalogLoading))}>{vehicleSaving ? 'Saving vehicle...' : 'Add vehicle'}</button></form><form className="panel form" onSubmit={createTrip}><h3>Log trip</h3><label>Trip type<select name="trip_purpose" value={trip.purpose} onChange={e => setTrip({...trip, purpose:e.target.value})}><option value="business">Business</option><option value="personal">Personal</option></select></label><label>Vehicle<select name="trip_vehicle_id" required value={trip.vehicle_id} onChange={e => setTrip({...trip, vehicle_id:e.target.value, receipt_id:''})}><option value="">Select vehicle</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label><label>Gas receipt (automatic)<input readOnly value={activeReceipt ? `${activeReceipt.vendor || activeReceipt.filename} - ${activeFuel.remaining_litres} L remaining` : hasGasReceipts ? 'Recorded fuel exhausted - add your next gas receipt' : 'Add a gas receipt for this vehicle'}/><small>Uses the oldest receipt first. Trips automatically continue into the next receipt when needed.</small></label><div className="form-row"><PlaceInput label="From" value={trip.start_location} onChange={value => setTrip({...trip, start_location:value})} placeholder="Start typing a place or address"/><PlaceInput label="To" value={trip.end_location} onChange={value => setTrip({...trip, end_location:value})} placeholder="Start typing a destination"/></div><button type="button" className="button secondary" disabled={routeBusy || !trip.start_location.trim() || !trip.end_location.trim()} onClick={calculateDistance}>{routeBusy ? 'Calculating...' : 'Calculate driving distance'}</button>{routeMessage && <p className="route-success" role="status">{routeMessage}</p>}{routeError && <p className="rfi-error" role="alert">{routeError}</p>}<div className="form-row"><label>Distance (km)<input name="trip_distance_km" required type="number" min="0.1" step="0.1" value={trip.distance_km} onChange={e => setTrip({...trip, distance_km:e.target.value})}/></label><label>Date<input name="trip_occurred_at" required type="date" value={trip.occurred_at} onChange={e => setTrip({...trip, occurred_at:e.target.value})}/></label></div><label>Notes<input name="trip_notes" maxLength="500" value={trip.notes} onChange={e => setTrip({...trip, notes:e.target.value})}/></label><div aria-live="polite">{spreadsheetSync && <p>{spreadsheetSync.message}</p>}{spreadsheetSync?.web_url && <a href={spreadsheetSync.web_url} target="_blank" rel="noreferrer">Open trip spreadsheet in OneDrive</a>}{['failed', 'not_connected'].includes(spreadsheetSync?.status) && <button type="button" className="button secondary" disabled={busy} onClick={retrySpreadsheet}>Retry spreadsheet sync</button>}{tripError && <p className="rfi-error" role="alert">{tripError}</p>}</div><button className="button" disabled={busy || !vehicles.length || !hasGasReceipts}>{busy ? 'Saving...' : 'Log trip'}</button></form></div>}
    <div className="document-grid">{receipts.map(item => { const usage = vehicles.flatMap(vehicle => vehicle.receipt_usage || []).find(entry => entry.receipt_id === item.id); const curr = (!item.currency || item.currency === 'CHF') ? 'CAD' : item.currency; return <article className="document-card" key={item.id}><div className="doc-main"><h3>{item.vendor || item.filename}</h3><p>{item.fuel_litres || 0} L · {item.amount != null ? `${curr} ${Number(item.amount).toFixed(2)}` : 'Amount unavailable'}</p><div className="receipt-trip-usage"><span>Logged</span><strong>{usage?.distance_km || 0} km</strong><small>{usage?.used_litres || 0} L used · {usage?.remaining_litres ?? item.fuel_litres ?? 0} L remaining · {usage?.trip_count || 0} trip{usage?.trip_count === 1 ? '' : 's'}</small></div></div></article> })}</div>
  </section>
}

