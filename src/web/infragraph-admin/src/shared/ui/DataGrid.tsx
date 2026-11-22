import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3, ArrowLeft, ArrowRight } from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DropdownMenu } from 'radix-ui'
import { Button } from './Button'
import { useSettings } from '../preferences/settings-context'

export type ServerPaging = {
  pageIndex: number
  pageSize: number
  totalRows: number
  onPageChange: (pageIndex: number) => void
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
}

export type DataGridProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData>[]
  getRowId: (row: TData) => string
  label: string
  emptyMessage?: string
  paging?: ServerPaging
}

function getHeaderText<TData>(header: ColumnDef<TData>['header'], id: string) {
  return typeof header === 'string' ? header : id
}

/** Headless TanStack Table + TanStack Virtual, with owned UI, stable IDs and RTL-safe overflow. */
export function DataGrid<TData>({
  data, columns, getRowId, label, emptyMessage = 'موردی برای نمایش وجود ندارد.', paging,
}: DataGridProps<TData>) {
  const [localSorting, setLocalSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const { density } = useSettings()
  const [coarsePointer, setCoarsePointer] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarsePointer(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  const rowHeight = density === 'comfortable' || coarsePointer ? 48 : 40
  const sorting = paging?.sorting ?? localSorting

  // oxlint-disable-next-line react/incompatible-library -- TanStack Table is an intentional headless adapter; React Compiler skips this hook.
  const table = useReactTable({
    data, columns, getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: Boolean(paging),
    state: { sorting, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      if (paging) {
        paging.onSortingChange(next)
        paging.onPageChange(0)
      } else {
        setLocalSorting(next)
      }
    },
  })

  const rows = table.getRowModel().rows
  const visibleColumns = table.getVisibleLeafColumns()
  const gridWidth = useMemo(() => visibleColumns.reduce((size, column) => size + column.getSize(), 0), [visibleColumns])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 9,
    initialRect: { height: 500, width: 1100 },
  })

  useEffect(() => { virtualizer.measure() }, [rowHeight, virtualizer])

  const totalPages = paging ? Math.ceil(paging.totalRows / paging.pageSize) : 0

  return (
    <div className="data-grid-root">
      <div className="data-grid-toolbar">
        <span role="status" aria-live="polite">
          {paging
            ? `${paging.totalRows.toLocaleString('fa-IR')} رکورد · صفحه ${(paging.pageIndex + 1).toLocaleString('fa-IR')}`
            : `${rows.length.toLocaleString('fa-IR')} رکورد`}
        </span>
        <DropdownMenu.Root dir="rtl">
          <DropdownMenu.Trigger asChild>
            <Button variant="secondary" size="sm"><Columns3 size={16} aria-hidden="true" />ستون‌ها</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="ig-dropdown" align="end" sideOffset={5} aria-label="تنظیم نمایش ستون‌ها">
              <DropdownMenu.Label className="ig-dropdown-label">ستون‌های قابل نمایش</DropdownMenu.Label>
              {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
                <DropdownMenu.CheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
                  onSelect={(event) => event.preventDefault()}
                  className="ig-dropdown-item"
                >
                  <DropdownMenu.ItemIndicator className="ig-dropdown-check">✓</DropdownMenu.ItemIndicator>
                  {getHeaderText(column.columnDef.header, column.id)}
                </DropdownMenu.CheckboxItem>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="data-grid-scroll" ref={scrollRef} data-testid="grid-scroll">
        <table className="ig-data-table" aria-label={label} aria-rowcount={paging?.totalRows ?? rows.length} style={{ width: Math.max(gridWidth, 850) }}>
          <thead className="ig-table-head">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="ig-table-row">
                {group.headers.map((header) => {
                  const direction = header.column.getIsSorted()
                  return (
                    <th key={header.id} scope="col" aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ width: header.getSize(), flex: `0 0 ${header.getSize()}px` }}>
                      {header.column.getCanSort() ? (
                        <button className="ig-th-button" onClick={header.column.getToggleSortingHandler()} type="button">
                          <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                          {direction === 'asc' ? <ChevronUp size={14} aria-hidden="true" /> : direction === 'desc' ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronsUpDown size={14} aria-hidden="true" />}
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="ig-table-body" style={{ height: rows.length ? virtualizer.getTotalSize() : 0 }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              return (
                <tr key={row.id} className="ig-table-row ig-table-row--data" data-index={virtualRow.index}
                  style={{ height: rowHeight, transform: `translateY(${virtualRow.start}px)` }}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ width: cell.column.getSize(), flex: `0 0 ${cell.column.getSize()}px` }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="data-grid-empty" role="status">{emptyMessage}</div>}
      </div>

      {paging && (
        <div className="data-grid-pager" aria-label="صفحه‌بندی سمت سرور">
          <span>{paging.totalRows.toLocaleString('fa-IR')} رکورد · {Math.max(totalPages, 1).toLocaleString('fa-IR')} صفحه</span>
          <div>
            <Button size="sm" variant="ghost" disabled={paging.pageIndex === 0} onClick={() => paging.onPageChange(paging.pageIndex - 1)} aria-label="صفحه قبل"><ArrowRight size={17} /></Button>
            <span className="pager-number numeric">{paging.pageIndex + 1} / {Math.max(totalPages, 1)}</span>
            <Button size="sm" variant="ghost" disabled={paging.pageIndex + 1 >= totalPages} onClick={() => paging.onPageChange(paging.pageIndex + 1)} aria-label="صفحه بعد"><ArrowLeft size={17} /></Button>
          </div>
        </div>
      )}
    </div>
  )
}
