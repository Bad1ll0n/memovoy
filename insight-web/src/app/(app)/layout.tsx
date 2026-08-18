import { ViewTransition } from 'react'
import { Providers } from '@/components/ui/Providers'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { RightPanel } from '@/components/layout/RightPanel'
import { EmailVerificationBanner } from '@/components/ui/EmailVerificationBanner'
import { AuthHydrator } from '@/components/ui/AuthHydrator'
import { FeatureTour } from '@/components/ui/FeatureTour'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { SocketProvider } from '@/components/ui/SocketProvider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AuthHydrator />
      <SocketProvider>
      <EmailVerificationBanner />
      <FeatureTour />
      <ToastProvider />
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="flex-1 min-w-0 pb-[calc(var(--bottom-nav-h)+1rem)] lg:pb-4">
          <div className="mx-auto max-w-[760px] px-4 pt-4">
            <ViewTransition enter="page-fade" exit="page-fade">
              {children}
            </ViewTransition>
          </div>
        </main>

        <RightPanel />
      </div>

      <BottomNav />
      </SocketProvider>
    </Providers>
  )
}
