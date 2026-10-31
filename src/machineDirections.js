/** Prefer the saved address so an old or manually placed pin cannot change the destination. */
export function machineDirectionsUrl(machine) {
  const address = typeof machine.address === 'string' ? machine.address.trim() : ''
  const hasPoint = Number.isFinite(machine.latitude) && Number.isFinite(machine.longitude)
    && Math.abs(machine.latitude) <= 90 && Math.abs(machine.longitude) <= 180
  const destination = address || (hasPoint ? `${machine.latitude},${machine.longitude}` : '')
  return destination ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}` : null
}
