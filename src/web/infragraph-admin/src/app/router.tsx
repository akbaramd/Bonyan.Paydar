import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from './layout/AppShell'
import { ErrorBoundary } from './ErrorBoundary'
import { PageSkeleton } from '../shared/ui/Skeleton'

const OverviewPage = lazy(() => import('../features/overview/pages/OverviewPage'))
const AssetsPage = lazy(() => import('../features/assets/pages/AssetsPage'))
const AdminUsersPage = lazy(() => import('../features/admin/pages/AdminUsersPage'))
const AuditPage = lazy(() => import('../features/admin/pages/AuditPage'))
const AccountPage = lazy(() => import('../features/account/pages/AccountPage'))
const AgentsPage = lazy(() => import('../features/agents/pages/AgentsPage'))
const IncidentsPage = lazy(() => import('../features/incidents/pages/IncidentsPage'))
const TopologyPage = lazy(() => import('../features/topology/pages/TopologyPage'))
const DiscoveryPage = lazy(() => import('../features/topology/pages/DiscoveryPage'))
const BaseServerPage = lazy(() => import('../features/topology/pages/BaseServerPage'))
const TableLabPage = import.meta.env.DEV ? lazy(() => import('../features/lab/pages/TableLabPage')) : null
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('../features/design-system/pages/DesignSystemPage')) : null
const FeaturePage = lazy(() => import('../features/placeholder/pages/FeaturePage'))

export function AppRouter() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppShell>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/audit" element={<AuditPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/topology" element={<TopologyPage />} />
              <Route path="/monitoring/discovery" element={<DiscoveryPage />} />
              <Route path="/monitoring/server" element={<BaseServerPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              {TableLabPage && <Route path="/lab/data-grid" element={<TableLabPage />} />}
              {DesignSystemPage && <Route path="/design-system" element={<DesignSystemPage />} />}
              <Route path="*" element={<FeaturePage title="صفحه پیدا نشد" description="مسیر درخواست‌شده در برنامه تعریف نشده است." />} />
            </Routes>
          </Suspense>
        </AppShell>
      </ErrorBoundary>
    </BrowserRouter>
  )
}