function apiOrigin() {
  const configured = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:8002')
  const parsed = new URL(configured, window.location.origin)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('VITE_API_URL must be a safe HTTP(S) origin')
  }
  if (import.meta.env.PROD && parsed.protocol !== 'https:' && !local) {
    throw new Error('VITE_API_URL must use HTTPS outside local development')
  }
  return parsed.origin
}

export const API_URL = apiOrigin()

let csrfToken = ''
let csrfRequest = null
let localAuthBypass = false
async function getCsrfToken() {
  if (localAuthBypass && import.meta.env.DEV) return ''
  if (csrfToken) return csrfToken
  if (!csrfRequest) {
    csrfRequest = api('/auth/csrf').then(data => {
      if (import.meta.env.DEV && data.dev_auth_bypass === true) { localAuthBypass = true; return '' }
      if (!data.csrf_token) throw new Error('Could not initialize session security. Please sign in again.')
      csrfToken = data.csrf_token
      return csrfToken
    }).finally(() => { csrfRequest = null })
  }
  return csrfRequest
}

function sanitizeExternalUrls(value) {
  if (Array.isArray(value)) return value.map(sanitizeExternalUrls)
  if (!value || typeof value !== 'object') return value
  const clean = { ...value }
  if ('web_url' in clean) {
    try {
      const url = new URL(clean.web_url)
      const oneDrive = clean.storage_provider === 'onedrive' && (['onedrive.live.com', '1drv.ms'].includes(url.hostname) || url.hostname.endsWith('.sharepoint.com'))
      if (url.protocol !== 'https:' || url.username || url.password || (!oneDrive && !['drive.google.com', 'docs.google.com'].includes(url.hostname))) delete clean.web_url
    } catch { delete clean.web_url }
  }
  return clean
}

export async function api(path, options = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path')
  if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
    throw new Error('VITE_API_URL is missing from this deployment. Set it to the backend URL in Vercel and redeploy the frontend.')
  }
  const { responseType, ...requestOptions } = options
  const method = options.method || 'GET'
  const headers = { Accept: responseType === 'blob' ? 'application/pdf' : 'application/json', ...options.headers }
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && path !== '/auth/google') {
    const csrf = await getCsrfToken()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  const response = await fetch(`${API_URL}${path}`, { ...requestOptions, method, headers, credentials: 'include' })
  if (response.status === 204) return null
  if (response.ok && responseType === 'blob') return response.blob()
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    throw new Error(`The API returned a webpage or non-JSON response (${response.status}). Check VITE_API_URL and the backend deployment.`)
  }
  let data
  try { data = await response.json() }
  catch { throw new Error('The backend returned invalid JSON. Check the backend deployment.') }
  if (response.ok && data?.csrf_token) csrfToken = data.csrf_token
  if (import.meta.env.DEV && response.ok && data?.dev_auth_bypass === true) localAuthBypass = true
  if (response.status === 401 || (response.ok && path === '/auth/logout')) csrfToken = ''
  if (!response.ok) {
    const error = new Error(data?.detail || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return sanitizeExternalUrls(data)
}
