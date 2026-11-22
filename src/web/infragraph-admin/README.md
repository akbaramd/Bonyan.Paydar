# InfraGraph Admin UI — Enterprise React Foundation

**Status:** React UI architecture/design-system foundation is implemented and locally tested. Real network discovery, incident workflows, admin authorization and asset APIs remain disabled/unimplemented.

## Stack
- React 19 + TypeScript + Vite 8, integrated with ASP.NET Core via Microsoft.AspNetCore.SpaProxy.
- Radix UI Primitives (headless interactive foundations), **our own** CSS design system.
- TanStack Table v8 + TanStack Virtual v3 for high-density, accessible and virtualized data tables.
- TanStack Query v5 (server state), Zod (runtime response validation), React Router (SPA navigation).
- Theme/density preferences, Persian RTL with Radix Direction.Provider and responsive tablet drawer.
- No Redux currently; Redux is not a headless UI library.
- Vazirmatn Variable self-hosted font, React Flow graph, React Icons equipment pictograms and DOMPurify local SVG validation.
- React Flow supports pan/zoom/fit/minimap. Desktop node inspector is keyboard-resizable; touch tablets use Radix detail drawer.
- Global Ctrl+K navigation and read-only notification drawer are available without faking live status.

## Run with backend (Mate Server)
From repository root:
```powershell
dotnet run --project src/server/InfraGraph.ControlPlane --launch-profile https
```
SPA Proxy starts Vite on `http://localhost:5173` and API on `https://localhost:7187`. In production React static files are hosted by ControlPlane; no Node server required.

## Frontend commands
```powershell
cd src/web/infragraph-admin
npm ci
npm run tokens:build
npm run tokens:check
npm run architecture:check
npm run lint
npm run test
npm run build
npm run test:e2e
```
On Mate Server Playwright E2E uses installed Edge. In CI it uses installed Playwright Chromium.

## Pages
- `/`: real empty system state, NoData/Unknown handling, incident-first dashboard structure.
- `/assets`: future inventory, reusable table with empty state.
- `/topology`: operational graph viewer with an **explicitly synthetic development-only 10-device fixture**; production displays no-data/unknown until the evidence-backed backend exists.
- `/incidents`, `/agents`: explicit unavailable modules.
- `/lab/data-grid`: **DEV ONLY**, 12k local synthetic rows (filter/sort/column visibility/virtualization).
- `/design-system`: **DEV ONLY**, token/color/density and Radix interaction gallery.

## Design tokens
Edit **only** `design-tokens/tokens.json`; run `npm run tokens:build` and commit generated `src/shared/styles/tokens.css` and `tokens.generated.ts`. No external font CDN, compatible with disconnected on-prem networks.

## Architecture
Project decision: `docs/architecture/decisions/0016-frontend-headless-design-system.md`.
Design+architecture: `docs/frontend/architecture.md`, `docs/frontend/design-system.md`.
Latest verification: `docs/frontend/verification-2026-11-20.md` (20 Vitest/15 Playwright), baseline: `docs/frontend/verification-2026-11-19.md`.