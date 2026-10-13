import ReceiptsView from './ReceiptsView.jsx'
import { BUSINESS_ACTIVITIES } from './businessActivities.js'
import { validateSession } from './session.js'
import { useCallback, useId, useEffect, useMemo, useRef, useState } from 'react'
import { API_URL, api } from './api.js'
import GasVehicles from './GasVehicles.jsx'
import companyLogo from './assets/quintyne-realty-logo.svg'

const NAV = [
  ['receipts', 'Receipts', 'R'],
  ['gas', 'Gas & vehicles', 'G'],
  ['overview', 'Overview', '⌂'],
  ['reports', 'Financial reports', '↗'],
  ['users', 'Users', '♙'],
  ['roles', 'Roles & permissions', '◇'],
  ['audit', 'Audit log', '≡'],
]


const ALL_PERMISSIONS = [
  'CONFIG_USERS_READ', 'CONFIG_USERS_CREATE', 'CONFIG_USERS_UPDATE', 'CONFIG_USERS_DELETE',
  'CONFIG_ROLES_READ', 'CONFIG_ROLES_CREATE', 'CONFIG_ROLES_UPDATE', 'AUDIT_LOG_READ',
  'RECEIPTS_READ', 'RECEIPTS_CREATE', 'RECEIPTS_UPDATE', 'RECEIPTS_DELETE',
]

const initials = (name = '') => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U'
const fmtDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

let googleIdentityScript
let googleIdentityClientId = ''
let googleIdentityCallback

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!googleIdentityScript) {
    googleIdentityScript = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = resolve
      script.onerror = () => reject(new Error('Google sign-in could not be loaded.'))
      document.head.appendChild(script)
    })
  }
  return googleIdentityScript
}

function initializeGoogleIdentity(clientId, callback) {
  googleIdentityCallback = callback
  if (googleIdentityClientId === clientId) return
  window.google.accounts.id.initialize({
    client_id: clientId,
    auto_select: false,
    callback: (response) => googleIdentityCallback?.(response),
  })
  googleIdentityClientId = clientId
}

function Login({ onSignedIn, error, onDevLogin }) {
  const buttonRef = useRef(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const setup = async () => {
      try {
        const { client_id: clientId } = await api('/auth/google/config')
        if (!active) return
        if (!clientId) {
          setMessage('Google sign-in is not configured for this deployment.')
          return
        }
        await loadGoogleIdentityScript()
        if (!active || !buttonRef.current) return
        initializeGoogleIdentity(clientId, async ({ credential }) => {
          if (!credential) {
            setMessage('Google did not return a sign-in credential.')
            return
          }
          setBusy(true)
          setMessage('')
          try {
            await api('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) })
            await onSignedIn()
          } catch (error) {
            setMessage(error.message)
          } finally {
            setBusy(false)
          }
        })
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular',
          width: Math.floor(buttonRef.current.clientWidth),
        })
      } catch (error) {
        if (active) setMessage(error.message)
      }
    }
    setup()
    return () => { active = false }
  }, [onSignedIn])

  return <main className="login-shell">
    <section className="login-card">
      <img className="brand-logo" src={companyLogo} alt="Quintyne Realty inc"/>
      <p className="eyebrow">Quintyne Realty inc</p>
      <h1>Welcome back</h1>
      <p className="muted">Sign in with a Google account enabled by your administrator.</p>
      {error && <p className="login-notice error" role="alert">{error}</p>}
      {error && <button className="button secondary" onClick={onSignedIn}>Retry connection</button>}
      {import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === 'bypass' && <button className="button secondary" onClick={onDevLogin}>Sign in as Local Developer</button>}
      <div className="google-login-button" ref={buttonRef} aria-busy={busy} />
      {busy && <p className="login-notice" role="status">Signing in…</p>}
      {message && <p className="login-notice error" role="alert">{message}</p>}
      <p className="login-foot">Protected access</p>
    </section>
  </main>
}

function Modal({ title, children, onClose, wide = false }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></header>
      {children}
    </section>
  </div>
}

function UserForm({ roles, user, onSave, onClose }) {
  const [form, setForm] = useState({ full_name: user?.full_name || '', email: user?.email || '', is_active: user?.is_active ?? true, is_super_admin: user?.is_super_admin || false, role_ids: user?.role_ids || [] })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { await onSave(form) } finally { setBusy(false) } }
  return <form onSubmit={submit} className="form">
    <label>Full name<input name="full_name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
    {!user && <label>Email address<input name="email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></label>}
    <label>Roles<select name="role_ids" multiple value={form.role_ids} onChange={(e) => setForm({ ...form, role_ids: [...e.target.selectedOptions].map(o => o.value) })}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><small>Hold Ctrl or Cmd to select more than one.</small></label>
    <label className="check"><input name="is_active" type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active account</label>
    <label className="check"><input name="is_super_admin" type="checkbox" checked={form.is_super_admin} onChange={(e) => setForm({ ...form, is_super_admin: e.target.checked })} /> Super administrator</label>
    <footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save user'}</button></footer>
  </form>
}

function RoleForm({ role, onSave, onClose }) {
  const [form, setForm] = useState({ code: role?.code || '', name: role?.name || '', permissions: role?.permissions || [], is_active: role?.is_active ?? true })
  const toggle = (p) => setForm({ ...form, permissions: form.permissions.includes(p) ? form.permissions.filter(x => x !== p) : [...form.permissions, p] })
  return <form className="form" onSubmit={(e) => { e.preventDefault(); onSave(form) }}>
    <label>Role name<input name="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    {!role && <label>Role code<input name="code" required pattern="[A-Z][A-Z0-9_]{1,63}" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} placeholder="TEAM_MANAGER" /></label>}
    <fieldset><legend>Permissions</legend><div className="permission-grid">{ALL_PERMISSIONS.map(p => <label className="check" key={p}><input name={`permissions[${p}]`} type="checkbox" checked={form.permissions.includes(p)} onChange={() => toggle(p)} /> {p.replaceAll('_', ' ').toLowerCase()}</label>)}</div></fieldset>
    {role && <label className="check"><input name="is_active" type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active role</label>}
    <footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button">Save role</button></footer>
  </form>
}

const CATEGORIES = [
  ['gas', 'Gas'], ['client_meals', 'Restaurant / client expenses'], ['maintenance', 'Maintenance'],
  ['job_expense', 'Business expenses'], ['other', 'Other'],
]

export function DropZone({
  onFilesSelected,
  multiple = true,
  accept = "image/*,application/pdf,.heic,.heif,.jpg,.jpeg,.png,.webp",
  title = "Drop files here or tap to browse",
  subtitle = "Supports images, camera photos & PDF",
  compact = false,
  allowCamera = true,
  currentFileName = "",
  icon = "⬆️",
}) {
  const uploadId = useId()
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragging) setDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }

  return (
    <div
      className={`app-dropzone ${compact ? 'app-dropzone-compact' : ''} ${dragging ? 'dragging' : ''}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input id={`${uploadId}-files`}
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(e.target.files)
            e.target.value = ''
          }
        }}
      />
      {allowCamera && (
        <input id={`${uploadId}-camera`}
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onFilesSelected(e.target.files)
              e.target.value = ''
            }
          }}
        />
      )}

      {currentFileName ? (
        <div className="app-dropzone-file-selected" onClick={(e) => e.stopPropagation()}>
          <span className="app-dropzone-icon" style={{ width: '36px', height: '36px', fontSize: '18px' }}>📄</span>
          <div className="app-dropzone-file-info">
            <strong>{currentFileName}</strong>
            <small>File selected · Tap Replace to change</small>
          </div>
          <button
            type="button"
            className="button secondary"
            style={{ padding: '6px 12px', fontSize: '11px', minHeight: '32px' }}
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
          >
            Replace
          </button>
        </div>
      ) : (
        <>
          <div className="app-dropzone-icon">
            <span>{icon}</span>
          </div>
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
          {allowCamera && (
            <div className="app-dropzone-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="app-dropzone-chip"
                onClick={() => cameraInputRef.current?.click()}
              >
                📷 Take photo
              </button>
              <button
                type="button"
                className="app-dropzone-chip"
                onClick={() => fileInputRef.current?.click()}
              >
                🖼️ Choose files
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function UploadForm({ type, onSave, onClose, onJobQueued, backgroundJob, vehicles = [], forceGas = false }) {
  const restored = backgroundJob?.preview || {}
  const [form, setForm] = useState({
    document_type: type,
    transaction_type: restored.suggested_transaction_type || 'expense',
    category: forceGas ? 'gas' : (restored.suggested_category || ('other')),
    incurred_at: restored.suggested_date || new Date().toISOString().slice(0, 10),
    amount: restored.suggested_amount ?? '',
    hst_amount: restored.suggested_hst_amount ?? '',
    hst_reviewed: true,
    vendor: restored.suggested_vendor || '',
    currency: (restored.suggested_currency && restored.suggested_currency !== 'CHF') ? restored.suggested_currency : 'CAD',
    business_activity: 'other',
    vehicle_id: vehicles.find(vehicle => vehicle.is_default)?.id || '',
    fuel_litres: restored.suggested_fuel_litres || restored.suggested_litres || '',
    ocr_text_override: restored.ocr_text || '',
  })
  const [file, setFile] = useState(backgroundJob?.file || null)
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(['queued', 'processing'].includes(backgroundJob?.status))
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewImageFailed, setPreviewImageFailed] = useState(false)
  const [ocrMessage, setOcrMessage] = useState(backgroundJob?.status === 'completed' ? 'OCR is ready. Review the fields before confirming.' : backgroundJob?.error || '')
  const [previewReady, setPreviewReady] = useState(['completed', 'failed'].includes(backgroundJob?.status))
  const [detectedFields, setDetectedFields] = useState({})
  const previewRequest = useRef(0)

  useEffect(() => () => { previewRequest.current += 1 }, [])
  useEffect(() => {
    if (!file || !String(file.type || '').startsWith('image/')) return undefined
    const objectUrl = URL.createObjectURL(file)
    setPreviewImageFailed(false)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  useEffect(() => {
    if (file || !backgroundJob || !String(backgroundJob.mime_type || '').startsWith('image/')) return undefined
    const controller = new AbortController()
    let objectUrl = ''
    fetch(`${API_URL}/receipts/preview/${backgroundJob.job_id}/file`, { credentials: 'include', signal: controller.signal })
      .then(response => {
        const mime = response.headers.get('content-type') || ''
        if (!response.ok) throw new Error(`Preview request failed (${response.status})`)
        if (!mime.startsWith('image/')) throw new Error(`Preview returned ${mime || 'an unknown file type'}`)
        return response.blob()
      })
      .then(blob => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setPreviewImageFailed(false)
        setPreviewUrl(objectUrl)
      })
      .catch(error => { if (error.name !== 'AbortError') setPreviewImageFailed(true) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [backgroundJob?.job_id, backgroundJob?.mime_type, file])

  const selectFiles = async (selectedList) => {
    if (!selectedList || selectedList.length === 0) return
    const filesArray = Array.from(selectedList)
    const primaryFile = filesArray[0]
    const remainingFiles = filesArray.slice(1)

    // Queue any additional files in the background
    for (const extraFile of remainingFiles) {
      const extraData = new FormData()
      extraData.append('file', extraFile)
      extraData.append('document_type', type)
      api('/receipts/preview', { method: 'POST', body: extraData })
        .then(queued => {
          if (onJobQueued) onJobQueued({ ...queued, documentType: type, file: extraFile, filename: extraFile.name })
        })
        .catch(() => {})
    }

    const requestId = ++previewRequest.current
    setPreviewImageFailed(false)
    setFile(primaryFile)
    setPreviewUrl('')
    setPreviewing(true)
    setPreviewReady(false)
    setOcrMessage(filesArray.length > 1 ? `Queued ${filesArray.length} ${'receipts'}! Reading first…` : `Reading ${'receipt'} and extracting details…`)

    const data = new FormData()
    data.append('file', primaryFile)
    data.append('document_type', type)
    try {
      const queued = await api('/receipts/preview', { method: 'POST', body: data })
      if (onJobQueued) onJobQueued({ ...queued, documentType: type, file: primaryFile, filename: primaryFile.name })
      let job = queued
      let attempts = 0
      while (requestId === previewRequest.current && ['queued', 'processing'].includes(job.status) && attempts < 300) {
        attempts += 1
        setOcrMessage(job.status === 'processing' ? `Reading ${'receipt'} in the background…` : 'Processing OCR…')
        await new Promise(resolve => setTimeout(resolve, 800))
        job = await api(`/receipts/preview/${queued.job_id}`)
      }
      if (requestId !== previewRequest.current) return
      if (['queued', 'processing'].includes(job.status)) throw new Error('OCR preview timed out.')
      if (job.status === 'failed') throw new Error(job.error || 'OCR preview failed')
      const result = job.preview || {}
      const extractedLitres = result.suggested_fuel_litres || result.suggested_litres || ''
      const isGas = forceGas || result.suggested_category === 'gas'

      setDetectedFields({
        vendor: result.suggested_vendor,
        amount: result.suggested_amount,
        hst_amount: result.suggested_hst_amount,
        fuel_litres: extractedLitres,
        category: result.suggested_category,
      })

      setForm(current => ({
        ...current,
        ocr_text_override: result.ocr_text || '',
        vendor: current.vendor || result.suggested_vendor || '',
        amount: current.amount || result.suggested_amount || '',
        hst_amount: current.hst_amount !== '' ? current.hst_amount : (result.suggested_hst_amount ?? ''),
        incurred_at: result.suggested_date || current.incurred_at,
        category: isGas ? 'gas' : (result.suggested_category || current.category),
        currency: (result.suggested_currency && result.suggested_currency !== 'CHF') ? result.suggested_currency : (current.currency || 'CAD'),
        fuel_litres: current.fuel_litres || extractedLitres,
        transaction_type: result.suggested_transaction_type || current.transaction_type,
      }))
      setPreviewReady(true)
      const successMsg = extractedLitres
        ? `OCR extracted successfully (${extractedLitres} L detected). Review fields below.`
        : (result.ocr_text ? 'OCR extracted successfully. Review fields below.' : 'OCR finished with no detected text. You can enter details manually.')
      setOcrMessage(result.message || successMsg)
    } catch (error) {
      if (requestId === previewRequest.current) {
        setPreviewReady(true)
        setOcrMessage(`${error.message} You can enter details manually.`)
      }
    } finally {
      if (requestId === previewRequest.current) setPreviewing(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    const data = new FormData()
    Object.entries(form).forEach(([key, value]) => (value !== '' || key === 'ocr_text_override') && data.append(key, value))
    if (file) data.append('file', file)
    try {
      await onSave(data, backgroundJob?.job_id)
    } finally {
      setBusy(false)
    }
  }

  const hasUpload = Boolean(file || backgroundJob)
  const uploadMime = file?.type || backgroundJob?.mime_type || ''
  const uploadName = file?.name || backgroundJob?.filename

  return <form className="form" onSubmit={submit}>
    <DropZone
      multiple
      currentFileName={uploadName}
      title={'Drop receipt images or PDFs here'}
      subtitle={'Supports multiple receipts, camera photos & PDF · OCR runs automatically'}
      icon={'🧾'}
      allowCamera={true}
      onFilesSelected={selectFiles}
    />

    {hasUpload && <div className={`ocr-state ${previewing ? 'working' : ''}`}><i/>{ocrMessage}</div>}

    {hasUpload && (
      <details className="ocr-details-toggle" open>
        <summary className="ocr-toggle-summary">
          <span>🔍 View {'receipt'} preview & extracted text</span>
          <small className="ocr-toggle-badge">{previewing ? 'Reading…' : form.ocr_text_override ? 'Text captured' : 'Tap to collapse / expand'}</small>
        </summary>
        <section className="ocr-review">
          <div className="receipt-preview">
            {uploadMime.startsWith('image/') ? (
              previewImageFailed ? <div><span>!</span><strong>Image preview unavailable</strong></div> :
              previewUrl ? <img src={previewUrl} alt={'Receipt preview'} onError={() => setPreviewImageFailed(true)}/> :
              <div><div className="spinner small"/><strong>Loading preview…</strong></div>
            ) : <div><span>PDF</span><strong>{uploadName}</strong></div>}
          </div>
          <div className="ocr-fields">
            <label>
              Extracted text <small>Edit this if OCR read anything incorrectly</small>
              <textarea name="ocr_text_override"
                rows="9"
                value={form.ocr_text_override}
                onChange={e => setForm({ ...form, ocr_text_override: e.target.value })}
                placeholder={'No text detected—type receipt details here'}
              />
            </label>
          </div>
        </section>
      </details>
    )}

    <label>Business / industry type<select name="business_activity" value={form.business_activity} onChange={e => setForm({ ...form, business_activity: e.target.value })}>{BUSINESS_ACTIVITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>

    <div className="form-row">
      <label>Date<input name="incurred_at" required type="date" value={form.incurred_at} onChange={e => setForm({ ...form, incurred_at: e.target.value })}/></label>
      <label>Category<select name="category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>

    {type === 'receipt' && form.category === 'gas' && (
      <div className="form-row">
        <label>Vehicle<select name="vehicle_id" required value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}><option value="">Select vehicle</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>
        <label>
          Litres purchased {detectedFields.fuel_litres && <span style={{ color: '#21a977', fontWeight: 'normal', fontSize: '10px' }}>(✨ Auto-detected)</span>}
          <input name="fuel_litres" required type="number" min="0.01" max="10000" step="0.01" placeholder="e.g. 45.20" value={form.fuel_litres} onChange={e => setForm({ ...form, fuel_litres: e.target.value })}/>
          <small>Required to calculate vehicle range</small>
        </label>
      </div>
    )}

    {type === 'receipt' && (
      <>
        <div className="form-row">
          <label>Record as<select name="transaction_type" value={form.transaction_type} onChange={e => setForm({ ...form, transaction_type: e.target.value })}><option value="expense">Expense</option><option value="income">Income</option></select></label>
          <label>
            Amount {detectedFields.amount && <span style={{ color: '#21a977', fontWeight: 'normal', fontSize: '10px' }}>(✨ Auto-detected)</span>}
            <input name="amount" min="0" step="0.01" type="number" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}/>
          </label>
        </div>
        <label>HST amount (included in total) {detectedFields.hst_amount != null && <small>Detected from receipt?please review</small>}<input name="hst_amount" type="number" min="0" max={form.amount === '' ? undefined : form.amount} step="0.01" value={form.hst_amount} onChange={e => setForm({ ...form, hst_amount: e.target.value })} placeholder="Not recorded"/><small>Enter the HST shown on the receipt, or 0 if none was charged. Leave blank if unknown.</small></label>
        <label>
          Vendor {detectedFields.vendor && <span style={{ color: '#21a977', fontWeight: 'normal', fontSize: '10px' }}>(✨ Auto-detected)</span>}
          <input name="vendor" value={form.vendor} placeholder="e.g. Petro-Canada" onChange={e => setForm({ ...form, vendor: e.target.value })}/>
        </label>
      </>
    )}





    <footer>
      <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
      <button className="button" disabled={busy || previewing || !hasUpload}>
        {busy ? 'Uploading…' : previewing ? 'Reading…' : `Confirm & upload ${'receipt'}`}
      </button>
    </footer>
  </form>
}


export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('receipts')
  const [users, setUsers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [roles, setRoles] = useState([])
  const [logs, setLogs] = useState([])
  const [receipts, setReceipts] = useState([])
  const [receiptJobs, setReceiptJobs] = useState([])
  const [summary, setSummary] = useState(null)
  const [reportYear, setReportYear] = useState('all')
  const [reportActivity, setReportActivity] = useState('')
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const status = new URLSearchParams(location.search).get('status')

  const can = useCallback((permission) => session?.permissions?.includes('*') || session?.permissions?.includes(permission), [session])
  const load = useCallback(async (silent = false) => {
    if (silent !== true) { setLoading(true); setNotice(null) }
    try {
      const bootstrap = validateSession(await api('/auth/bootstrap'))
      setSession(bootstrap)
      // Fast initial load: only fetch essential active workspace data
      const primaryRequests = [
        canFrom(bootstrap, 'RECEIPTS_READ') ? api('/receipts') : [],
        canFrom(bootstrap, 'RECEIPTS_READ') ? api('/vehicles') : [],
      ]
      const results = await Promise.allSettled(primaryRequests)
      const value = (index, fallback) => results[index].status === 'fulfilled' ? results[index].value : fallback
      setReceipts(value(0, [])); setVehicles(value(1, []))
      let dataUnavailable = results.some(result => result.status === 'rejected')
      if (canFrom(bootstrap, 'RECEIPTS_CREATE')) {
        try {
          const savedJobs = await api('/receipts/preview-jobs')
          setReceiptJobs(current => savedJobs.map(job => ({ ...job, file: current.find(item => item.job_id === job.job_id)?.file })))
        } catch {
          dataUnavailable = true
        }
      }
      if (dataUnavailable) {
        setNotice({ type: 'error', text: 'Connected in local mode, but some data is unavailable. Start MongoDB to enable saved records.' })
      }
    } catch (error) {
      if (error.status !== 401) setNotice({ type: 'error', text: error.message })
      setSession(null)
    } finally { if (silent !== true) setLoading(false) }
  }, [])

  // Lazy load tab data on demand to eliminate initial query queuing
  useEffect(() => {
    if (!session) return
    let cancelled = false
    if (view === 'reports' && canFrom(session, 'RECEIPTS_READ')) {
      setSummary(null)
      api(`/receipts/reports/summary?year=${reportYear}${reportActivity ? `&business_activity=${encodeURIComponent(reportActivity)}` : ''}`)
        .then(result => { if (!cancelled) setSummary(result) })
        .catch(error => { if (!cancelled) setNotice({ type: 'error', text: error.message }) })
    }
    if ((view === 'users' || view === 'overview') && canFrom(session, 'CONFIG_USERS_READ') && !users.length) {
      api('/configuration/users').then(setUsers).catch(() => {})
    }
    if ((view === 'roles' || view === 'overview') && canFrom(session, 'CONFIG_ROLES_READ') && !roles.length) {
      api('/configuration/roles').then(setRoles).catch(() => {})
    }
    if ((view === 'audit' || view === 'overview') && canFrom(session, 'AUDIT_LOG_READ') && !logs.length) {
      api('/audit-logs?limit=100').then(setLogs).catch(() => {})
    }
    return () => { cancelled = true }
  }, [view, session, reportYear, reportActivity, users.length, roles.length, logs.length])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!session) return; const timer = setInterval(() => api('/auth/heartbeat', { method: 'POST' }).catch(() => setSession(null)), 10 * 60 * 1000); return () => clearInterval(timer) }, [session])
  useEffect(() => {
    const active = receiptJobs.filter(job => ['queued', 'processing'].includes(job.status))
    if (!active.length) return undefined
    const timer = setTimeout(async () => {
      const updates = await Promise.all(active.map(async job => {
        try { return await api(`/receipts/preview/${job.job_id}`) } catch (error) { return error.status === 404 ? { job_id: job.job_id, status: 'failed', error: 'Preview expired. Open it to enter the details manually.' } : null }
      }))
      setReceiptJobs(current => current.map(job => {
        const update = updates.find(item => item?.job_id === job.job_id)
        return update ? { ...job, ...update, preview: update.preview || job.preview } : job
      }))
    }, 1000)
    return () => clearTimeout(timer)
  }, [receiptJobs])
  const filteredUsers = useMemo(() => users.filter(u => `${u.full_name} ${u.email}`.toLowerCase().includes(query.toLowerCase())), [users, query])
  const flash = (text, type = 'success') => { setNotice({ text, type }); setTimeout(() => setNotice(null), 3500) }
  const saveUser = async (form) => { try { if (modal.user) await api(`/configuration/users/${modal.user.id}`, { method: 'PATCH', body: JSON.stringify(form) }); else await api('/configuration/users', { method: 'POST', body: JSON.stringify(form) }); setModal(null); flash('User saved successfully.'); const u = await api('/configuration/users'); setUsers(u) } catch (e) { flash(e.message, 'error') } }
  const saveRole = async (form) => { try { if (modal.role) { const { code, ...body } = form; await api(`/configuration/roles/${modal.role.id}`, { method: 'PATCH', body: JSON.stringify(body) }) } else await api('/configuration/roles', { method: 'POST', body: JSON.stringify(form) }); setModal(null); flash('Role saved successfully.'); const r = await api('/configuration/roles'); setRoles(r) } catch (e) { flash(e.message, 'error') } }
  const queueReceiptJob = (job) => { setReceiptJobs(current => [...current.filter(item => item.job_id !== job.job_id), job]); setModal(current => current?.type === 'upload' ? { ...current, backgroundJob: job } : current) }
  const startBackgroundReceipts = async (selectedFiles) => {
    const files = Array.from(selectedFiles || []).slice(0, 20)
    if (!files.length) return
    let queuedCount = 0; const failures = []
    for (let index = 0; index < files.length; index += 3) {
      await Promise.all(files.slice(index, index + 3).map(async file => {
        const data = new FormData(); data.append('file', file); data.append('document_type', 'receipt')
        try {
          const queued = await api('/receipts/preview', { method: 'POST', body: data })
          queueReceiptJob({ ...queued, documentType: 'receipt', file, filename: file.name, mime_type: file.type })
          queuedCount += 1
        } catch (error) { failures.push(`${file.name}: ${error.message}`) }
      }))
    }
    if (queuedCount) flash(`${queuedCount} receipt${queuedCount > 1 ? 's' : ''} uploaded. OCR is running in the background.`)
    if (failures.length) flash(`${failures.length} receipt${failures.length > 1 ? 's' : ''} could not be queued. ${failures[0]}`, 'error')
    if (Array.from(selectedFiles || []).length > 20) flash('Only the first 20 receipts were queued. Upload the remaining files as another batch.', 'error')
  }
  const uploadDocument = async (form, previewJobId) => { try { await api(previewJobId ? `/receipts/from-preview/${previewJobId}` : '/receipts', { method: 'POST', body: form }); if (previewJobId) setReceiptJobs(current => current.filter(job => job.job_id !== previewJobId)); setModal(null); flash('Upload saved with the reviewed OCR details.'); await load(true) } catch (e) { flash(e.message, 'error') } }
  const removeReceipt = async (item) => { if (!confirm(`Delete ${item.filename}?`)) return; try { await api(`/receipts/${item.id}`, { method: 'DELETE' }); flash('Document deleted.'); await load() } catch (e) { flash(e.message, 'error') } }
  const removeUser = async (user) => { if (!confirm(`Delete ${user.full_name}? This action disables their access.`)) return; try { await api(`/configuration/users/${user.id}`, { method: 'DELETE' }); flash('User deleted.'); await load() } catch (e) { flash(e.message, 'error') } }
  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }) } finally { setReceiptJobs([]); setSession(null) } }

  if (loading) return <div className="loading"><div className="spinner"/><span>Loading Quintyne Realty inc…</span></div>
  if (!session?.user) return <Login onSignedIn={load} onDevLogin={load} error={notice?.type === 'error' ? notice.text : null} />

  const changeView = (next) => { setView(next); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const activeJobCount = receiptJobs.filter(job => ['queued', 'processing'].includes(job.status)).length
  return <div className="shell">
    <aside>
      <div className="brand"><img className="brand-logo small" src={companyLogo} alt="Quintyne Realty inc"/><div><strong>Quintyne Realty inc</strong><span>Administration</span></div></div>
      <nav>{NAV.map(([id, label, icon]) => <div className="nav-group" key={id}><button className={view === id ? 'active' : ''} onClick={() => changeView(id)}><span>{icon}</span>{label}</button></div>)}</nav>
      <div className="account"><div className="avatar">{initials(session.user.full_name)}</div><div><strong>{session.user.full_name}</strong><span>{session.user.email}</span></div><button onClick={logout} title="Sign out">↪</button></div>
    </aside>
    <header className="mobile-header"><img className="brand-logo small" src={companyLogo} alt="Quintyne Realty inc"/><div><strong>Quintyne Realty inc</strong><span>{NAV.find(n => n[0] === view)?.[1]}</span></div><button onClick={logout} aria-label="Sign out">↪</button></header>
    <main className="content">
      <header className="topbar"><div><p className="eyebrow">ADMINISTRATION PORTAL</p><h1>{NAV.find(n => n[0] === view)?.[1]}</h1></div><div className={`live ${activeJobCount ? 'processing' : ''}`}><i/> {activeJobCount ? `Processing ${activeJobCount} receipt${activeJobCount > 1 ? 's' : ''}…` : 'Secure session'}</div></header>
      {notice && <div className={`notice ${notice.type}`}>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}
      {view === 'overview' && <Overview users={users} roles={roles} logs={logs} user={session.user} setView={setView} />}
      {view === 'users' && <section><div className="section-head"><div><h2>People with access</h2><p>Manage accounts, roles, and activation status.</p></div>{can('CONFIG_USERS_CREATE') && <button className="button" onClick={() => setModal({ type: 'user' })}>+ Add user</button>}</div><div className="toolbar"><input name="user_search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search users…"/><span>{filteredUsers.length} users</span></div><div className="table-wrap"><table><thead><tr><th>User</th><th>Roles</th><th>Status</th><th>Last activity</th><th/></tr></thead><tbody>{filteredUsers.map(u => <tr key={u.id}><td><div className="person"><div className="avatar soft">{initials(u.full_name)}</div><div><strong>{u.full_name}</strong><span>{u.email}</span></div></div></td><td>{u.is_super_admin ? <span className="tag purple">Super admin</span> : u.role_ids?.length ? <span className="tag">{u.role_ids.length} role{u.role_ids.length > 1 ? 's' : ''}</span> : <span className="dim">No role</span>}</td><td><span className={`status ${u.is_active ? 'on' : 'off'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td><td>{fmtDate(u.last_activity_at)}</td><td className="actions">{can('CONFIG_USERS_UPDATE') && <button onClick={() => setModal({ type: 'user', user: u })}>Edit</button>}{can('CONFIG_USERS_DELETE') && u.id !== session.user.id && <button className="danger-link" onClick={() => removeUser(u)}>Delete</button>}</td></tr>)}</tbody></table>{!filteredUsers.length && <Empty text="No users match your search."/>}</div></section>}
      {view === 'roles' && <section><div className="section-head"><div><h2>Roles & permissions</h2><p>Group permissions into reusable access profiles.</p></div>{can('CONFIG_ROLES_CREATE') && <button className="button" onClick={() => setModal({ type: 'role' })}>+ New role</button>}</div><div className="card-grid">{roles.map(r => <article className="role-card" key={r.id}><div className="role-icon">◇</div><div className="role-title"><h3>{r.name}</h3><span className={`status ${r.is_active ? 'on' : 'off'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></div><code>{r.code}</code><p>{r.permissions?.length || 0} permissions assigned</p><div className="chips">{r.permissions?.slice(0, 3).map(p => <span key={p}>{p.replaceAll('_', ' ').toLowerCase()}</span>)}{r.permissions?.length > 3 && <span>+{r.permissions.length - 3} more</span>}</div>{can('CONFIG_ROLES_UPDATE') && <button className="text-button" onClick={() => setModal({ type: 'role', role: r })}>Edit role →</button>}</article>)}{!roles.length && <Empty text="No roles have been created."/>}</div></section>}
      {view === 'receipts' && (can('RECEIPTS_READ') ? <ReceiptsView items={receipts} previews={receiptJobs} can={can} isAdmin={session.user.is_super_admin} DropZone={DropZone} Modal={Modal} onUpload={() => setModal({type:'upload', documentType:'receipt'})} onFiles={startBackgroundReceipts} onReview={backgroundJob => setModal({type:'upload', documentType:'receipt', backgroundJob})} onDelete={removeReceipt} onRefresh={() => load(true)}/> : <Empty text="You do not have permission to view receipts."/>)}
      {view === 'gas' && can('RECEIPTS_READ') && <GasVehicles vehicles={vehicles} receipts={receipts.filter(item => item.category === 'gas' && item.vehicle_id)} canCreate={can('RECEIPTS_CREATE')} canDelete={can('RECEIPTS_DELETE')} onRefresh={async () => setVehicles(await api('/vehicles'))} onAddReceipt={() => setModal({type:'upload', documentType:'gas-receipt'})}/>}
      {view === 'reports' && can('RECEIPTS_READ') && <Reports summary={summary} year={reportYear} setYear={setReportYear} receipts={receipts} activity={reportActivity} setActivity={setReportActivity}/>}
      {view === 'audit' && <section><div className="section-head"><div><h2>Audit log</h2><p>A chronological record of administrative activity.</p></div><button className="button secondary" onClick={() => api('/audit-logs?limit=100').then(setLogs)}>Refresh</button></div><div className="table-wrap"><table><thead><tr><th>Event</th><th>Resource</th><th>Actor</th><th>Date & time</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td><strong>{log.action?.replaceAll('_', ' ') || 'EVENT'}</strong></td><td>{log.resource_type || '—'} <span className="dim">{log.resource_id?.slice?.(0, 8)}</span></td><td className="mono">{log.actor_id?.slice?.(0, 8) || 'System'}</td><td>{fmtDate(log.created_at)}</td></tr>)}</tbody></table>{!logs.length && <Empty text="No audit activity to show."/>}</div></section>}
    </main>
    {mobileMenu && <div className="mobile-more" onClick={() => setMobileMenu(false)}><div onClick={e => e.stopPropagation()}><header><strong>Administration</strong><button onClick={() => setMobileMenu(false)}>×</button></header>{NAV.filter(([id]) => ['users','roles','audit'].includes(id)).map(([id,label,icon]) => <button key={id} onClick={() => changeView(id)}><span>{icon}</span>{label}<b>›</b></button>)}</div></div>}
    <nav className="mobile-nav" aria-label="Primary navigation">
      {NAV.filter(([id]) => ['receipts','gas','reports','overview'].includes(id)).map(([id,label,icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => changeView(id)}><span>{icon}</span><small>{label}</small></button>)}
      <button className={['users','roles','audit'].includes(view) ? 'active' : ''} onClick={() => setMobileMenu(true)}><span>•••</span><small>More</small></button>
    </nav>
    {modal?.type === 'user' && <Modal title={modal.user ? 'Edit user' : 'Add a user'} onClose={() => setModal(null)}><UserForm roles={roles} user={modal.user} onSave={saveUser} onClose={() => setModal(null)}/></Modal>}
    {modal?.type === 'role' && <Modal title={modal.role ? 'Edit role' : 'Create a role'} onClose={() => setModal(null)}><RoleForm role={modal.role} onSave={saveRole} onClose={() => setModal(null)}/></Modal>}
    {modal?.type === 'upload' && <Modal title={'Upload receipt'} onClose={() => setModal(null)}><UploadForm type={modal.documentType === 'gas-receipt' ? 'receipt' : modal.documentType} forceGas={modal.documentType === 'gas-receipt'} vehicles={vehicles} backgroundJob={modal.backgroundJob} onJobQueued={queueReceiptJob} onSave={uploadDocument} onClose={() => setModal(null)}/></Modal>}
  </div>
}


function Reports({ summary, year, setYear, receipts, activity, setActivity }) {
  if (!summary) return <Empty text="Loading financial reports?"/>
  const reportYears = [...new Set([...(year === 'all' ? [] : [year]), new Date().getFullYear(), ...receipts
    .filter(item => item.document_type === 'receipt' && item.amount != null && item.incurred_at)
    .map(item => new Date(item.incurred_at).getUTCFullYear())
    .filter(Number.isInteger)])].sort((a, b) => b - a)
  const periods = (year === 'all' ? summary.years : summary.months)?.filter(m => m.income || m.expenses) || []
  const max = Math.max(1, ...periods.flatMap(m => [m.income, m.expenses]))

  return <section><div className="section-head"><div><h2>Profit & loss</h2><p>Weekly, monthly, and yearly totals from uploaded transactions.</p></div><div className="report-filters"><label>Business / industry type<select name="report_business_activity" value={activity} onChange={e => setActivity(e.target.value)}><option value="">All business types</option>{BUSINESS_ACTIVITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Year<select name="report_year" value={year} onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">All years</option>{reportYears.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div></div><div className="stats finance-stats"><article><span>Total income</span><strong className="income">{money(summary.income, summary.currency)}</strong><small>{year === 'all' ? 'All years' : year} recorded income</small></article><article><span>Total expenses</span><strong>{money(summary.expenses, summary.currency)}</strong><small>{year === 'all' ? 'All years' : year} categorized spend</small></article><article><span>Net profit / loss</span><strong className={summary.profit_loss >= 0 ? 'income' : 'loss'}>{money(summary.profit_loss, summary.currency)}</strong><small>Income minus expenses</small></article></div><div className="stats finance-stats"><article><span>HST paid on expenses</span><strong>{money(summary.hst_paid || 0, 'CAD')}</strong><small>Recorded CAD HST for tax credit review</small></article><article><span>HST collected on income</span><strong>{money(summary.hst_collected || 0, 'CAD')}</strong><small>Tracked separately from expense HST</small></article><article><span>Expense receipts missing HST</span><strong>{summary.hst_missing_receipts || 0}</strong><small>Open these receipts to enter the tax amount</small></article></div><p className="tax-review-note">These are recorded amounts, not confirmed input tax credits. Retain the original receipts and review eligibility before claiming.{summary.hst_non_cad_receipts > 0 && ` ${summary.hst_non_cad_receipts} non-CAD receipts are excluded from HST totals.`}</p><div className="report-grid"><article className="panel"><h3>{year === 'all' ? 'Yearly overview' : 'Monthly overview'}</h3><p>Income and expenses by {year === 'all' ? 'year' : 'month'}</p><div className="bars">{periods.length ? periods.map(m => <div className="bar-row" key={year === 'all' ? m.year : m.month}><span>{year === 'all' ? m.year : new Intl.DateTimeFormat(undefined,{month:'short'}).format(new Date(2024,m.month-1))}</span><div><i className="expense-bar" style={{width:`${m.expenses/max*100}%`}}/><i className="income-bar" style={{width:`${m.income/max*100}%`}}/></div><strong>{money(m.income-m.expenses, summary.currency)}</strong></div>) : <Empty text="No transactions in this selection."/>}</div></article><article className="panel"><h3>Expense categories</h3><p>{year === 'all' ? 'Spending across all years' : 'Year-to-date spending'}</p><div className="category-totals">{Object.entries(summary.categories || {}).map(([name,value]) => <div key={name}><span>{categoryLabel(name)}</span><strong>{money(value, summary.currency)}</strong></div>)}</div><h3 className="weekly-title">{year === 'all' ? 'Yearly totals' : 'Weekly totals'}</h3><div className="weekly-list">{(year === 'all' ? summary.years : summary.weeks)?.slice(-6).reverse().map(w => <div key={year === 'all' ? w.year : w.week}><span>{year === 'all' ? w.year : `Week ${w.week}`}</span><strong>{money(w.income-w.expenses, summary.currency)}</strong></div>)}{!(year === 'all' ? summary.years : summary.weeks)?.length && <span className="dim">No activity</span>}</div></article></div></section>
}

function categoryLabel(value) { return CATEGORIES.find(([id]) => id === value)?.[1] || value?.replaceAll('_',' ') || 'Other' }
function money(value, currency='CAD') { const code = (!currency || currency === 'CHF') ? 'CAD' : currency; return new Intl.NumberFormat(undefined,{style:'currency',currency: code}).format(Number(value || 0)) }

function canFrom(session, permission) { return session.permissions?.includes('*') || session.permissions?.includes(permission) }
function Empty({ text }) { return <div className="empty"><span>◇</span><p>{text}</p></div> }
function Overview({ users, roles, logs, user, setView }) {
  const active = users.filter(u => u.is_active).length
  return <section><div className="welcome"><div><p className="eyebrow">WELCOME BACK</p><h2>Good to see you, {user.full_name?.split(' ')[0]}.</h2><p>Here’s what’s happening across your administration workspace.</p></div><div className="date-card"><span>Today</span><strong>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</strong></div></div><div className="stats"><article><span>Managed users</span><strong>{users.length}</strong><small>{active} currently active</small></article><article><span>Access roles</span><strong>{roles.length}</strong><small>{roles.filter(r => r.is_active).length} available</small></article><article><span>Recent events</span><strong>{logs.length}</strong><small>Latest 100 audit entries</small></article></div><div className="overview-grid"><article className="panel"><div className="panel-head"><div><h3>Recent activity</h3><p>Latest administrative events</p></div><button onClick={() => setView('audit')}>View all</button></div><div className="activity">{logs.slice(0, 5).map(log => <div key={log.id}><i/><div><strong>{log.action?.replaceAll('_', ' ')}</strong><span>{log.resource_type || 'System event'}</span></div><time>{fmtDate(log.created_at)}</time></div>)}{!logs.length && <Empty text="No recent activity."/>}</div></article><article className="panel quick"><h3>Quick actions</h3><p>Jump to a common task</p><button onClick={() => setView('users')}><span>♙</span><div><strong>Manage users</strong><small>Add, update, or deactivate access</small></div>→</button><button onClick={() => setView('roles')}><span>◇</span><div><strong>Configure roles</strong><small>Review role permissions</small></div>→</button></article></div></section>
}

