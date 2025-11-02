import React, { useEffect, useRef, useState } from "react";
import { SurveyPoint, HeatmapSettings, SurveyPointActions } from "@/lib/types";
import {
  formatMacAddress,
  metricFormatter,
  normalizeMacAddress,
} from "@/lib/utils";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  //   | Stat | Value |
  // | ---- | ----- |
  // | ID | Point ###  |
  // | SSID | abcdef |
  // | Signal Strength | 50% |
  // | RSSI | -70 dBm |
  // | Channel | 6 |
  // | Band | 2.4 GHz |
  // | BSSID | ##:##:##:##:##:## |
  // | AP Name | |
  // |  |  |
  // | Strongest SSID |<link to another PopupDetail?> |
  // | TCP Download | 0.00 Mbps |
  // | TCP Upload | 0.00 Mbps |
  // | Position | X: 274, Y: 47 |
  // | Created  | 9/16/2025, 9:39:44 PM |

  // const { settings, updateSettings } = useSettings();
  const [isEnabled, setIsEnabled] = useState(point.isEnabled);
  type EditableField = "id" | "ssid" | "bssid";

  const [editableValues, setEditableValues] = useState<
    Record<EditableField, string>
  >({
    id: point.id,
    ssid: point.wifiData?.ssid ?? "",
    bssid: formatMacAddress(point.wifiData?.bssid ?? ""),
  });
  const [currentPointId, setCurrentPointId] = useState(point.id);
  const [hasIdError, setHasIdError] = useState(false);
  const idInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setIsEnabled(point.isEnabled);
    setCurrentPointId(point.id);
    setHasIdError(false);
    setEditableValues({
      id: point.id,
      ssid: point.wifiData?.ssid ?? "",
      bssid: formatMacAddress(point.wifiData?.bssid ?? ""),
    });
  }, [point]);

  const handleInputChange = (field: EditableField) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setEditableValues((prev) => ({ ...prev, [field]: value }));
      if (field === "id") {
        setHasIdError(false);
      }
    };
  };

  const handleInputBlur = (field: EditableField) => {
    return (_event: React.FocusEvent<HTMLInputElement>) => {
      if (field === "id") {
        const newId = editableValues.id.trim();
        if (newId.length === 0) {
          setEditableValues((prev) => ({ ...prev, id: currentPointId }));
          setHasIdError(true);
          setTimeout(() => {
            idInputRef.current?.focus();
            idInputRef.current?.select();
          }, 0);
          return;
        }
        if (newId === currentPointId) {
          if (newId !== editableValues.id) {
            setEditableValues((prev) => ({ ...prev, id: newId }));
          }
          setHasIdError(false);
          return;
        }
        const duplicateExists = settings.surveyPoints.some(
          (surveyPoint) =>
            surveyPoint.id === newId && surveyPoint.id !== currentPointId,
        );
        if (duplicateExists) {
          setEditableValues((prev) => ({ ...prev, id: currentPointId }));
          setHasIdError(true);
          setTimeout(() => {
            idInputRef.current?.focus();
            idInputRef.current?.select();
          }, 0);
          return;
        }
        surveyPointActions.update(point, { id: newId });
        setCurrentPointId(newId);
        point.id = newId;
        setEditableValues((prev) => ({ ...prev, id: newId }));
        setHasIdError(false);
        return;
      }

      if (field === "ssid") {
        const newSsid = editableValues.ssid;
        if (newSsid === (point.wifiData?.ssid ?? "")) {
          return;
        }
        const updatedWifiData = { ...point.wifiData, ssid: newSsid };
        surveyPointActions.update(point, { wifiData: updatedWifiData });
        point.wifiData.ssid = newSsid;
        return;
      }

      if (field === "bssid") {
        const normalized = normalizeMacAddress(editableValues.bssid);
        const formatted = normalized ? formatMacAddress(normalized) : "";
        if (normalized === (point.wifiData?.bssid ?? "")) {
          if (formatted !== editableValues.bssid) {
            setEditableValues((prev) => ({ ...prev, bssid: formatted }));
          }
          return;
        }
        const updatedWifiData = { ...point.wifiData, bssid: normalized };
        surveyPointActions.update(point, { wifiData: updatedWifiData });
        point.wifiData.bssid = normalized;
        setEditableValues((prev) => ({ ...prev, bssid: formatted }));
      }
    };
  };

  const handleInputKeyDown = (field: EditableField) => {
    return (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (field === "id") {
          setEditableValues((prev) => ({ ...prev, id: point.id }));
          setHasIdError(false);
        } else if (field === "ssid") {
          setEditableValues((prev) => ({
            ...prev,
            ssid: point.wifiData?.ssid ?? "",
          }));
        } else {
          const formattedBssid = point.wifiData?.bssid
            ? formatMacAddress(point.wifiData.bssid)
            : "";
          setEditableValues((prev) => ({ ...prev, bssid: formattedBssid }));
        }
        event.currentTarget.blur();
      }
    };
  };

  const rows = [
    {
      label: "ID",
      value: (
        <Input
          value={editableValues.id}
          onChange={handleInputChange("id")}
          onBlur={handleInputBlur("id")}
          onKeyDown={handleInputKeyDown("id")}
          className={`h-7 px-2 py-1 text-xs ${
            hasIdError ? "border border-red-500 focus-visible:ring-red-500" : ""
          }`}
          spellCheck={false}
          ref={idInputRef}
        />
      ),
    },
    {
      label: "SSID",
      value: (
        <Input
          value={editableValues.ssid}
          onChange={handleInputChange("ssid")}
          onBlur={handleInputBlur("ssid")}
          onKeyDown={handleInputKeyDown("ssid")}
          className="h-7 px-2 py-1 text-xs"
          spellCheck={false}
        />
      ),
    },
    {
      label: "BSSID",
      value: (
        <Input
          value={editableValues.bssid}
          onChange={handleInputChange("bssid")}
          onBlur={handleInputBlur("bssid")}
          onKeyDown={handleInputKeyDown("bssid")}
          className="h-7 px-2 py-1 text-xs"
          spellCheck={false}
          placeholder="00-00-00-00-00-00"
        />
      ),
    },
    {
      label: "Signal Strength",
      value: `${point.wifiData.signalStrength}%`,
      // value: `${point.wifiData?.signalStrength || rssiToPercentage(point.wifiData?.rssi)}%`,
    },
    { label: "RSSI", value: `${point.wifiData.rssi} dBm` },
    { label: "Channel", value: point.wifiData?.channel },
    { label: "Band", value: `${point.wifiData?.band} GHz` },

    {
      label: "AP Name",
      value: settings.apMapping.find(
        (ap) => ap.macAddress === point.wifiData?.bssid,
      )?.apName,
    },
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
  rows.push({ label: "Position", value: `X: ${point.x}, Y: ${point.y}` });
  rows.push({
    label: "Created",
    value: new Date(point.timestamp).toLocaleString(),
  });

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
