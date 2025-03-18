"use client";
import { useState, useEffect } from "react";
import * as Toast from "@radix-ui/react-toast";
import { cancelTask } from "../lib/actions";
// import { WebSocket } from "ws";

export default function ClientComponent() {
  const [status, setStatus] = useState("Not startedX");
  const [toastOpen, setToastOpen] = useState(false);
  const [taskRunning, setTaskRunning] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource("/api/events"); // issue GET to open connection to the SSE server

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data: { message: string } = JSON.parse(event.data);
        console.log(`received status update: ${data.message}`);
        setStatus(data.message);
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
    console.log(`starting survey task`);
    await fetch("/api/start-task", { method: "POST" });
  };

  // const handleStart = async () => {
  //   setTaskRunning(true);
  //   setToastOpen(true);
  //   await startTask();
  // };

  const handleCancel = async () => {
    await cancelTask(); // Tell the server to stop the task
    setStatus("Task Canceled ❌");
    setTaskRunning(false);
    setTimeout(() => setToastOpen(false), 1000);
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
          <Toast.Title className="font-bold">Task Progress</Toast.Title>
          <Toast.Description className="text-sm">{status}</Toast.Description>
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
