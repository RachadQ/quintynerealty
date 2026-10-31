import { useEffect, useId, useRef, useState } from 'react'
import { api } from './api.js'
import { loadGoogleMaps, googleMapsConfigured } from './googleMaps.js'

const placeSuggestionCache = new Map()

export default function PlaceInput({ label, value, onChange, placeholder, required = false, maxLength = 300, onPlaceSelected, onResolvingChange, endpoint = "/vehicles/place-suggestions" }) {
  const inputId = useId()
  const numberedAddress = value.trim().match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+/)?.[1]
  const selectedAddress = useRef('')
  const session = useRef(null)
  const selectionVersion = useRef(0)
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  // Google verifies street numbers from structured place details on selection.
  // Prediction labels may start with a business name rather than the street number.
  const matchingSuggestions = suggestions.filter(item => item.prediction || !numberedAddress || item.label.toLowerCase().startsWith(`${numberedAddress.toLowerCase()} `))
  useEffect(() => { onResolvingChange?.(selecting) }, [selecting, onResolvingChange])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(false)
    setError('')
    if (value === selectedAddress.current) { setOpen(false); return }
    if (value.trim().length < 6) { setSuggestions([]); setOpen(false); return }
    const cached = !googleMapsConfigured && placeSuggestionCache.get(`${endpoint}:${value.trim().toLowerCase()}`)
    if (cached) { setSuggestions(cached); setOpen(true); return }
    setSuggestions([]); setOpen(true); setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setOpen(true)
      const request = async () => {
        if (!googleMapsConfigured) return api(`${endpoint}?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal })
        const maps = await loadGoogleMaps()
        const { AutocompleteSuggestion, AutocompleteSessionToken } = await maps.importLibrary('places')
        if (!session.current) session.current = new AutocompleteSessionToken()
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value.trim(), includedRegionCodes: ['ca'], sessionToken: session.current })
        return suggestions.filter(item => item.placePrediction).map(item => ({ label: item.placePrediction.text.toString(), prediction: item.placePrediction }))
      }
      request().then(items => {
        if (controller.signal.aborted) return
        if (items.length && !googleMapsConfigured) {
          if (placeSuggestionCache.size >= 250) placeSuggestionCache.delete(placeSuggestionCache.keys().next().value)
          placeSuggestionCache.set(`${endpoint}:${value.trim().toLowerCase()}`, items)
        }
        setSuggestions(items)
      }).catch(() => { if (!controller.signal.aborted) { setSuggestions([]); setError('Address search is unavailable. You can keep your entered address.') } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [value, endpoint])
  const choose = async item => {
    const version = ++selectionVersion.current
    setSelecting(true); setError('')
    try {
      let address = item.label
      let point = null
      if (item.prediction) {
        const place = item.prediction.toPlace()
        await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] })
        session.current = null
        if (version !== selectionVersion.current) return
        const matchedNumber = place.addressComponents?.find(part => part.types.includes('street_number'))?.longText
        if (numberedAddress && matchedNumber?.toLowerCase() !== numberedAddress.toLowerCase()) throw new Error('Choose a result containing the full street number, or keep your entered address.')
        address = place.formattedAddress || address
        if (place.location) point = { latitude: place.location.lat(), longitude: place.location.lng() }
      }
      if (version !== selectionVersion.current) return
      if (address.length > maxLength) throw new Error('This address is too long. Keep a shorter street address including city and postal code.')
      selectedAddress.current = address; onChange(address)
      if (point) onPlaceSelected?.(point)
      setOpen(false)
    } catch (e) { if (version === selectionVersion.current) setError(e.message) }
    finally { if (version === selectionVersion.current) setSelecting(false) }
  }
  useEffect(() => () => { selectionVersion.current += 1 }, [])
  return <label className="place-field">{label}<input id={inputId} autoComplete="off" required={required} maxLength={maxLength} value={value} onFocus={() => value.trim().length >= 6 && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={e => { selectionVersion.current += 1; setSelecting(false); onChange(e.target.value) }} placeholder={placeholder}/>{open && <div className="place-suggestions" role="listbox"><button type="button" role="option" className="use-entered-address" onMouseDown={e => e.preventDefault()} onClick={() => { selectionVersion.current += 1; setSelecting(false); setOpen(false) }}><strong>Use entered address</strong><span>{value.trim()}</span></button>{(loading || selecting) && <p className="place-search-status">{selecting ? 'Loading selected address...' : 'Searching addresses...'}</p>}{!loading && !error && matchingSuggestions.length === 0 && <p className="place-search-status">No exact address match. Your entered address is kept.</p>}{matchingSuggestions.map((item,index) => <button type="button" role="option" disabled={selecting} key={`${item.label}-${index}`} onMouseDown={e => e.preventDefault()} onClick={() => choose(item)}>{item.label}</button>)}{googleMapsConfigured && <img className="google-places-attribution" src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google"/>}</div>}{error && <small role="alert">{error}</small>}</label>
}
