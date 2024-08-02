import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Edit, Save } from "lucide-react";
import { PopoverHelper } from "@/components/PopoverHelpText";

const EditableField = ({
  label,
  value,
  onSave,
  type = "text",
  placeholder = "",
  helpText = "",
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  type?: string;
  placeholder?: string;
  helpText?: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleSave = () => {
    onSave(tempValue);
    setIsEditing(false);
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="font-medium">
        {label}{" "}
        {helpText && (
          <span className="relative -top-1 right-1">
            <PopoverHelper text={helpText} />
          </span>
        )}
        :
      </span>
      {isEditing ? (
        <>
          <Input
            type={type}
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            placeholder={placeholder}
            className="max-w-fit"
          />
          <Button onClick={handleSave} size="icon">
            <Save className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          {value ? (
            <span>{value}</span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
          <Button
            onClick={() => setIsEditing(true)}
            size="icon"
            variant="ghost"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
};

export default EditableField;
