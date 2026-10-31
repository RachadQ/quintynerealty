import { useEffect, useId, useRef, useState } from 'react'
import { api } from './api.js'

const placeSuggestionCache = new Map()

export default function PlaceInput({ label, value, onChange, placeholder, required = false, maxLength = 300, endpoint = "/vehicles/place-suggestions" }) {
  const inputId = useId()
  const numberedAddress = value.trim().match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+/)?.[1]
  const selectedAddress = useRef('')
  const [suggestions, setSuggestions] = useState([])
  const matchingSuggestions = suggestions.filter(item => !numberedAddress || item.label.toLowerCase().startsWith(`${numberedAddress.toLowerCase()} `))
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(false)
    if (value === selectedAddress.current) { setOpen(false); return }
    if (value.trim().length < 6) { setSuggestions([]); setOpen(false); return }
    const cached = placeSuggestionCache.get(`${endpoint}:${value.trim().toLowerCase()}`)
    if (cached) { setSuggestions(cached); setOpen(true); return }
    setSuggestions([]); setOpen(true); setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setOpen(true)
      api(`${endpoint}?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal })
        .then(items => { if (!controller.signal.aborted) { if (items.length) { if (placeSuggestionCache.size >= 250) placeSuggestionCache.delete(placeSuggestionCache.keys().next().value); placeSuggestionCache.set(`${endpoint}:${value.trim().toLowerCase()}`, items) } setSuggestions(items) } })
        .catch(error => { if (!controller.signal.aborted) setSuggestions([]) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [value, endpoint])
  return <label className="place-field">{label}<input id={inputId} autoComplete="off" required={required} maxLength={maxLength} value={value} onFocus={() => value.trim().length >= 6 && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>{open && <div className="place-suggestions" role="listbox"><button type="button" role="option" className="use-entered-address" onMouseDown={e => e.preventDefault()} onClick={() => setOpen(false)}><strong>Use entered address</strong><span>{value.trim()}</span></button>{loading && <p className="place-search-status">Searching Canadian addresses…</p>}{!loading && matchingSuggestions.length === 0 && <p className="place-search-status">No exact address match. Your entered address is kept. Include city and province; vending machine pins can also be placed manually.</p>}{matchingSuggestions.filter(item => item.label.toLowerCase() !== value.trim().toLowerCase()).map((item,index) => <button type="button" role="option" key={`${item.longitude}-${item.latitude}-${index}`} onMouseDown={e => e.preventDefault()} onClick={() => { selectedAddress.current = item.label; onChange(item.label); setOpen(false) }}>{item.label}</button>)}</div>}</label>
}

