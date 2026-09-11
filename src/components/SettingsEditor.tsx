"use client";
import { RotateCcw } from "lucide-react";
import { useSettings, DEFAULT_FLOORPLAN } from "@/components/GlobalSettings";
import { useAppStatus } from "@/hooks/useAppStatus";
import { PasswordInput } from "./PasswordInput";
import { FormRow, FormSection } from "./FormRow";
import { NumberField } from "./NumberField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import FloorplanPicker from "./MediaDropdown";
import { GradientEditor } from "./GradientEditor";
import EditableApMapping from "./ApMapping";
import { sanitizeFilename } from "@/lib/utils";
import { defaultIperfCommands } from "@/lib/iperfUtils";
import { IperfCommands } from "@/lib/types";

const IPERF_HELP =
  "Placeholders: {server}, {port} and {duration} are filled in from the settings above. See https://iperf.fr/iperf-doc.php for the options.";
const UDP_HELP =
  "-b 100M caps UDP tests at 100 Mbps, which is safe on most networks. If your UDP results sit at exactly 100 Mbps, raise it (for example -b 500M).";

export default function SettingsEditor() {
  const { settings, updateSettings, readNewSettingsFromFile } = useSettings();
  const status = useAppStatus();

  // sudo is only needed where wdutil/iw require it
  const needsSudo =
    !status ||
    (!status.mockMode && !status.docker && status.platform !== "win32");

  const iperfOff = settings.iperfServerAdrs === "localhost";

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

  const setCommand = (key: keyof IperfCommands, value: string) =>
    updateSettings({
      iperfCommands: { ...settings.iperfCommands, [key]: value },
    });

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
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  data/surveys/{sanitizeFilename(settings.floorplanImageName)}
                  .json
                </code>
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
      </FormSection>

      <FormSection
        title="Measurement"
        description="What happens when you click the floor plan. Signal strength is always measured; throughput needs an iperf3 server."
      >
        <FormRow
          id="iperfServer"
          label="iperf3 server"
          help="Address of a computer running `iperf3 -s`, e.g. 192.168.1.10 or 192.168.1.10:5201. Leave it at localhost to measure signal strength only."
          hint={
            iperfOff
              ? "Throughput tests are off. Only signal strength is measured."
              : status && !status.iperf3Version && !status.mockMode
                ? "iperf3 is not installed on this computer, so throughput tests will fail. Install it or set the server to localhost."
                : undefined
          }
        >
          <Input
            id="iperfServer"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="localhost"
            className="max-w-sm"
            value={settings.iperfServerAdrs}
            onChange={(e) =>
              updateSettings({ iperfServerAdrs: e.target.value.trim() })
            }
          />
        </FormRow>

        <FormRow
          id="testDuration"
          label="Test duration (seconds)"
          help="How long each of the four iperf3 tests runs. One second is enough for a survey; longer tests give steadier numbers."
        >
          <NumberField
            id="testDuration"
            min={1}
            max={60}
            step={1}
            className="max-w-[8rem]"
            value={settings.testDuration}
            onChange={(n) => updateSettings({ testDuration: Math.round(n) })}
          />
        </FormRow>

        {status && !needsSudo && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="sudo-not-needed"
          >
            No sudo password needed here:{" "}
            {status.mockMode
              ? "mock mode makes up the measurements. Run `npm run dev` for real ones."
              : status.docker
                ? "the container already runs as root."
                : "Windows reads the signal without it."}
          </p>
        )}
        {needsSudo && (
          <FormRow
            id="sudoPassword"
            label="sudo password"
            help="macOS (wdutil) and Linux (iw) need administrator rights to read the Wi-Fi signal. The password is kept in memory only and never written to disk."
            hint="Required on macOS and Linux. Not saved."
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
        description="Optional. Name your access points by MAC address (BSSID) and the survey shows the name instead of the address."
      >
        <EditableApMapping
          apMapping={settings.apMapping}
          onSave={(apMapping) => updateSettings({ apMapping })}
        />
      </FormSection>

      <FormSection
        title="Heat map colours"
        description="Green is good. The scale runs from 0% (no signal, -100 dBm) to 100% (-40 dBm). Throughput maps reuse the same colours across their own range."
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

      <FormSection
        title="iperf3 commands"
        description="Advanced. The exact commands run for each throughput test."
      >
        {(
          [
            ["tcpDownload", "TCP download", IPERF_HELP],
            ["tcpUpload", "TCP upload", IPERF_HELP],
            ["udpDownload", "UDP download", UDP_HELP],
            ["udpUpload", "UDP upload", UDP_HELP],
          ] as [keyof IperfCommands, string, string][]
        ).map(([key, label, help]) => (
          <FormRow key={key} id={`cmd-${key}`} label={label} help={help}>
            <Input
              id={`cmd-${key}`}
              type="text"
              spellCheck={false}
              className="font-mono text-xs"
              value={settings.iperfCommands?.[key] ?? ""}
              onChange={(e) => setCommand(key, e.target.value)}
            />
          </FormRow>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            updateSettings({ iperfCommands: { ...defaultIperfCommands } })
          }
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset commands to defaults
        </Button>
      </FormSection>
    </div>
  );
}
