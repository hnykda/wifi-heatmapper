// WiFi Heatmapper Helper - reads Wi-Fi details with CoreWLAN and prints JSON.
//
// Usage: WiFiHeatmapperHelper <info|scan|authorize|status> [options]
//
//   info        the current Wi-Fi interface (signal, noise, channel, SSID, ...)
//   scan        nearby networks (a fresh scan; --cached uses the last scan)
//   authorize   ask for Location permission (shows the system prompt once)
//               and wait for the answer (--timeout <seconds>, default 60)
//   status      only the Location permission state
//
// Every command prints exactly one JSON document on stdout and exits 0 when
// the command ran (even if, say, Location is not allowed). Exit code 2 means
// bad usage, 1 means CoreWLAN failed; the JSON then has an "error" field.
//
// Why a .app: CoreWLAN only returns SSIDs/BSSIDs to apps with Location
// permission, and that permission is granted per app bundle. locationd
// identifies us by the bundle containing this executable, even when started
// from Terminal or node. As a precaution the helper also re-launches itself
// with "responsibility disclaimed" (what launchd does for apps started from
// Finder), so nothing can charge the request to the parent process instead.
// See README.md for the experiments behind this.

import AppKit
import CoreLocation
import CoreWLAN
import Darwin
import Foundation

let helperVersion = 1
let disclaimedEnv = "WIFI_HEATMAPPER_HELPER_DISCLAIMED"

// MARK: - JSON output

func emit(_ object: [String: Any], exitCode: Int32 = 0) -> Never {
    var doc = object
    doc["helperVersion"] = helperVersion
    doc["bundleId"] = Bundle.main.bundleIdentifier ?? NSNull()
    let data = (try? JSONSerialization.data(
        withJSONObject: doc, options: [.prettyPrinted, .sortedKeys]))
        ?? Data("{\"error\":\"could not encode JSON\"}".utf8)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(exitCode)
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    emit(["error": message], exitCode: code)
}

func log(_ message: String) {
    if ProcessInfo.processInfo.environment["WIFI_HEATMAPPER_HELPER_DEBUG"] != nil {
        FileHandle.standardError.write(Data("[helper \(getpid())] \(message)\n".utf8))
    }
}

func orNull(_ value: Any?) -> Any { value ?? NSNull() }

/// CoreWLAN reports 0 for "not measured".
func nonZero(_ value: Int) -> Any { value == 0 ? NSNull() : value }

// MARK: - Re-launch with responsibility disclaimed

/// Spawns this same executable with `responsibility_spawnattrs_setdisclaim`
/// so that TCC (Location permission) treats this bundle, not the parent
/// (Terminal, node, the Tauri app...), as the responsible app. stdin/stdout/
/// stderr are inherited, so the child's JSON goes straight to our caller.
/// Returns nil if the private symbol is unavailable.
func runDisclaimed() -> Int32? {
    typealias SetDisclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
    guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), // RTLD_DEFAULT
                          "responsibility_spawnattrs_setdisclaim") else {
        log("responsibility_spawnattrs_setdisclaim not found")
        return nil
    }
    let setDisclaim = unsafeBitCast(sym, to: SetDisclaim.self)
    guard let exe = Bundle.main.executablePath else { return nil }

    var attr: posix_spawnattr_t?
    posix_spawnattr_init(&attr)
    defer { posix_spawnattr_destroy(&attr) }
    _ = setDisclaim(&attr, 1)

    var env = ProcessInfo.processInfo.environment
    env[disclaimedEnv] = "1"
    let envStrings = env.map { "\($0.key)=\($0.value)" }
    let args = [exe] + CommandLine.arguments.dropFirst()

    var cArgs = args.map { strdup($0) } + [nil]
    var cEnv = envStrings.map { strdup($0) } + [nil]
    defer {
        cArgs.forEach { free($0) }
        cEnv.forEach { free($0) }
    }

    var pid: pid_t = 0
    let rc = posix_spawn(&pid, exe, nil, &attr, &cArgs, &cEnv)
    if rc != 0 {
        log("posix_spawn failed: \(rc)")
        return nil
    }
    // If our caller kills us (timeout), take the child with us.
    for sig in [SIGTERM, SIGINT, SIGHUP] {
        signal(sig, SIG_IGN)
        let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
        src.setEventHandler { kill(pid, sig); exit(128 + sig) }
        src.resume()
        signalSources.append(src)
    }
    var status: Int32 = 0
    DispatchQueue.global().async {
        while waitpid(pid, &status, 0) == -1 && errno == EINTR {}
        DispatchQueue.main.async {
            // WIFEXITED / WEXITSTATUS by hand (macros aren't imported)
            if status & 0x7f == 0 { exit((status >> 8) & 0xff) }
            exit(128 + (status & 0x7f))
        }
    }
    dispatchMain()
}
var signalSources: [DispatchSourceSignal] = []

// MARK: - Location permission

func describe(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedAlways: return "authorized"
    // .authorizedWhenInUse is the same value as .authorizedAlways on macOS
    @unknown default: return "unknown(\(status.rawValue))"
    }
}

func isAuthorized(_ status: CLAuthorizationStatus) -> Bool {
    status == .authorizedAlways || status.rawValue == 4 /* whenInUse */
}

final class LocationWatcher: NSObject, CLLocationManagerDelegate {
    let manager = CLLocationManager()
    private(set) var status: CLAuthorizationStatus = .notDetermined
    private(set) var callbacks = 0

    override init() {
        super.init()
        manager.delegate = self
        status = manager.authorizationStatus
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        status = manager.authorizationStatus
        callbacks += 1
        log("authorization callback #\(callbacks): \(describe(status))")
    }

    /// Spin the run loop until `done` or the deadline passes.
    func wait(seconds: Double, until done: () -> Bool) {
        let deadline = Date().addingTimeInterval(seconds)
        while !done() && Date() < deadline {
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }
    }

    /// The first callback carries the real state; before it, the property
    /// can read .notDetermined even when permission was given.
    func settle() {
        wait(seconds: 1.5) { callbacks > 0 }
    }
}

func locationFields(_ watcher: LocationWatcher) -> [String: Any] {
    [
        "locationAuthorized": isAuthorized(watcher.status),
        "locationStatus": describe(watcher.status),
        "locationServicesEnabled": CLLocationManager.locationServicesEnabled(),
        "responsibilityDisclaimed": ProcessInfo.processInfo.environment[disclaimedEnv] == "1",
    ]
}

// MARK: - CoreWLAN mapping

func bandGHz(_ channel: CWChannel?) -> Any {
    switch channel?.channelBand.rawValue {
    case 1: return NSDecimalNumber(string: "2.4") // exact in JSON, unlike Double
    case 2: return 5
    case 3: return 6
    default: return NSNull()
    }
}

func widthMHz(_ channel: CWChannel?) -> Any {
    switch channel?.channelWidth.rawValue {
    case 1: return 20
    case 2: return 40
    case 3: return 80
    case 4: return 160
    case 5: return 320 // not in every SDK yet
    default: return NSNull()
    }
}

func phyModeName(_ mode: CWPHYMode) -> Any {
    switch mode.rawValue {
    case 1: return "802.11a"
    case 2: return "802.11b"
    case 3: return "802.11g"
    case 4: return "802.11n"
    case 5: return "802.11ac"
    case 6: return "802.11ax"
    case 7: return "802.11be"
    default: return NSNull()
    }
}

// Names match what wdutil / system_profiler print, so surveys stay comparable.
let securityNames: [(raw: Int, name: String)] = [
    (12, "WPA3 Enterprise"),
    (11, "WPA3 Personal"),
    (13, "WPA3 Transition"),
    (9, "WPA2 Enterprise"),
    (4, "WPA2 Personal"),
    (8, "WPA/WPA2 Enterprise"),
    (7, "WPA Enterprise"),
    (3, "WPA/WPA2 Personal"),
    (2, "WPA Personal"),
    (6, "Dynamic WEP"),
    (1, "WEP"),
    (14, "OWE"),
    (15, "OWE Transition"),
    (0, "None"),
]

func securityName(raw: Int) -> Any {
    securityNames.first { $0.raw == raw }?.name ?? NSNull()
}

/// CWNetwork has no single security value; report the strongest it supports.
func securityName(of network: CWNetwork) -> Any {
    for entry in securityNames {
        if let sec = CWSecurity(rawValue: entry.raw), network.supportsSecurity(sec) {
            return entry.name
        }
    }
    return NSNull()
}

func channelFields(_ channel: CWChannel?) -> [String: Any] {
    [
        "channel": orNull(channel?.channelNumber),
        "band": bandGHz(channel),
        "channelWidth": widthMHz(channel),
    ]
}

func interfaceInfo(_ iface: CWInterface) -> [String: Any] {
    var out: [String: Any] = [
        "name": orNull(iface.interfaceName),
        "powerOn": iface.powerOn(),
        "ssid": orNull(iface.ssid()),
        "bssid": orNull(iface.bssid()),
        "rssi": iface.rssiValue(),
        "noise": nonZero(iface.noiseMeasurement()),
        "txRate": iface.transmitRate(),
        "phyMode": phyModeName(iface.activePHYMode()),
        "security": securityName(raw: iface.security().rawValue),
        "countryCode": orNull(iface.countryCode()),
    ]
    out.merge(channelFields(iface.wlanChannel())) { $1 }
    // associated = has a channel and a non-zero RSSI
    out["associated"] = iface.wlanChannel() != nil && iface.rssiValue() != 0
    return out
}

func networkInfo(_ net: CWNetwork) -> [String: Any] {
    var out: [String: Any] = [
        "ssid": orNull(net.ssid),
        "bssid": orNull(net.bssid),
        "rssi": net.rssiValue,
        "noise": nonZero(net.noiseMeasurement),
        "security": securityName(of: net),
        "countryCode": orNull(net.countryCode),
        "beaconInterval": net.beaconInterval,
    ]
    out.merge(channelFields(net.wlanChannel)) { $1 }
    return out
}

func wifiInterface() -> CWInterface {
    guard let iface = CWWiFiClient.shared().interface() else {
        fail("No Wi-Fi interface found")
    }
    return iface
}

// MARK: - Commands

func usage() -> Never {
    FileHandle.standardError.write(Data("""
    usage: WiFiHeatmapperHelper <info|scan|authorize|status> [--cached] [--timeout <s>] [--open-settings] [--no-disclaim]

    """.utf8))
    fail("usage: info | scan | authorize | status", code: 2)
}

var args = Array(CommandLine.arguments.dropFirst())
// Launched by `open` (LaunchServices) we may get -psn_... style args; drop them.
args.removeAll { $0.hasPrefix("-psn_") }
let command = args.first(where: { !$0.hasPrefix("-") }) ?? ""
let noDisclaim = args.contains("--no-disclaim")
    || ProcessInfo.processInfo.environment["WIFI_HEATMAPPER_HELPER_NO_DISCLAIM"] == "1"

func optionValue(_ name: String) -> String? {
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}

guard ["info", "scan", "authorize", "status"].contains(command) else { usage() }

// Re-launch ourselves as our own responsible process (see header comment).
if !noDisclaim && ProcessInfo.processInfo.environment[disclaimedEnv] == nil {
    if let code = runDisclaimed() { exit(code) }
    log("running without disclaim")
}

// Safety net: never hang the caller.
let timeout = Double(optionValue("--timeout") ?? "") ?? 60
let watchdogSeconds = command == "authorize" ? timeout + 10 : 30
DispatchQueue.global().asyncAfter(deadline: .now() + watchdogSeconds) {
    fail("Timed out after \(Int(watchdogSeconds)) seconds")
}

let location = LocationWatcher()
location.settle()

switch command {
case "status":
    emit(locationFields(location))

case "info":
    var doc = locationFields(location)
    doc["interface"] = interfaceInfo(wifiInterface())
    emit(doc)

case "scan":
    let iface = wifiInterface()
    var doc = locationFields(location)
    do {
        let networks: Set<CWNetwork>
        if args.contains("--cached"), let cached = iface.cachedScanResults(), !cached.isEmpty {
            networks = cached
        } else {
            networks = try iface.scanForNetworks(withName: nil)
        }
        doc["networks"] = networks
            .sorted { $0.rssiValue > $1.rssiValue }
            .map(networkInfo)
    } catch {
        fail("Scan failed: \(error.localizedDescription)")
    }
    doc["interface"] = interfaceInfo(iface)
    emit(doc)

case "authorize":
    // The prompt is shown for the app that asks, so behave like a (Dock-less) app.
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    var doc: [String: Any] = ["statusBefore": describe(location.status)]
    if location.status == .notDetermined {
        app.activate(ignoringOtherApps: true)
        location.manager.requestWhenInUseAuthorization()
        // A location request also triggers the prompt on versions where
        // requestWhenInUseAuthorization alone does not.
        location.manager.startUpdatingLocation()
        location.wait(seconds: timeout) { location.status != .notDetermined }
        location.manager.stopUpdatingLocation()
        doc["prompted"] = true
    } else {
        doc["prompted"] = false
    }
    // macOS asks only once. If access was refused before this request, the
    // only way to change it is System Settings, so open it there.
    let refusedBefore = doc["statusBefore"] as? String == "denied"
    if refusedBefore && !isAuthorized(location.status) && args.contains("--open-settings") {
        NSWorkspace.shared.open(URL(string:
            "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices")!)
        doc["openedSettings"] = true
    }
    doc.merge(locationFields(location)) { $1 }
    emit(doc)

default:
    usage()
}
