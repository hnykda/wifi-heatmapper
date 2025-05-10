"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState } from "react";

type MediaDropdownProps = {
  defaultValue?: string;
  onChange?: (value: string) => void;
};

/**
 * MediaDropdown - display a list of files (retrieved from the server side)
 *   in a dropdown, return the selected filename
 * There are three interesting handleXXX() routines:
 *   handleSelect() - responds to a selection of an existing file: returns that filename
 *   handleAddImage() - responds when "Add an image" is chosen
 *   handleFileChange() - responds when new file chosen, uploads it and (returns the new name?)
 * @param defaultValue - initial setting of the dropdown
 * @param onChange - function to call with the final "new" filename (not path)
 * @returns
 */

export default function MediaDropdown({
  defaultValue,
  onChange,
}: MediaDropdownProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(defaultValue || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/media");
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFiles(data.files);

      // If defaultValue is set and exists in the list, keep it selected
      if (defaultValue && data.files.includes(defaultValue)) {
        setSelected(defaultValue);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleSelect = (value: string) => {
    setSelected(value);
    onChange?.(value);
  };

  const handleAddImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/media", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      await fetchFiles();
    } else {
      alert("Upload failed");
    }

    e.target.value = ""; // reset input
  };

  const itemClassName =
    "relative flex cursor-default select-none items-center rounded-sm px-4 py-2 text-sm outline-none transition-colors focus:bg-slate-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

  return (
    <div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="border rounded px-4 py-2 bg-white shadow">
            {selected || "Select File"}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content className="min-w-[200px] rounded bg-white border shadow p-1">
          {files.map((file) => (
            <DropdownMenu.Item
              key={file}
              onSelect={() => handleSelect(file)}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100"
            >
              {file}
            </DropdownMenu.Item>
          ))}

          <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />

          <DropdownMenu.Item
            onSelect={handleAddImage}
            className="px-3 py-2 cursor-pointer font-medium text-blue-600 hover:bg-blue-50"
          >
            Add an image
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {error && <div className="text-red-600 mt-2">Error: {error}</div>}
    </div>
  );
}
