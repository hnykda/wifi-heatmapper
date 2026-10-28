"use client";
import { useEffect, useState } from "react";
import {
  Cable,
  Check,
  CircleHelp,
  Loader2,
  PlugZap,
  RotateCcw,
  X,
} from "lucide-react";
import { useSettings } from "@/components/GlobalSettings";
import { FormRow } from "./FormRow";
import { NumberField } from "./NumberField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  defaultIperfCommands,
  formatArgs,
  iperfArgsProblem,
  iperfFixedPart,
  IperfTest,
  splitArgs,
} from "@/lib/iperfUtils";
import { parseServerAddress } from "@/lib/measurement-mode";
import { cn } from "@/lib/utils";
import { AppStatus } from "@/lib/types";

const IPERF_HELP =
  "Extra iperf3 options for this test, separated by spaces, for example -P 4 for four parallel streams. The server, port and duration come from the settings above. See https://iperf.fr/iperf-doc.php for the options.";
const UDP_HELP =
  "-b 100M caps the fixed-rate (UDP) tests at 100 Mbps, which is safe on most networks. If your UDP results sit at exactly 100 Mbps, raise it (for example -b 500M).";

type ConnectionCheck = {
  iperf3: string | null;
  reachable: boolean;
  reason: string;
};

/** How to install iperf3 on the computer the app runs on. */
function installHint(status: AppStatus): string {
  if (status.docker || status.podman) return "Rebuild the container image.";
  switch (status.platform) {
    case "darwin":
      return "Install it with Homebrew: brew install iperf3.";
    case "win32":
      return "Install it so it is on your PATH, for example scoop install iperf3, choco install iperf3 or winget.";
    default:
      return "Install it with your package manager, for example sudo apt install iperf3.";
  }
}

/**
 * "What to measure" and, for speed, the server, test length, a setup
 * checklist and the iperf3 commands. Part of the Measurement section of
 * Settings.
 */
export function SpeedSettings({ status }: { status: AppStatus | null }) {
  const { settings, updateSettings } = useSettings();
  const speed = settings.measureSpeed;
  const [check, setCheck] = useState<ConnectionCheck | null>(null);
  const [checking, setChecking] = useState(false);

  // a result belongs to the address it was made for
  useEffect(() => setCheck(null), [settings.iperfServerAdrs]);

  const testConnection = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/speed-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: settings.iperfServerAdrs }),
      });
      setCheck(
        res.ok
          ? await res.json()
          : {
              iperf3: status?.iperf3Version ?? null,
              reachable: false,
              reason: `The app answered ${res.status}.`,
            },
      );
    } catch (err) {
      setCheck({
        iperf3: status?.iperf3Version ?? null,
        reachable: false,
        reason: String(err),
      });
    } finally {
      setChecking(false);
    }
  };

  const setOptions = (key: IperfTest, value: string[]) =>
    updateSettings({
      iperfCommands: { ...settings.iperfCommands, [key]: value },
    });

  const address = settings.iperfServerAdrs;
  const parsed = parseServerAddress(address);
  const iperf3 = check ? check.iperf3 : (status?.iperf3Version ?? null);
  const isLocal =
    !!parsed && /^(localhost|127\.|::1$)/i.test(parsed.host.toLowerCase());

  return (
    <>
      <div
        role="radiogroup"
        aria-labelledby="measure-mode-label"
        className="grid gap-1.5"
      >
        <span id="measure-mode-label" className="text-sm font-medium">
          What to measure
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          <ModeOption
            id="measure-mode-signal"
            checked={!speed}
            onSelect={() => updateSettings({ measureSpeed: false })}
            title="Signal only"
            body="Nothing to set up. About 2 seconds per spot. Shows where the signal is weak."
          />
          <ModeOption
            id="measure-mode-speed"
            checked={speed}
            onSelect={() => updateSettings({ measureSpeed: true })}
            title="Signal and speed"
            body="Needs iperf3 here and on a second computer, wired to the router. About 6 to 10 seconds per spot. Shows the speed you actually get."
          />
        </div>
      </div>

      {speed && (
        <>
          <FormRow
            id="iperfServer"
            label="Speed test server (uses iperf3)"
            help="The address of a second computer on your network that runs `iperf3 -s`, e.g. 192.168.1.10, 192.168.1.10:5201, nas.local or [fe80::1]:5201. The port defaults to 5201."
            hint={
              !address
                ? "Enter the address of the computer that runs iperf3 -s."
                : !parsed
                  ? "This doesn't look like an address. Use a host name or IP address, optionally followed by :port."
                  : isLocal
                    ? "This is this computer: the test would not go over Wi-Fi. Use another computer on your network."
                    : undefined
            }
          >
            <div className="flex max-w-xl flex-wrap items-center gap-2">
              <Input
                id="iperfServer"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="192.168.1.10"
                className="max-w-sm"
                value={address}
                onChange={(e) =>
                  updateSettings({ iperfServerAdrs: e.target.value.trim() })
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={!parsed || checking}
                data-testid="speed-test-connection"
              >
                {checking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlugZap className="h-3.5 w-3.5" />
                )}
                Test connection
              </Button>
            </div>
          </FormRow>

          <ul
            className="grid max-w-xl gap-2 rounded-md border bg-surface p-3 text-sm"
            aria-label="Speed setup"
            data-testid="speed-checklist"
          >
            <ChecklistItem
              state={
                status?.mockMode
                  ? "ok"
                  : !status
                    ? "unknown"
                    : iperf3
                      ? "ok"
                      : "bad"
              }
              testid="check-iperf3"
              title="iperf3 installed on this computer"
              detail={
                status?.mockMode
                  ? "Mock mode makes up the speed results."
                  : !status
                    ? "Checking."
                    : iperf3
                      ? iperf3
                      : `Not found, so speed tests are skipped. ${installHint(status)}`
              }
            />
            <ChecklistItem
              state={!check ? "unknown" : check.reachable ? "ok" : "bad"}
              testid="check-server"
              title="Speed test server answers"
              detail={
                !check
                  ? "Click Test connection to check."
                  : check.reachable
                    ? `${address} accepted the connection.`
                    : check.reason
              }
            />
            <ChecklistItem
              state="advice"
              testid="check-wired"
              title="Server wired to the router"
              detail="Connect the server with a cable. Over Wi-Fi it shares the air with this laptop, and the result is roughly halved."
            />
          </ul>

          <FormRow
            id="testDuration"
            label="Test duration (seconds)"
            help="Each spot runs four short tests: download and upload, once at full speed (TCP) and once at a fixed rate (UDP, for jitter and lost packets). One second each is enough for a survey; longer tests give steadier numbers."
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

          <Accordion type="single" collapsible className="max-w-xl">
            <AccordionItem value="commands" className="border-b-0">
              <AccordionTrigger
                className="py-1 text-sm font-medium"
                data-testid="iperf-commands-toggle"
              >
                Advanced: iperf3 options
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-3">
                <p className="text-sm text-muted-foreground">
                  Extra options added to the iperf3 command of each test. The
                  fixed-rate (UDP) tests are capped at 100 Mbps by{" "}
                  <code className="font-mono text-xs">-b 100M</code>.
                </p>
                {(
                  [
                    ["tcpDownload", "Download (TCP)", IPERF_HELP],
                    ["tcpUpload", "Upload (TCP)", IPERF_HELP],
                    ["udpDownload", "Fixed-rate download (UDP)", UDP_HELP],
                    ["udpUpload", "Fixed-rate upload (UDP)", UDP_HELP],
                  ] as [IperfTest, string, string][]
                ).map(([key, label, help]) => (
                  <IperfOptionsField
                    key={key}
                    test={key}
                    label={label}
                    help={help}
                    value={
                      settings.iperfCommands?.[key] ?? defaultIperfCommands[key]
                    }
                    onChange={(args) => setOptions(key, args)}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateSettings({
                      iperfCommands: { ...defaultIperfCommands },
                    })
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset options to defaults
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </>
  );
}

const sameArgs = (a: readonly string[] | null, b: readonly string[]) =>
  !!a && a.length === b.length && a.every((arg, i) => arg === b[i]);

/**
 * The extra options of one test, typed as text. What is typed stays as
 * typed; it is saved whenever it reads as valid options.
 */
function IperfOptionsField({
  test,
  label,
  help,
  value,
  onChange,
}: {
  test: IperfTest;
  label: string;
  help: string;
  value: readonly string[];
  onChange: (args: string[]) => void;
}) {
  const [draft, setDraft] = useState(() => formatArgs(value));
  const [error, setError] = useState("");
  // the saved options changed elsewhere (reset, another tab): show them
  const [shown, setShown] = useState(value);
  if (!sameArgs(shown, value)) {
    setShown(value);
    if (!sameArgs(splitArgs(draft), value)) {
      setDraft(formatArgs(value));
      setError("");
    }
  }

  const change = (text: string) => {
    setDraft(text);
    const args = splitArgs(text);
    if (!args) return setError("A quote is not closed.");
    const problem = iperfArgsProblem(args);
    if (problem) return setError(`This ${problem}.`);
    setError("");
    if (!sameArgs(args, value)) onChange(args);
  };

  const fixed = iperfFixedPart(test);
  const id = `cmd-${test}`;
  return (
    <FormRow
      id={id}
      label={label}
      help={help}
      hint={
        error ? (
          <span
            className="text-destructive"
            role="alert"
            data-testid={`iperf-options-error-${test}`}
          >
            {error} Not saved.
          </span>
        ) : (
          <span className="font-mono">
            Runs: {fixed.before}{" "}
            {draft.trim() && (
              <span className="text-foreground">{draft.trim()} </span>
            )}
            {fixed.after}
          </span>
        )
      }
    >
      <Input
        id={id}
        type="text"
        spellCheck={false}
        className="font-mono text-xs"
        placeholder="No extra options"
        aria-invalid={!!error}
        value={draft}
        onChange={(e) => change(e.target.value)}
      />
    </FormRow>
  );
}

function ModeOption({
  id,
  checked,
  onSelect,
  title,
  body,
}: {
  id: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors",
        "hover:border-brand/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-brand bg-brand-soft/60" : "bg-surface",
      )}
      data-testid={id}
      data-state={checked ? "checked" : "unchecked"}
    >
      <input
        id={id}
        type="radio"
        name="measure-mode"
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand dark:[color-scheme:dark]"
        checked={checked}
        onChange={onSelect}
      />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{body}</span>
      </span>
    </label>
  );
}

function ChecklistItem({
  state,
  title,
  detail,
  testid,
}: {
  state: "ok" | "bad" | "unknown" | "advice";
  title: string;
  detail: string;
  testid: string;
}) {
  const Icon =
    state === "ok"
      ? Check
      : state === "bad"
        ? X
        : state === "advice"
          ? Cable
          : CircleHelp;
  return (
    <li className="flex gap-2.5" data-testid={testid} data-state={state}>
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          state === "ok" && "text-success",
          state === "bad" && "text-destructive",
          (state === "unknown" || state === "advice") &&
            "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span className="grid min-w-0 gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="break-words text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
    </li>
  );
}
