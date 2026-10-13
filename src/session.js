export function validateSession(data) {
  if (!data || typeof data !== 'object' || !data.user || Array.isArray(data.user) ||
      typeof data.user.id !== 'string' || !data.user.id ||
      typeof data.user.full_name !== 'string' || typeof data.user.email !== 'string' ||
      !Array.isArray(data.permissions) || data.permissions.some(value => typeof value !== 'string')) {
    throw new Error('The backend returned an invalid sign-in response. Check that VITE_API_URL points to the backend deployment.')
  }
  return data
}
