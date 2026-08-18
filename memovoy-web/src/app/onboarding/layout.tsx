import { Providers } from '@/components/ui/Providers'
import type { ReactNode } from 'react'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>
}
