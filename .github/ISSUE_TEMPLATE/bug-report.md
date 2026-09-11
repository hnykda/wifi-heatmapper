---
name: Bug Report
about: Something does not work as expected
title: ''
labels: bug
assignees: ''

---

## What happened

<!-- What did you do, what did you expect, what happened instead? -->

## Screenshots

## Environment

Open the About dialog (the "i" button in the header) and paste its contents
here, or copy the "System Information" block the server prints at start-up:

* wifi-heatmapper version:
* Operating system:
* Node version:
* iperf3 version:
* Docker: yes / no
* Browser:

## Log

Run the app with debug logging and attach the log (or a
[gist](https://gist.github.com/) link):

```bash
LOG_LEVEL=2 npm run dev | tee out.log
```

On Windows: `set LOG_LEVEL=2` then `npm run dev`.
