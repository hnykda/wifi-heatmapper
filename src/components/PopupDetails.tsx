import React, { useState } from "react";
import { SurveyPoint, HeatmapSettings, SurveyPointActions } from "@/lib/types";
import { formatMacAddress, metricFormatter } from "@/lib/utils";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X, Trash2 } from "lucide-react";
import { AlertDialogModal } from "@/components/AlertDialogModal";

interface PopupDetailsProps {
  point: SurveyPoint | null;
  settings: HeatmapSettings;
  surveyPointActions: SurveyPointActions;
  onClose: () => void; // New prop to close the popup
}

/**
 * PopupDetails is a "conditionally rendered <div>" that appears when its "point"
 * is non-null (otherwise it simply returns, not rendering anything)
 * (Original code had this test in Floorplan...)
 * @param point
 * @param settings
 * @param surveyPointActions
 * @param onClose - called when window should be closed
 * @returns
 */
const PopupDetails: React.FC<PopupDetailsProps> = ({
  point,
  settings,
  surveyPointActions,
  onClose,
}) => {
  // if no point passed in, just return
  if (!point) return;

  // const { settings, updateSettings } = useSettings();
  const [isEnabled, setIsEnabled] = useState(point.isEnabled);
  const rows = [
    { label: "ID", value: point.id },
    { label: "RSSI", value: `${point.wifiData.rssi} dBm` },
    {
      label: "Signal Strength",
      value: `${point.wifiData.signalStrength}%`,
      // value: `${point.wifiData?.signalStrength || rssiToPercentage(point.wifiData?.rssi)}%`,
    },
    { label: "Created", value: new Date(point.timestamp).toLocaleString() },
    { label: "SSID", value: point.wifiData?.ssid },
    { label: "Channel", value: point.wifiData?.channel },
    { label: "BSSID", value: formatMacAddress(point.wifiData?.bssid || "") },
    {
      label: "AP Name",
      value: settings.apMapping.find(
        (ap) => ap.macAddress === point.wifiData?.bssid,
      )?.apName,
    },
    { label: "Band", value: `${point.wifiData?.band} GHz` },
    { label: "Position", value: `X: ${point.x}, Y: ${point.y}` },
  ];

  if (point.iperfData) {
    rows.push(
      {
        label: "TCP Download",
        value: metricFormatter(
          point.iperfData.tcpDownload.bitsPerSecond,
          "tcpDownload",
          "bitsPerSecond",
        ),
      },
      {
        label: "TCP Upload",
        value: metricFormatter(
          point.iperfData.tcpUpload.bitsPerSecond,
          "tcpUpload",
          "bitsPerSecond",
        ),
      },
    );
  }

  /**
   * User clicked the Enabled switch.
   * Report back to the parent
   */
  const handleToggle = () => {
    setIsEnabled((prev) => {
      const newState = !prev;
      surveyPointActions.update(point, { isEnabled: newState });
      return newState;
    });
  };

  /**
   * User clicked the Delete button
   * Report back to the parent
   */
  const handleDelete = (point: SurveyPoint) => {
    surveyPointActions.delete([point]); // single-element array containing the point
    onClose();
  };

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
          <Switch checked={isEnabled} onCheckedChange={handleToggle} />
          <span>Enabled</span>
        </div>
        <AlertDialogModal
          title="Delete Measurement?"
          description="Are you sure you want to delete this measurement?"
          onCancel={() => {}}
          onConfirm={() => handleDelete(point)}
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
