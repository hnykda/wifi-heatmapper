"use client";
import React, { useCallback, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  flexRender,
  VisibilityState,
  SortingState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Columns3,
  Download,
  Trash2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ApMapping,
  Gradient,
  SurveyPoint,
  SurveyPointActions,
} from "@/lib/types";
import { getColorAt, objectToRGBAString } from "@/lib/utils-gradient";
import { formatMacAddress, rssiToPercentage } from "@/lib/utils";
import { surveyPointsToCsv, downloadText } from "@/lib/exportCsv";
import { AlertDialogModal } from "./AlertDialogModal";
import { useSettings } from "./GlobalSettings";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  x: number;
  y: number;
  ssid: string;
  bssid: string;
  accessPoint: string;
  rssi: number;
  signalQuality: number;
  channel: number;
  security: string;
  txRate: number;
  phyMode: string;
  channelWidth: number;
  band: string;
  tcpDownloadMbps: number;
  tcpUploadMbps: number;
  udpDownloadMbps: number;
  udpUploadMbps: number;
  timestamp: number;
  isEnabled: boolean;
  origPoint: SurveyPoint;
};

interface SurveyPointsTableProps {
  data: SurveyPoint[];
  surveyPointActions: SurveyPointActions;
  apMapping: ApMapping[];
}

const toMbps = (bps: number) => Math.round((bps / 1_000_000) * 100) / 100;
const mbps = (v: number) => (v === 0 ? "" : v.toFixed(2));

const SurveyPointsTable: React.FC<SurveyPointsTableProps> = ({
  data,
  surveyPointActions,
  apMapping,
}) => {
  const { settings } = useSettings();
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    rssi: false,
    ssid: false,
    security: false,
    txRate: false,
    phyMode: false,
    channelWidth: false,
    channel: false,
    x: false,
    y: false,
    udpDownloadMbps: false,
    udpUploadMbps: false,
  });

  const rows: Row[] = useMemo(
    () =>
      data.map((point) => ({
        origPoint: point,
        id: point.id,
        x: point.x,
        y: point.y,
        ssid: point.wifiData.ssid,
        bssid: point.wifiData.bssid,
        accessPoint:
          apMapping.find((ap) => ap.macAddress === point.wifiData.bssid)
            ?.apName ?? "",
        rssi: point.wifiData.rssi,
        signalQuality:
          point.wifiData.signalStrength ||
          rssiToPercentage(point.wifiData.rssi),
        channel: point.wifiData.channel,
        security: point.wifiData.security,
        txRate: point.wifiData.txRate,
        phyMode: point.wifiData.phyMode,
        channelWidth: point.wifiData.channelWidth,
        band: point.wifiData.band ? `${point.wifiData.band} GHz` : "",
        tcpDownloadMbps: toMbps(point.iperfData.tcpDownload.bitsPerSecond),
        tcpUploadMbps: toMbps(point.iperfData.tcpUpload.bitsPerSecond),
        udpDownloadMbps: toMbps(point.iperfData.udpDownload.bitsPerSecond),
        udpUploadMbps: toMbps(point.iperfData.udpUpload.bitsPerSecond),
        timestamp: point.timestamp,
        isEnabled: point.isEnabled,
      })),
    [data, apMapping],
  );

  const update = surveyPointActions.update;
  const columns: ColumnDef<Row>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all rows on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label={`Select ${row.original.id}`}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      { accessorKey: "id", header: "Point", meta: { align: "left" } },
      {
        id: "enabled",
        accessorKey: "isEnabled",
        header: "Used",
        cell: ({ row }) => (
          <Switch
            checked={row.original.isEnabled}
            onCheckedChange={(v) =>
              update(row.original.origPoint, { isEnabled: v })
            }
            aria-label={`Use ${row.original.id} in heat maps`}
          />
        ),
      },
      {
        accessorKey: "signalQuality",
        header: "Signal %",
        cell: ({ row, getValue }) => (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full border border-black/15"
              style={{
                background: signalColor(getValue<number>(), settings.gradient),
              }}
            />
            {getValue<number>()}
            {!row.original.isEnabled && (
              <span className="sr-only"> (ignored)</span>
            )}
          </span>
        ),
      },
      { accessorKey: "rssi", header: "RSSI dBm" },
      { accessorKey: "band", header: "Band" },
      { accessorKey: "channel", header: "Channel" },
      {
        accessorKey: "accessPoint",
        header: "Access point",
        meta: { align: "left" },
        cell: ({ row }) =>
          row.original.accessPoint ||
          (row.original.bssid ? (
            <span className="font-mono text-xs text-muted-foreground">
              {formatMacAddress(row.original.bssid)}
            </span>
          ) : (
            ""
          )),
      },
      { accessorKey: "ssid", header: "Network", meta: { align: "left" } },
      {
        accessorKey: "tcpDownloadMbps",
        header: "TCP down",
        cell: ({ getValue }) => mbps(getValue<number>()),
      },
      {
        accessorKey: "tcpUploadMbps",
        header: "TCP up",
        cell: ({ getValue }) => mbps(getValue<number>()),
      },
      {
        accessorKey: "udpDownloadMbps",
        header: "UDP down",
        cell: ({ getValue }) => mbps(getValue<number>()),
      },
      {
        accessorKey: "udpUploadMbps",
        header: "UDP up",
        cell: ({ getValue }) => mbps(getValue<number>()),
      },
      { accessorKey: "security", header: "Security", meta: { align: "left" } },
      { accessorKey: "txRate", header: "TX rate" },
      { accessorKey: "phyMode", header: "PHY" },
      { accessorKey: "channelWidth", header: "Width MHz" },
      { accessorKey: "x", header: "X" },
      { accessorKey: "y", header: "Y" },
      {
        accessorKey: "timestamp",
        header: "Measured",
        cell: ({ getValue }) => new Date(getValue<number>()).toLocaleString(),
      },
    ],
    [update, settings.gradient],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { rowSelection, globalFilter, columnVisibility, sorting },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const selectedPoints = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original.origPoint),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowSelection, rows],
  );

  const deleteSelected = useCallback(() => {
    surveyPointActions.delete(selectedPoints);
    setRowSelection({});
  }, [selectedPoints, surveyPointActions]);

  const setSelectedEnabled = useCallback(
    (enabled: boolean) => {
      for (const p of selectedPoints) update(p, { isEnabled: enabled });
    },
    [selectedPoints, update],
  );

  const exportCsv = () => {
    const name =
      settings.floorplanImageName.replace(/\.[^.]+$/, "") || "survey";
    downloadText(
      surveyPointsToCsv(data, apMapping),
      `${name}-survey-points.csv`,
    );
  };

  const selectedCount = selectedPoints.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Survey points</h1>
          <p className="text-sm text-muted-foreground">
            Every measurement in this survey. Switch a point off to leave it out
            of the heat maps, or delete the ones that went wrong.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={data.length === 0}
          data-testid="export-csv"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter points"
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
          aria-label="Filter points"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[60vh] overflow-y-auto"
          >
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(!!v)}
                >
                  {typeof column.columnDef.header === "string"
                    ? column.columnDef.header
                    : column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {selectedCount > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-md border bg-brand-soft/60 py-1 pl-3 pr-1 text-sm">
            <span className="tabular">{selectedCount} selected</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEnabled(true)}
            >
              Use
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEnabled(false)}
            >
              Ignore
            </Button>
            <AlertDialogModal
              title={`Delete ${selectedCount} point${selectedCount === 1 ? "" : "s"}?`}
              description="They are removed from this survey. This cannot be undone."
              confirmLabel="Delete"
              destructive
              onConfirm={deleteSelected}
              onCancel={() => {}}
            >
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                data-testid="delete-selected"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogModal>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRowSelection({})}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-md border bg-surface">
        <Table data-testid="points-table">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const align = (
                    header.column.columnDef.meta as
                      | { align?: string }
                      | undefined
                  )?.align;
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-10 whitespace-nowrap text-xs",
                        align === "left" ? "text-left" : "text-right",
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-foreground",
                            align === "left" ? "" : "flex-row-reverse",
                          )}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {{
                            asc: <ChevronUp className="h-3.5 w-3.5" />,
                            desc: <ChevronDown className="h-3.5 w-3.5" />,
                          }[header.column.getIsSorted() as string] ?? (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  data-testid="points-row"
                  className={cn(
                    !row.original.isEnabled && "text-muted-foreground",
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = (
                      cell.column.columnDef.meta as
                        | { align?: string }
                        | undefined
                    )?.align;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "tabular whitespace-nowrap py-2",
                          align === "left" ? "text-left" : "text-right",
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {data.length === 0
                    ? "No measurements yet. Take some on the Floor plan tab."
                    : "No points match the filter."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="tabular text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

function signalColor(percent: number, gradient: Gradient): string {
  return objectToRGBAString({ ...getColorAt(percent / 100, gradient), a: 1 });
}

export default SurveyPointsTable;
