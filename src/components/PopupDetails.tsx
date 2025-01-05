import React, { useState } from "react";
import { SurveyPoint } from "@/lib/types";
import {
  formatMacAddress,
  metricFormatter,
  rssiToPercentage,
} from "@/lib/utils";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X, Trash2 } from "lucide-react";
import { AlertDialogModal } from "@/components/AlertDialogModal";

interface PopupDetailsProps {
  point: SurveyPoint;
  apMapping: { apName: string; macAddress: string }[];
  onClose: () => void;
  updateDatapoint: (id: string, data: Partial<SurveyPoint>) => void;
  onDelete: (id: string[]) => void;
}

const PopupDetails: React.FC<PopupDetailsProps> = ({
  point,
  apMapping,
  onClose,
  updateDatapoint,
  onDelete,
}) => {
  const [isDisabled, setIsDisabled] = useState(point.isDisabled);
  const rows = [
    { label: "ID", value: point.id },
    { label: "RSSI", value: `${point.wifiData?.rssi} dBm` },
    {
      label: "Signal Strength",
      value: `${point.wifiData?.signalStrength || rssiToPercentage(point.wifiData?.rssi)}%`,
    },
    { label: "Created", value: new Date(point.timestamp).toLocaleString() },
    { label: "SSID", value: point.wifiData?.ssid },
    { label: "Channel", value: point.wifiData?.channel },
    { label: "BSSID", value: formatMacAddress(point.wifiData?.bssid || "") },
    {
      label: "AP Name",
      value: apMapping.find((ap) => ap.macAddress === point.wifiData?.bssid)
        ?.apName,
    },
    { label: "Frequency", value: `${point.wifiData?.frequency} MHz` },
    { label: "Position", value: `X: ${point.x}, Y: ${point.y}` },
  ];

  if (point.iperfResults) {
    rows.push(
      {
        label: "TCP Download",
        value: metricFormatter(
          point.iperfResults.tcpDownload.bitsPerSecond,
          "tcpDownload",
          "bitsPerSecond",
        ),
      },
      {
        label: "TCP Upload",
        value: metricFormatter(
          point.iperfResults.tcpUpload.bitsPerSecond,
          "tcpUpload",
          "bitsPerSecond",
        ),
      },
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg text-xs overflow-hidden">
      <div className="flex justify-between items-center bg-gray-100 px-2 py-1">
        <h3 className="font-semibold text-sm">Measurement Details</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <X size={16} />
        </button>
      </div>
      <Table>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={row.label}
              className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
            >
              <TableCell className="py-1 px-2 font-medium">
                {row.label}
              </TableCell>
              <TableCell className="py-1 px-2">{row.value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-between items-center px-2 py-2 bg-gray-100">
        <div className="flex items-center space-x-2">
          <Switch
            checked={isDisabled}
            onCheckedChange={(checked) => {
              setIsDisabled(checked);
              updateDatapoint(point.id, { isDisabled: checked });
            }}
          />
          <span>Disable</span>
        </div>
        <AlertDialogModal
          title="Delete Measurement?"
          description="Are you sure you want to delete this measurement?"
          onCancel={() => {}}
          onConfirm={() => onDelete([point.id])}
        >
          <Button
            variant="destructive"
            size="sm"
            className="flex items-center space-x-1"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </Button>
        </AlertDialogModal>
      </div>
    </div>
  );
};

export default PopupDetails;
