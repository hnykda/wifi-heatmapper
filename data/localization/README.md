# About the localization files

Windows has localized its `wlan net show interfaces` command.
This makes it easier for native speakers to read,
but harder to parse automatically.
Fortunately, there are only a handful of keywords we need
to retrieve from the output.

These JSON files contain the "canonical" fields as properties,
with the localized string that is used as a label.

To create another language file, duplicate one of these,
view the output of the `wlan net show interfaces` command,
and create your own.
Save it to the _data/localization_ folder and restart the
wifi-heatmapper server.

## How it works

At startup, wifi-heatmapper creates a _localizer_ object
whose properties are the localized phrases from the `netsh ...`
output, and whose values are the internal name.
For example, `{ "Velocidad de transmisión (Mbps)": "_txRate_"}`

Each line from a `netsh ...` command is broken into a
"label" and "value", the label is looked
up in the localizer object to produce the "key".
If the key is present, use the value as the internal name.

## Notes on these files

* Comments not allowed in .json files
* No trailing comma is allowed on the last line
* There is no need to create any of the following fields:
  * "rssi" is computed from signalStrength (%)
  * "band" is 2.4 or 5, and computed from channel
  * "channelWidth" is not returned in Windows
