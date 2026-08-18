'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed'

export function usePushNotifications() {
  const [state, setState]     = useState<PushState>('default')
  const [loading, setLoading] = useState(false)
  const swReg                 = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }

    navigator.serviceWorker.ready.then((reg) => {
      swReg.current = reg
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setState('subscribed')
        else setState(Notification.permission as PushState)
      })
    })
  }, [])

  async function subscribe() {
    if (!swReg.current) return
    setLoading(true)
    try {
      // Fetch VAPID public key from backend
      const { publicKey } = await api.get<{ publicKey: string }>('/notifications/vapid-key')
      const sub = await swReg.current.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      })
      const { endpoint, keys } = sub.toJSON() as {
        endpoint: string
        keys: { p256dh: string; auth: string }
      }
      await api.post('/notifications/push-subscribe', {
        endpoint,
        p256dh: keys.p256dh,
        auth:   keys.auth,
      })
      setState('subscribed')
    } catch {
      setState(Notification.permission as PushState)
    } finally {
      setLoading(false)
    }
  }

  async function unsubscribe() {
    if (!swReg.current) return
    setLoading(true)
    try {
      const sub = await swReg.current.pushManager.getSubscription()
      if (sub) {
        await api.delete('/notifications/push-subscribe', { endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setState('default')
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  return { state, loading, subscribe, unsubscribe }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from({ length: raw.length }, (_, i) => raw.charCodeAt(i))
}
