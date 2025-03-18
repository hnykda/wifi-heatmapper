"use client";
import { useState, useEffect } from "react";
import * as Toast from "@radix-ui/react-toast";

export default function ClientComponent() {
  const [status, setStatus] = useState("Not startedX");
  const [toastOpen, setToastOpen] = useState(false);
  const [taskRunning, setTaskRunning] = useState(false);
  const [toastHeader, setToastHeader] = useState("Survey in progress");

  useEffect(() => {
    const eventSource = new EventSource("/api/events"); // issue GET to open connection to the SSE server

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data: { message: string } = JSON.parse(event.data);
        let statusStr = data.message;
        console.log(`received status update: ${data.message}`);
        if (statusStr.substring(0, 5) == "Done\n") {
          setToastHeader("Complete");
          statusStr = statusStr.slice(5);
          setTimeout(() => {
            setToastOpen(false); // ✅ Close the toast after 3 seconds
            setTaskRunning(false);
          }, 3000);
        }
        setStatus(statusStr);
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error: Event) => {
      console.error("SSE error:", error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const startTask = async () => {
    setTaskRunning(true);
    setToastOpen(true);
    setToastHeader("Survey in progress");
    console.log(`starting survey task`);
    await fetch("/api/start-task?action=start", { method: "POST" });
  };

  // const handleStart = async () => {
  //   setTaskRunning(true);
  //   setToastOpen(true);
  //   await startTask();
  // };

  const handleCancel = async () => {
    await fetch("/api/start-task?action=stop", { method: "POST" });
    setStatus("Task Canceled ❌");
    setTaskRunning(false);
    setTimeout(() => setToastOpen(false), 3000);
  };

  return (
    <Toast.Provider swipeDirection="right">
      <button
        onClick={startTask}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Start Task
      </button>

      <Toast.Root
        className="bg-gray-800 text-white p-4 rounded shadow-md flex justify-between items-center"
        open={toastOpen}
        onOpenChange={setToastOpen}
        duration={Infinity} // Keeps open until manually closed
      >
        <div>
          <Toast.Title className="font-bold">{toastHeader}</Toast.Title>
          {/* Convert \n into actual <br /> elements */}
          <Toast.Description className="text-sm text-gray-700 leading-relaxed">
            {status.split("\n").map((line, index) => (
              <span key={index}>
                {line}
                <br />
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
