import { useEffect, useState } from 'react'
import { API_URL, api } from './api.js'
import { BUSINESS_ACTIVITIES, businessActivityLabel, normalizeBusinessActivity } from './businessActivities.js'

const money = item => new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency === 'CHF' ? 'CAD' : item.currency || 'CAD' }).format(item.amount || 0)
const date = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'Not recorded'
const category = value => value === 'job_expense' ? 'Business expenses' : value?.replaceAll('_', ' ')

export default function ReceiptsView({ items, previews, can, isAdmin, DropZone, Modal, onUpload, onFiles, onReview, onDelete, onRefresh }) {
  const [cloud, setCloud] = useState(null)
  const [cloudError, setCloudError] = useState('')
  useEffect(() => {
    let active = true
    api('/storage/onedrive/status').then(value => { if (active) setCloud(value) }).catch(error => { if (active) setCloudError(error.message) })
    return () => { active = false }
  }, [])
  const [activity, setActivity] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const shown = items.filter(item => (!activity || normalizeBusinessActivity(item.business_activity) === activity) && `${item.vendor || ''} ${item.filename || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <section>
    <div className="section-head"><div><h2>Business receipts</h2><p>Track receipts by business activity and expense category.</p></div>{can('RECEIPTS_CREATE') && <button className="button" onClick={onUpload}>+ Add receipt</button>}</div>
    {isAdmin && <div className="onedrive-status panel"><div><strong>OneDrive receipt storage</strong><p>{cloud?.connected ? 'Connected. Receipts save to Quintyne Realty / year / category / month in OneDrive.' : cloud?.configured ? 'Ready to connect your Microsoft account.' : cloud ? 'Microsoft app credentials are not configured in the backend.' : 'Checking storage connection...'}</p>{cloudError && <p role="alert">{cloudError}</p>}</div>{cloud?.connect_url && <a className="button secondary" href={cloud.connect_url}>{cloud.connected ? 'Reconnect OneDrive' : 'Connect OneDrive'}</a>}</div>}
    <div className="receipt-filters form-row"><label>Business / industry type<select value={activity} onChange={e => setActivity(e.target.value)}><option value="">All business types</option>{BUSINESS_ACTIVITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Search receipts<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Vendor or filename"/></label></div>
    {can('RECEIPTS_CREATE') && <DropZone multiple icon="🧾" title="Scan or drop receipts here" subtitle="Upload up to 20 receipts, review OCR, then confirm" onFilesSelected={onFiles}/>}
    {can('RECEIPTS_CREATE') && previews.length > 0 && <section className="receipt-previews panel"><h3>Receipt previews ({previews.length})</h3>{previews.map(preview => <div className={`background-job ${preview.status}`} key={preview.job_id}><div><strong>{preview.filename}</strong><span>{preview.status === 'completed' ? 'Ready for review' : preview.status === 'failed' ? preview.error || 'Enter details manually' : 'Reading receipt…'}</span></div><button className="button secondary" disabled={!['completed', 'failed'].includes(preview.status)} onClick={() => onReview(preview)}>Review</button></div>)}</section>}
    <div className="document-grid">{shown.map(item => <article className="document-card" key={item.id}><button className="doc-main receipt-details-trigger" onClick={() => setSelected(item)}><h3>{item.vendor || item.filename}</h3><p>{businessActivityLabel(item.business_activity)}</p><div className="doc-meta"><span>{date(item.incurred_at)}</span><span>{item.transaction_type === 'income' ? 'Income' : 'Expense'}</span><span>{category(item.category)}</span><span>HST: {item.hst_amount == null ? 'Not recorded' : money({ ...item, amount: item.hst_amount })}</span>{item.amount != null && <strong>{money(item)}</strong>}</div><span className="receipt-view-hint">View receipt</span></button>{can('RECEIPTS_DELETE') && <button className="delete-file" onClick={() => onDelete(item)} aria-label={`Delete ${item.vendor || item.filename}`}>×</button>}</article>)}</div>
    {!shown.length && <div className="empty"><p>{items.length ? 'No receipts match these filters.' : 'Add your first business receipt.'}</p></div>}
    {selected && <ReceiptDetails key={selected.id} item={selected} canEdit={can('RECEIPTS_UPDATE')} Modal={Modal} onClose={() => setSelected(null)} onRefresh={onRefresh}/>}
    {can('RECEIPTS_CREATE') && <button className="mobile-fab" onClick={onUpload}><span>＋</span>Add receipt</button>}
  </section>
}

function ReceiptDetails({ item, canEdit, Modal, onClose, onRefresh }) {
  const [activity, setActivity] = useState(normalizeBusinessActivity(item.business_activity))
  const [hst, setHst] = useState(item.hst_amount ?? '')
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (item.web_url) return undefined
    let disposed = false, url = ''
    api(`/receipts/${item.id}/file`, { responseType: 'blob' }).then(blob => {
      if (disposed) return
      url = URL.createObjectURL(blob); setPreview(url)
    }).catch(() => { if (!disposed) setPreviewError(true) })
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [item.id, item.web_url])
  const save = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try { await api(`/receipts/${item.id}`, { method: 'PATCH', body: JSON.stringify({ business_activity: activity, hst_amount: hst === '' ? null : Number(hst) }) }); await onRefresh(); onClose() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <Modal title="Receipt details" onClose={onClose}><div className="receipt-info"><h3>{item.vendor || item.filename}</h3><dl><div><dt>Business type</dt><dd>{businessActivityLabel(item.business_activity)}</dd></div><div><dt>Date</dt><dd>{date(item.incurred_at)}</dd></div><div><dt>Amount</dt><dd>{item.amount == null ? 'Not recorded' : money(item)}</dd></div><div><dt>HST</dt><dd>{item.hst_amount == null ? 'Not recorded' : money({ ...item, amount: item.hst_amount })}</dd></div><div><dt>Transaction</dt><dd>{item.transaction_type === 'income' ? 'Income' : 'Expense'}</dd></div><div><dt>Category</dt><dd>{category(item.category)}</dd></div></dl>{canEdit && <form className="form" onSubmit={save}><label>Business / industry type<select value={activity} onChange={e => setActivity(e.target.value)}>{BUSINESS_ACTIVITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>HST amount (included in total)<input type="number" min="0" max={item.amount ?? undefined} step="0.01" value={hst} onChange={e => setHst(e.target.value)} placeholder="Not recorded"/><small>Enter the amount on the original receipt, or 0 if no HST was charged.</small></label>{error && <p role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save receipt details'}</button></form>}<div className="receipt-info-preview">{preview && !previewError ? item.mime_type === 'application/pdf' ? <iframe title="Receipt preview" src={preview}/> : <img alt={item.filename} src={preview} onError={() => setPreviewError(true)}/> : !item.web_url && <p>{previewError ? 'Preview unavailable. Open the original below.' : 'Loading preview…'}</p>}</div>{item.ocr_text && <details><summary>Extracted text</summary><pre>{item.ocr_text}</pre></details>}<a className="button secondary" href={item.web_url || `${API_URL}/receipts/${item.id}/file`} target="_blank" rel="noreferrer">Open original receipt</a></div></Modal>
}
