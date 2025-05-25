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
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/media");
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      // only include PNG and JP(E)G files
      const imageFiles = data.files.filter((name: string) =>
        /\.(jpe?g|png)$/i.test(name),
      );
      setFiles(imageFiles);

      // If defaultValue is set and exists in the list, keep it selected
      if (defaultValue && imageFiles.includes(defaultValue)) {
        setSelected(defaultValue);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  /**
   * Retrieve files from the server when the dropdown mounts
   */
  useEffect(() => {
    fetchFiles();
  }, []);

  /**
   * Set the selected file whenever defaultValue changes.
   * This works around the problem that the dropdown mounts
   * prior to reading the current settings.
   * Subsequent calls to MediaDropdown with the new file name
   * won't update otherwise.
   */
  useEffect(() => {
    if (defaultValue) {
      setSelected(defaultValue);
    }
  }, [defaultValue]);

  /**
   * handleSelect - they selected a new file
   * Call parent onChange() function with that new name
   * @param name of new file to be used
   *
   */
  const handleSelect = (value: string) => {
    setSelected(value);
    onChange?.(value);
  };

  /**
   * handleAddImage - called whenever "Add an image" is clicked.
   * This triggers the (hidden) <input> referred to by
   * fileInputRef by "clicking" on it.
   */
  const handleAddImage = () => {
    fileInputRef.current?.click();
  };

  /**
   * handleFileChange - handle a programmatic "click"
   * to select a new file from the local file system,
   * then send that file to the server via /api/media POST
   * @param e
   * @returns
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    handleSelect(file.name); // and set the (new) default file
  };

  return (
    <div
      className="w-full h-full  border rounded bg-white-800 text-black"
      id="MediaDropdown"
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="relative w-full h-full border-grey-300 truncate rounded px-2 pr-0 py-1.5 text-left "
            id="filePicker"
          >
            <span className="truncate">{selected || "Select File"}</span>
            <svg
              className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          side="right"
          align="end"
          sideOffset={4}
          className="relative px-2 py-1 border border-grey-200 rounded-md bg-white shadow-xl p-2"
        >
          {files.map((file) => (
            <DropdownMenu.CheckboxItem
              key={file}
              checked={selected === file}
              onSelect={() => handleSelect(file)}
              className="DropdownMenuItem"
            >
              <DropdownMenu.ItemIndicator className="DropdownMenuItemIndicator px-4">
                •
              </DropdownMenu.ItemIndicator>
              {file}
            </DropdownMenu.CheckboxItem>
          ))}
          <DropdownMenu.Separator className="DropdownMenuSeparator" />
          <DropdownMenu.Item
            onSelect={handleAddImage}
            className="DropdownMenuItem"
          >
            <i>Upload an image...</i>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {error && <div className="text-red-600 mt-2">Error: {error}</div>}
    </div>
  );
}
