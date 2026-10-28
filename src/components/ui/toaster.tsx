"use client";

import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { openReport } from "@/components/help/report-store";

/** Error toasts offer "Report this", with their text in the report. */
function reportText(title: unknown, description: unknown): string {
  return [title, description]
    .filter((t): t is string => typeof t === "string" && t !== "")
    .join(": ");
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const report =
          !action && props.variant === "destructive" ? (
            <ToastAction
              altText="Report this problem"
              onClick={() => openReport(reportText(title, description))}
              data-testid="toast-report"
            >
              Report this
            </ToastAction>
          ) : null;
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action ?? report}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
