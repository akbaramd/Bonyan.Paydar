import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Direction, Tooltip } from 'radix-ui'
import { SettingsProvider } from '../../shared/preferences/settings'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  })
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <Direction.Provider dir="rtl">
        <SettingsProvider>
          <Tooltip.Provider delayDuration={250}>{children}</Tooltip.Provider>
        </SettingsProvider>
      </Direction.Provider>
    </QueryClientProvider>
  )
}
