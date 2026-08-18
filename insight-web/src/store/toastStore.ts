import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  undoFn?: () => void | Promise<void>
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  add: (toast: Omit<Toast, 'id'>) => string
  remove: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    return id
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

export function toast(message: string, opts?: { type?: Toast['type']; undoFn?: Toast['undoFn']; duration?: number }) {
  return useToastStore.getState().add({
    message,
    type: opts?.type ?? 'info',
    undoFn: opts?.undoFn,
    duration: opts?.duration ?? 4000,
  })
}
