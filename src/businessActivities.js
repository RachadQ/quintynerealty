export const BUSINESS_ACTIVITIES = [
  ['vending_machine', 'Vending machines'],
  ['third_party_sales', 'Third-party sales'],
  ['rentals', 'Rentals'],
  ['other', 'Other'],
]

export const businessActivityLabel = value => BUSINESS_ACTIVITIES.find(([id]) => id === value)?.[1] || 'Other'

export const normalizeBusinessActivity = value => BUSINESS_ACTIVITIES.some(([id]) => id === value) ? value : 'other'
