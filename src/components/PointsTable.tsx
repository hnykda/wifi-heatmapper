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
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
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
import { SurveyPoint } from "@/lib/types";
import { Switch } from "./ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Types
type FlattenedSurveyPoint = {
  id: string;
  x: number;
  y: number;
  ssid: string;
  bssid: string;
  rssi: number;
  channel: number;
  security: string;
  txRate: number;
  phyMode: string;
  channelWidth: number;
  frequency: number;
  tcpDownloadMbps: number;
  tcpUploadMbps: number;
  udpDownloadMbps: number;
  udpUploadMbps: number;
  timestamp: string;
  isHidden: boolean;
};

interface SurveyPointsTableProps {
  data: SurveyPoint[];
  onDelete: (ids: string[]) => void;
  updateDatapoint: (id: string, data: Partial<SurveyPoint>) => void;
}

const SurveyPointsTable: React.FC<SurveyPointsTableProps> = ({
  data,
  onDelete,
  updateDatapoint,
}) => {
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    select: true,
    id: true,
    rssi: true,
    bssid: true,
    channel: true,
    tcpDownloadMbps: true,
    tcpUploadMbps: true,
    timestamp: true,
    hide: true,
    ssid: false,
    security: false,
    txRate: false,
    phyMode: false,
    channelWidth: false,
    frequency: false,
    x: false,
    y: false,
  });

  const columns: ColumnDef<FlattenedSurveyPoint>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "id",
        header: "ID",
      },
      {
        accessorKey: "rssi",
        header: "RSSI",
      },
      {
        accessorKey: "bssid",
        header: "BSSID",
      },
      {
        accessorKey: "channel",
        header: "Channel",
      },
      {
        accessorKey: "tcpDownloadMbps",
        header: "TCP Down (Mbps)",
      },
      {
        accessorKey: "tcpUploadMbps",
        header: "TCP Up (Mbps)",
      },
      {
        accessorKey: "udpDownloadMbps",
        header: "UDP Down (Mbps)",
      },
      {
        accessorKey: "udpUploadMbps",
        header: "UDP Up (Mbps)",
      },
      {
        accessorKey: "timestamp",
        header: "Timestamp",
      },
      {
        id: "hide",
        header: "Hide",
        cell: ({ row }) => (
          <Switch
            checked={row.original.isHidden}
            onCheckedChange={(value) => {
              const id = row.original.id;
              updateDatapoint(id, { isHidden: value });
            }}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "ssid",
        header: "SSID",
      },
      {
        accessorKey: "security",
        header: "Security",
      },
      {
        accessorKey: "txRate",
        header: "TX Rate",
      },
      {
        accessorKey: "phyMode",
        header: "PHY Mode",
      },
      {
        accessorKey: "channelWidth",
        header: "Channel Width",
      },
      {
        accessorKey: "frequency",
        header: "Frequency",
      },
      {
        accessorKey: "x",
        header: "X",
      },
      {
        accessorKey: "y",
        header: "Y",
      },
    ],
    [updateDatapoint]
  );

  const convertToMbps = (bitsPerSecond: number) => {
    return Math.round((bitsPerSecond / 1000000) * 100) / 100;
  };

  const flattenedData: FlattenedSurveyPoint[] = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        ...point.wifiData,
        tcpDownloadMbps: convertToMbps(
          point.iperfResults.tcpDownload.bitsPerSecond
        ),
        tcpUploadMbps: convertToMbps(
          point.iperfResults.tcpUpload.bitsPerSecond
        ),
        udpDownloadMbps: convertToMbps(
          point.iperfResults.udpDownload.bitsPerSecond
        ),
        udpUploadMbps: convertToMbps(
          point.iperfResults.udpUpload.bitsPerSecond
        ),
      })),
    [data]
  );

  const table = useReactTable({
    data: flattenedData,
    columns,
    state: {
      rowSelection,
      globalFilter,
      columnVisibility,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleDelete = useCallback(() => {
    const selectedIds = Object.keys(rowSelection).map(
      (index) => flattenedData[parseInt(index)].id
    );
    onDelete(selectedIds);
  }, [rowSelection, flattenedData, onDelete]);

  const toggleHideSelected = useCallback(() => {
    const selectedIds = Object.keys(rowSelection).map(
      (index) => flattenedData[parseInt(index)].id
    );
    const allHidden = selectedIds.every(
      (id) => flattenedData.find((point) => point.id === id)?.isHidden
    );
    selectedIds.forEach((id) => {
      updateDatapoint(id, { isHidden: !allHidden });
    });
  }, [rowSelection, flattenedData, updateDatapoint]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Input
            placeholder="Search all columns..."
            value={globalFilter ?? ""}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />
          <span className="text-sm text-gray-500">
            {Object.keys(rowSelection).length} of {flattenedData.length} row(s)
            selected
          </span>
        </div>
        <div className="space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.toggleAllRowsSelected(false)}
          >
            Deselect All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.toggleAllRowsSelected(true)}
          >
            Select All
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            Delete Selected
          </Button>
          <Button variant="secondary" size="sm" onClick={toggleHideSelected}>
            Toggle Hide Selected
          </Button>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div
                        {...{
                          className: header.column.getCanSort()
                            ? "cursor-pointer select-none"
                            : "",
                          onClick: header.column.getToggleSortingHandler(),
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: <ChevronUp className="ml-2 h-4 w-4" />,
                          desc: <ChevronDown className="ml-2 h-4 w-4" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, i) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={`${
                    row.getIsSelected()
                      ? "bg-primary/10"
                      : i % 2 === 0
                        ? "bg-muted/50"
                        : ""
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
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
    </div>
  );
};

export default SurveyPointsTable;
