import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon } from "lucide-react";

export function FileInput({
  onFileSelect,
}: {
  onFileSelect: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  return (
    <div className="w-full border rounded p-4 border-gray-300">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-700 truncate">
          <ImageIcon className="w-4 h-4 text-gray-500" />
          {selectedFile ? (
            selectedFile.name
          ) : (
            <span className="text-gray-400">No file selected</span>
          )}
        </div>

        <Button
          type="button"
          onClick={handleButtonClick}
          variant="outline"
          size="sm"
          className="text-blue-600 border-blue-600 hover:bg-blue-50"
        >
          Browse
        </Button>
      </div>
    </div>
  );
}
