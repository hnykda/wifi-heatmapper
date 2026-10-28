"use client";
import { useSettings, DEFAULT_FLOORPLAN } from "@/components/GlobalSettings";
import { useAppStatus } from "@/hooks/useAppStatus";
import { useMacosHelper } from "@/hooks/useMacosHelper";
import { MacosHelperNotice } from "./MacosHelperNotice";
import { PasswordInput } from "./PasswordInput";
import { FormRow, FormSection } from "./FormRow";
import { NumberField } from "./NumberField";
import { SpeedSettings } from "./SpeedSettings";
import { toast } from "@/components/ui/use-toast";
import FloorplanPicker from "./MediaDropdown";
import { GradientEditor } from "./GradientEditor";
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
        title="Floor plan"
        description="The image you click on to place measurements. Each floor plan keeps its own survey."
      >
        <FormRow
          label="Current floor plan"
          help="Pick an image, or upload a PNG, JPEG or WebP. A photo of a sketch works fine: heat maps are approximate by nature."
          hint={
            settings.floorplanImageName && (
              <>
                Survey saved as{" "}
                <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {surveyPath(status, settings.floorplanImageName)}
                </code>{" "}
                <ExportSurveyButton
                  floorplan={settings.floorplanImageName}
                  variant="link"
                  testId="export-json-settings"
                  className="h-auto p-0 text-[11px]"
                >
                  Download
                </ExportSurveyButton>
              </>
            )
          }
        >
          <FloorplanPicker
            value={settings.floorplanImageName}
            pointCount={settings.surveyPoints.length}
            onChange={readNewSettingsFromFile}
            onDelete={deleteFloorplan}
          />
        </FormRow>
        <FormRow
          label="Settings from another survey"
          help="Copy the speed settings, access point names or heat map look of another floor plan's survey into this one. Points and the floor plan stay as they are."
        >
          <div>
            <CopySettingsDialog />
          </div>
        </FormRow>
      </FormSection>

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
            help="macOS (wdutil) needs administrator rights to read the Wi-Fi signal. Linux (iw) usually doesn't; the survey asks for the password if it does. The password is kept in memory only, until the app quits, and never written to disk. Measurements an AI agent starts use it too."
            hint={
              status?.platform === "darwin"
                ? macHelper.helper?.error
                  ? `Required: the Wi-Fi helper did not work (${macHelper.helper.error}). Not saved.`
                  : status.desktopApp
                    ? "Required: the app's Wi-Fi helper is missing, so the signal is read with wdutil. Not saved."
                    : "Required, unless you build the Wi-Fi helper (npm run build:macos-helper). Not saved."
                : "On Linux, only if the survey asks for it. Not saved."
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
        title="Access point names"
        description="Optional. Name your access points by MAC address and the survey shows the name instead of the address."
      >
        <EditableApMapping
          apMapping={settings.apMapping}
          onSave={(apMapping) => updateSettings({ apMapping })}
        />
      </FormSection>

      <FormSection
        title="Heat map colours"
        description="Green is good. The scale runs from 0% (no signal, -100 dBm) to 100% (-40 dBm). Speed maps reuse the same colours across their own range, or a fixed one set on the Heat maps tab."
      >
        <FormRow label="Colour stops">
          <GradientEditor
            gradient={settings.gradient}
            onChange={(gradient) => updateSettings({ gradient })}
          />
        </FormRow>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormRow
            id="maxOpacity"
            label="Opacity at strongest"
            help="How much the heat map covers the floor plan where the signal is strongest. 0 is invisible, 1 is solid."
          >
            <NumberField
              id="maxOpacity"
              min={0}
              max={1}
              step={0.1}
              value={settings.maxOpacity}
              onChange={(n) => updateSettings({ maxOpacity: n })}
            />
          </FormRow>
          <FormRow
            id="minOpacity"
            label="Opacity at weakest"
            help="Opacity where the signal is weakest."
          >
            <NumberField
              id="minOpacity"
              min={0}
              max={1}
              step={0.1}
              value={settings.minOpacity}
              onChange={(n) => updateSettings({ minOpacity: n })}
            />
          </FormRow>
        </div>
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
