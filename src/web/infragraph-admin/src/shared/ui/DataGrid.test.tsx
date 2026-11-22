import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from './DataGrid'
import { SettingsProvider } from '../preferences/settings'

type Row = { id: string; name: string; value: number }
const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'نام', size: 180 },
  { accessorKey: 'value', header: 'مقدار', size: 180 },
]

function renderGrid(data: Row[]) {
  return render(<SettingsProvider><DataGrid<Row> data={data} columns={columns} getRowId={(row) => row.id} label="جدول آزمایشی" /></SettingsProvider>)
}

describe('Virtualized accessible DataGrid', () => {
  it('keeps table semantics and does not render thousands of DOM rows', () => {
    const rows = Array.from({ length: 4_000 }, (_, i) => ({ id: String(i), name: `row-${i}`, value: i }))
    const { container } = renderGrid(rows)
    expect(screen.getByRole('table', { name: 'جدول آزمایشی' })).toHaveAttribute('aria-rowcount', '4000')
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(60)
    expect(screen.getByRole('button', { name: /ستون‌ها/ })).toBeInTheDocument()
  })

  it('exposes sorting via column headers with aria-sort', () => {
    renderGrid([{ id: '1', name: 'b', value: 2 }, { id: '2', name: 'a', value: 1 }])
    const th = screen.getByRole('columnheader', { name: /مقدار/ })
    expect(th).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(within(th).getByRole('button'))
    expect(th).toHaveAttribute('aria-sort', 'descending')
    fireEvent.click(within(th).getByRole('button'))
    expect(th).toHaveAttribute('aria-sort', 'ascending')
  })

  it('shows useful empty state rather than fabricating healthy nodes', () => {
    renderGrid([])
    expect(screen.getByText('موردی برای نمایش وجود ندارد.')).toBeInTheDocument()
  })
})
