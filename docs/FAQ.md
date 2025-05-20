# FAQ

1. **How can I create a floor plan for my home?**  
If you have one, upload an existing floor plan for your home.
Or just make a sketch on paper.
Use your phone or laptop to photograph the image, then upload it.

   Heat maps are inherently approximate, so the floor plan doesn't
   need to be perfect or "to scale".
   Just make it reasonably close, upload it, and
   start clicking on the **Floor Plan** tab.

2. **Why do I see `<redacted>` or `000000000000` or similar instead of a SSID or address?**  
Apple appears to have changed the security mechanism in macOS 15 and later.
Even with sudo access, the SSID and BSSID are no longer available.
It appears that a macOS application now needs Location Access
permissions to obtain this information.
See the notes below for more information.

## Notes

_NB: This section needs an editorial pass_

This tool relies on command line utilities that are able to get information about the system's wifi. The problem is that the major proprietary OS vendors like Mac or Windows are making this unnecessarily hard. For example, `wdutil` worked on MacOS 14, stopped working on 15.0-15.2 (SSID and BSSID started to show as `<redacted>` as if this is useful for anyone 🙄), and started working again on 15.3, to stop working on 15.3.1 🤷‍♂️. Apple has a terrible history on this, see e.g. this [Reddit thread](https://www.reddit.com/r/MacOS/comments/1bjjchk/rip_airport_cli_macos_sonoma_144_removes_the/). On Windows, `netsh` is language localized, so it is hard to parse reliably. There often are multiple ways how to get the information and I am sure we could have gazilion of fallbacks and strategies (effectively what we do), but again, this is time-consuming and very annoying. SSID might still be recoverable (see [Determining a Mac’s SSID (like an animal)](https://snelson.us/2024/09/determining-a-macs-ssid-like-an-animal/)), but not BSSID without more involvement, see my question on [Apple Forum here](https://discussions.apple.com/thread/256000297?cid=em-com-apple_watches_email_thread_owner-view_the_full_discussion-en-us-11282023&sortBy=rank)).

I have made an extensive search for any cross-platform libraries in JS or Python that would do this, but I haven't found any that would do what I need and be maintained and updated (somewhat understandably, as I said, this is pretty annoying). Additionally, a lot of these libs focus on manipulating connection, while we only need to read the information (so a slightly easier task, i.e. we don't need a heavy lib). Therefore, for the foreseeable future, this app is going to do low-level raw CLI commands, ideally built-ins, with as little privileges and configuration as possible.

Also, different platforms/versions of tools return different fields, which makes the unified output complicated. An example is Windows's `netsh` that doesn't return signal strength as `RSSI` but as `Signal Strength` instead. We try to be clever about it and use whichever is available and appropriate.



