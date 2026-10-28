/**
 * redact.ts - remove secrets and identifying network details from text that
 * leaves this computer (bug reports, copied diagnostics).
 *
 * Pure functions, no Node APIs: used by the server (logger, diagnostics), the
 * browser (report dialog) and the MCP server.
 *
 * - The sudo password is always removed: every literal occurrence of a known
 *   secret, and any `echo <anything> | sudo -S` command line.
 * - The home folder is always shortened to `~` (it usually contains the
 *   user name).
 * - With `hideNetwork`, network names (SSIDs), MAC addresses (BSSIDs), IP
 *   addresses, host names and this computer's name are replaced by stable
 *   placeholders: the same value gets the same placeholder everywhere in one
 *   report (`<ssid-1>`, `<mac-1>`, `<ip-1>`, `<host-1>`), so a report still
 *   shows "the BSSID changed" without saying which one.
 */

export const PASSWORD_PLACEHOLDER = "<password>";

/** `echo pw | sudo -S`, `echo "pw" | sudo -S`, with any password. */
const SUDO_ECHO_RE = /echo\s+[^\n]*?\|\s*sudo\s+-S\b/g;

/** Hide the password in `echo <pw> | sudo -S <command>` command lines. */
export function hideSudoPassword(text: string): string {
  return text.replace(SUDO_ECHO_RE, `echo ${PASSWORD_PLACEHOLDER} | sudo -S`);
}

/** For tslog's maskValuesRegEx (masks strings logged to the console). */
export const SUDO_ECHO_MASK = SUDO_ECHO_RE;

export interface RedactOptions {
  /** Always removed (the sudo password). Values shorter than 3 are ignored. */
  secrets?: string[];
  /** Replace SSIDs, MAC and IP addresses and host names with placeholders. */
  hideNetwork: boolean;
  /** Network names known to be in the text (survey points, last scan). */
  ssids?: string[];
  /** BSSIDs known to be in the text, in any format. */
  bssids?: string[];
  /** Host names to hide (the iperf3 server); IP addresses are found anyway. */
  hosts?: string[];
  /** Shortened to "~" everywhere. */
  homeDir?: string;
  /** This computer's name, hidden with hideNetwork. */
  hostname?: string;
}

export type Redactor = (text: string) => string;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace every literal occurrence of each value, longest first. */
function replaceLiterals(
  text: string,
  values: Iterable<string>,
  placeholder: (value: string) => string,
): string {
  const list = [...new Set(values)].sort((a, b) => b.length - a.length);
  for (const value of list) {
    text = text.split(value).join(placeholder(value));
  }
  return text;
}

const isPlaceholder = (v: string) => /^<[^<>]*>$/.test(v.trim());

/** Values that mean "unknown" rather than a real network name. */
const NOT_AN_SSID = new Set(["", "<redacted>", "redacted", "unknown", "null"]);

// SSID after a label: `ssid: Name`, `SSID 1 : Name` (netsh), `"ssid":"Name"`.
const SSID_QUOTED_RE = /(\bssid\b["']?\s*[:=]\s*)"((?:[^"\\\n]|\\.)*)"/gi;
const SSID_BARE_RE =
  /(\bssid(?:\s+\d+)?\s*[:=][ \t]*)([^"'\s;,{}[\]][^\n;,"]*)/gi;

// MAC addresses: aa:bb:cc:dd:ee:ff, aa-bb-..., nmcli's aa\:bb\:..., and
// aabbccddeeff (only with at least one letter, so plain numbers survive).
// Not part of a longer run of octets (IPv6, 8-byte ids); nmcli puts them
// between plain colons ("*:AA\:BB\:...\:FF:Name").
const MAC_SEPARATED_RE =
  /(?<![\w-]|[0-9a-f]{2}(?::|\\:))[0-9a-f]{2}(?:(?::|-|\\:)[0-9a-f]{2}){5}(?![\w-]|(?::|\\:)[0-9a-f]{2}(?:[^0-9a-z]|$))/gi;
const MAC_PLAIN_RE = /(?<![\w-])(?=[0-9]*[a-f])[0-9a-f]{12}(?![\w-])/gi;

const IPV4_RE =
  /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\.?\d)/g;
const IPV4_ONLY_RE = new RegExp(`^${IPV4_RE.source}$`);
const IPV6_FULL_RE = /(?<![\w:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])/gi;
const IPV6_SHORT_RE =
  /(?<![\w:])(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?(?![\w:])/gi;

/** Loopback and "any" addresses say nothing about the user's network. */
function isHarmlessIp(ip: string): boolean {
  return (
    ip.startsWith("127.") ||
    ip === "0.0.0.0" ||
    ip.startsWith("255.") ||
    ip === "::1" ||
    ip === "::"
  );
}

const normalizeMac = (mac: string) =>
  mac.toLowerCase().replace(/[^0-9a-f]/g, "");

/** Strip a port from "host:port" (IPv4 or name, not IPv6). */
function hostOnly(host: string): string {
  const h = host.trim();
  const m = h.match(/^([^:]+):\d+$/);
  return m ? m[1] : h;
}

/**
 * createRedactor() - one redactor per report, so placeholders stay the same
 * across every piece of text it is applied to.
 */
export function createRedactor(options: RedactOptions): Redactor {
  const secrets = (options.secrets ?? []).filter((s) => s && s.length >= 3);
  const placeholders = {
    ssid: new Map<string, string>(),
    mac: new Map<string, string>(),
    ip: new Map<string, string>(),
    host: new Map<string, string>(),
  };
  const placeholder = (kind: keyof typeof placeholders, key: string) => {
    const map = placeholders[kind];
    let p = map.get(key);
    if (!p) {
      p = `<${kind}-${map.size + 1}>`;
      map.set(key, p);
    }
    return p;
  };

  const knownSsids = new Set(
    (options.ssids ?? []).filter((s) => !NOT_AN_SSID.has(s.trim())),
  );
  const knownMacs = new Set(
    (options.bssids ?? []).map(normalizeMac).filter((m) => m.length === 12),
  );
  const knownHosts = new Set(
    (options.hosts ?? [])
      .map(hostOnly)
      .filter(
        (h) =>
          h.length >= 3 &&
          h !== "localhost" &&
          !IPV4_ONLY_RE.test(h) &&
          !h.includes(":"),
      ),
  );

  return (input: string): string => {
    let text = input;

    // 1. the sudo password, always
    text = replaceLiterals(text, secrets, () => PASSWORD_PLACEHOLDER);
    text = hideSudoPassword(text);

    // 2. the home folder, always
    if (options.homeDir && options.homeDir.length > 1) {
      text = text.split(options.homeDir).join("~");
    }

    if (!options.hideNetwork) return text;

    // 3. this computer's name and known host names
    if (options.hostname && options.hostname.length >= 3) {
      text = text.split(options.hostname).join("<hostname>");
    }
    text = replaceLiterals(text, knownHosts, (h) => placeholder("host", h));

    // 4. network names: first learn the ones that follow an "SSID" label,
    // then replace those and the known ones everywhere
    const found = new Set(knownSsids);
    for (const re of [SSID_QUOTED_RE, SSID_BARE_RE]) {
      for (const m of text.matchAll(re)) {
        const v = m[2].trim();
        if (!NOT_AN_SSID.has(v) && !isPlaceholder(v)) found.add(v);
      }
    }
    const labelled = (prefix: string, value: string, quoted: boolean) => {
      const v = value.trim();
      if (NOT_AN_SSID.has(v) || isPlaceholder(v)) return null;
      const p = placeholder("ssid", v);
      return quoted ? `${prefix}"${p}"` : `${prefix}${value.replace(v, p)}`;
    };
    text = text.replace(
      SSID_QUOTED_RE,
      (all, prefix: string, value: string) =>
        labelled(prefix, value, true) ?? all,
    );
    text = text.replace(
      SSID_BARE_RE,
      (all, prefix: string, value: string) =>
        labelled(prefix, value, false) ?? all,
    );
    // short names ("AP") would replace ordinary words: only after a label
    text = replaceLiterals(
      text,
      [...found].filter((s) => s.length >= 3),
      (s) => placeholder("ssid", s),
    );

    // 5. MAC addresses (before IPv6: "aa:bb:cc:dd:ee:ff" looks like one)
    text = text.replace(MAC_SEPARATED_RE, (m) =>
      placeholder("mac", normalizeMac(m)),
    );
    text = text.replace(MAC_PLAIN_RE, (m) =>
      placeholder("mac", normalizeMac(m)),
    );
    for (const mac of knownMacs) {
      // any other spelling, e.g. upper case with dots
      const loose = new RegExp(
        mac.match(/../g)!.map(escapeRegExp).join("[^0-9a-f\\n]?"),
        "gi",
      );
      text = text.replace(loose, () => placeholder("mac", mac));
    }

    // 6. IP addresses
    const ip = (m: string) =>
      isHarmlessIp(m) ? m : placeholder("ip", m.toLowerCase());
    text = text.replace(IPV4_RE, ip);
    text = text.replace(IPV6_FULL_RE, ip);
    text = text.replace(IPV6_SHORT_RE, ip);

    return text;
  };
}
