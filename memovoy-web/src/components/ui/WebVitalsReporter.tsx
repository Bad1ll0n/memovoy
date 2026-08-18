'use client'

import { useReportWebVitals } from 'next/web-vitals'

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[web-vitals]', metric.name, Math.round(metric.value), metric.rating)
    }
    // In production, forward to analytics — swap navigator.sendBeacon for fetch if needed
    if (process.env.NODE_ENV === 'production' && typeof navigator !== 'undefined') {
      const body = JSON.stringify({
        name:   metric.name,
        value:  metric.value,
        rating: metric.rating,
        delta:  metric.delta,
        id:     metric.id,
      })
      navigator.sendBeacon('/api/vitals', body)
    }
  })
  return null
}
