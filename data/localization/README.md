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

At startup, wifi-heatmapper creates a reverse lookup
table for the localized strings.
When it reads the output of the command,
it checks each label for a match in the table.
If there's a match, we use the result as the property
and the command's value for the value.

## Notes on these files

* Comments not allowed in .json files
* No trailing comma is allowed on the last line
* There is no need to create any of the following fields:
  * "rssi" is computed from signalStrenth (%)
  * "band" is 2.4 or 5, and computed from channel
  * "channelWidth" is not returned in Windows
