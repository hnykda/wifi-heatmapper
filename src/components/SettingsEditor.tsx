"use client";
import { useSettings, DEFAULT_FLOORPLAN } from "@/components/GlobalSettings";
import { useAppStatus } from "@/hooks/useAppStatus";
import { useMacosHelper } from "@/hooks/useMacosHelper";
import { MacosHelperNotice } from "./MacosHelperNotice";
import { PasswordInput } from "./PasswordInput";
import { FormRow, FormSection } from "./FormRow";
import { SpeedSettings } from "./SpeedSettings";
import { toast } from "@/components/ui/use-toast";
import { DeleteFloorplanButton } from "./MediaDropdown";
import EditableApMapping from "./ApMapping";
import { CopySettingsDialog } from "./CopySettingsDialog";
import { UsageCountsSettings } from "./UsageCountsSettings";
import { ExportSurveyButton } from "./ExportSurveyButton";
import { sanitizeFilename } from "@/lib/utils";
import { AppStatus } from "@/lib/types";

export default function SettingsEditor() {
  const {
    settings,
    updateSettings,
    readNewSettingsFromFile,
    speedSettingsFrom,
  } = useSettings();
  const status = useAppStatus();

  // On macOS the native Wi-Fi helper, when built, replaces wdutil + sudo
  const macHelper = useMacosHelper(
    !!status && status.platform === "darwin" && !!status.macosHelper,
  );
  const helperWorks = !!macHelper.helper?.available;
  const helperPending =
    !!status?.macosHelper && status.platform === "darwin" && !macHelper.helper;

  // sudo is only needed where wdutil/iw require it
  // (mock mode: only when an e2e scenario asks for one)
  const needsSudo =
    !status ||
    (status.mockMode
      ? !!status.mockNeedsSudo
      : !status.docker &&
        status.platform !== "win32" &&
        !helperWorks &&
        !helperPending);

  const deleteFloorplan = async (name: string) => {
    const res = await fetch(`/api/media/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      toast({
        variant: "destructive",
        title: "Could not delete floor plan",
        description:
          (await res.json().catch(() => ({}))).error ?? res.statusText,
      });
      return;
    }
    await fetch(`/api/settings?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    toast({ title: "Floor plan deleted", description: name });
    readNewSettingsFromFile(DEFAULT_FLOORPLAN);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <FormSection
        title="Measurement"
        description="What happens when you click the floor plan. The signal is always measured; speed is optional and needs a second computer. Each survey keeps its own choice."
      >
        {speedSettingsFrom && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="speed-settings-copied"
          >
            Speed settings copied from {speedSettingsFrom}.
          </p>
        )}
        <SpeedSettings status={status} />

        {helperWorks && macHelper.helper && (
          <MacosHelperNotice
            helper={macHelper.helper}
            asking={macHelper.asking}
            error={macHelper.error}
            onAuthorize={macHelper.authorize}
            onRefresh={macHelper.refresh}
          />
        )}
        {status && !needsSudo && !helperWorks && !helperPending && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="sudo-not-needed"
          >
            No sudo password needed here:{" "}
            {status.mockMode
              ? status.desktopApp
                ? "mock mode makes up the measurements. Start the app without WIFI_HEATMAPPER_MOCK for real ones."
                : "mock mode makes up the measurements. Run `npm run dev` for real ones."
              : status.docker
                ? "the container already runs as root."
                : "Windows reads the signal without it."}
          </p>
        )}
        {needsSudo && (
          <FormRow
            id="sudoPassword"
            label="sudo password"
            help="macOS (wdutil) needs administrator rights to read the Wi-Fi signal. Linux (iw) usually doesn't. If a measurement needs it, the app asks for it then. The password is kept in memory only, until the app quits, and never written to disk. Measurements an AI agent starts use it too."
            hint={
              status?.platform === "darwin"
                ? macHelper.helper?.error
                  ? `Required: the Wi-Fi helper did not work (${macHelper.helper.error}). Not saved.`
                  : status.desktopApp
                    ? "Required: the app's Wi-Fi helper is missing, so the signal is read with wdutil. Not saved."
                    : "Required, unless you build the Wi-Fi helper (npm run build:macos-helper). Not saved."
                : "On Linux, only if a measurement asks for it. Not saved."
            }
          >
            <div className="max-w-sm">
              <PasswordInput
                id="sudoPassword"
                value={settings.sudoerPassword}
                onChange={(v) => updateSettings({ sudoerPassword: v })}
              />
            </div>
          </FormRow>
        )}
      </FormSection>

      <FormSection
        title="This survey"
        description="Each floor plan keeps its own survey. Pick or upload a floor plan at the top of the page."
      >
        <FormRow
          label="Survey file"
          hint="Points and settings of this floor plan. Download it to keep a copy or share it."
        >
          {settings.floorplanImageName ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <code
                className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                data-testid="survey-path"
              >
                {surveyPath(status, settings.floorplanImageName)}
              </code>
              <ExportSurveyButton
                floorplan={settings.floorplanImageName}
                variant="outline"
                testId="export-json-settings"
              >
                Download
              </ExportSurveyButton>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No floor plan yet.</p>
          )}
        </FormRow>
        <FormRow
          label="Settings from another survey"
          help="Copy the speed settings, access point names or heat map look of another floor plan's survey into this one. Points and the floor plan stay as they are."
        >
          <div>
            <CopySettingsDialog />
          </div>
        </FormRow>
        <FormRow
          label="Delete"
          hint="Removes the floor plan image and all its points."
        >
          <div>
            <DeleteFloorplanButton
              value={settings.floorplanImageName}
              pointCount={settings.surveyPoints.length}
              onDelete={deleteFloorplan}
            />
          </div>
        </FormRow>
      </FormSection>

      <h2
        className="border-b pb-3 pt-6 text-sm font-medium uppercase tracking-wide text-muted-foreground"
        data-testid="settings-advanced"
      >
        Advanced
      </h2>

      <FormSection
        title="Access point names"
        description="Optional. Name your access points by MAC address and the survey shows the name instead of the address."
      >
        <EditableApMapping
          apMapping={settings.apMapping}
          onSave={(apMapping) => updateSettings({ apMapping })}
        />
      </FormSection>

      <UsageCountsSettings />
    </div>
  );
}

/** Where the survey for this floor plan is saved, as the user's OS writes paths. */
function surveyPath(status: AppStatus | null, floorplan: string): string {
  const file = `${sanitizeFilename(floorplan)}.json`;
  if (!status) return `data/surveys/${file}`;
  const sep = status.platform === "win32" ? "\\" : "/";
  return [status.dataDir, "surveys", file].join(sep);
}
