import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen">
      {children}
    </div>
  )
}
