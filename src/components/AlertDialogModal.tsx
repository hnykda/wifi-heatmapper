import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Confirm before doing something you cannot undo.
 * Wrap the trigger button in it; `onConfirm` runs when the user agrees.
 */
export function AlertDialogModal({
  title,
  description,
  onConfirm,
  onCancel,
  children,
  disabled = false,
  confirmLabel = "Confirm",
  destructive = false,
}: {
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild disabled={disabled}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void onConfirm()}
            className={cn(
              destructive && buttonVariants({ variant: "destructive" }),
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
