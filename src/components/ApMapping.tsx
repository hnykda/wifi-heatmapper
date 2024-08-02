import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Save, Plus, Trash } from "lucide-react";
import { ApMapping } from "@/lib/database";
import { formatMacAddress } from "@/lib/utils";

const EditableApMapping = ({
  apMapping,
  onSave,
}: {
  apMapping: ApMapping[];
  onSave: (apMapping: ApMapping[]) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempMapping, setTempMapping] = useState<ApMapping[]>(apMapping);

  useEffect(() => {
    setTempMapping(apMapping);
  }, [apMapping]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const convertMacAddress = (macAddress: string) => {
    // filter out all non-hex characters
    return macAddress
      .toLowerCase()
      .trim()
      .replace(/[^0-9a-f]/g, "");
  };

  const handleSave = () => {
    try {
      for (const ap of tempMapping) {
        const convertedMacAddress = convertMacAddress(ap.macAddress);
        if (convertedMacAddress.length !== 12) {
          throw new Error(
            "The following MAC Address is invalid: " +
              ap.macAddress +
              ". It should be 12 characters long when only hex digits are used.",
          );
        }
        ap.macAddress = convertedMacAddress;
      }
    } catch (error) {
      alert(error);
      return;
    }
    onSave(tempMapping);
    setIsEditing(false);
  };

  const handleAdd = () => {
    setTempMapping([...tempMapping, { apName: "", macAddress: "" }]);
  };

  const handleRemove = (index: number) => {
    setTempMapping(tempMapping.filter((_, i) => i !== index));
  };

  const handleChange = (
    index: number,
    field: keyof ApMapping,
    value: string,
  ) => {
    const newMapping = [...tempMapping];
    newMapping[index][field] = value;
    setTempMapping(newMapping);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="font-medium">Access Point Mappings</span>
        {isEditing ? (
          <Button onClick={handleSave} size="sm">
            <Save className="h-4 w-4 mr-2" /> Save
          </Button>
        ) : (
          <Button onClick={handleEdit} size="sm" variant="ghost">
            <Edit className="h-4 w-4 mr-2" /> Edit
          </Button>
        )}
      </div>
      {isEditing ? (
        <div className="space-y-2">
          {tempMapping.map((ap, index) => (
            <div key={index} className="flex space-x-2">
              <Input
                value={ap.apName}
                onChange={(e) => handleChange(index, "apName", e.target.value)}
                placeholder="AP Name"
                className="flex-grow"
              />
              <Input
                value={ap.macAddress}
                onChange={(e) =>
                  handleChange(index, "macAddress", e.target.value)
                }
                placeholder="MAC Address"
                className="flex-grow"
              />
              <Button
                onClick={() => handleRemove(index)}
                size="icon"
                variant="ghost"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Add AP
          </Button>
        </div>
      ) : (
        <ul className="space-y-2 pl-0">
          {apMapping.map((ap, index) => (
            <li
              key={index}
              className="flex gap-2 items-center bg-gray-100 p-2 rounded-md"
            >
              <span className="font-medium">{ap.apName}:</span>
              <span className="text-gray-600">
                {formatMacAddress(ap.macAddress)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EditableApMapping;
