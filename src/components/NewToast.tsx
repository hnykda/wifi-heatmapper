"use client";
import { useState, useEffect } from "react";
import * as Toast from "@radix-ui/react-toast";

interface NewToastProps {
  onClose: () => void;
  toastIsReady: () => void;
}
export default function NewToast({ onClose, toastIsReady }: NewToastProps) {
  const [toastHeader, setToastHeader] = useState("");
  const [toastStatus, setToastStatus] = useState("");
  const [taskRunning, setTaskRunning] = useState(true);

  useEffect(() => {
    const eventSource = new EventSource("/api/events"); // issue GET to open connection to the SSE server

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data: { status: string; type: string; header: string } =
          JSON.parse(event.data);

        if (data.type === "ready") {
          toastIsReady();
          return;
        }
        if (data.type === "update") {
          // just an update
          setToastHeader(data.header);
          setToastStatus(data.status);
        }

        if (data.type == "done") {
          // we're done (complete, error, canceled)
          setToastHeader(data.header);
          setToastStatus(data.status);
          eventSource.close();
          setTimeout(() => {
            setTaskRunning(false);
            onClose();
          }, 3000);
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error: Event) => {
      console.error("SSE error:", error);
      eventSource.close();
    };

    // Handle browser reload/unload
    const handleUnload = () => {
      eventSource.close(); // cleanly closes connection
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("unload", handleUnload);

    return () => {
      eventSource.close();
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("unload", handleUnload);
    };
  }, []);

  const handleCancel = async () => {
    // tell the server to stop doing work
    await fetch("/api/start-task?action=stop", { method: "POST" });
    setToastStatus("Task Canceled ❌");
    setToastHeader("Canceled");
    setTaskRunning(false);
    setTimeout(() => onClose(), 3000);
  };

  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Root
        className="fixed bottom-[10px] right-[5px] w-96 bg-gray-200 text-gray-800 p-4 rounded shadow-md flex justify-between items-center"
        duration={Infinity} // Keeps open until manually closed
      >
        <div>
          <Toast.Title className="font-bold">{toastHeader}</Toast.Title>
          {/* Convert \n into actual <br /> elements */}
          <Toast.Description className="text-sm text-gray-800 leading-relaxed">
            {toastStatus.split("\n").map((line, index) => (
              <span key={index}>
                <div>{line}</div>
              </span>
            ))}
          </Toast.Description>
        </div>
        {taskRunning && (
          <button
            onClick={handleCancel}
            className="bg-red-500 text-white px-2 py-1 rounded text-sm"
          >
            Cancel
          </button>
        )}
      </Toast.Root>

      <Toast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 w-64" />
    </Toast.Provider>
  );
}
