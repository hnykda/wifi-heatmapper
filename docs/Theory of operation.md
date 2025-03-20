# Theory of operation

`wifi-heatmapper` is a Next.js app that uses to a local backend server
to measure both Wi-Fi signal strength and
(optionally) TCP and UDP speeds to an `iperf3` server
at various locations.
It produces a heat map for each set of
measurement points ("surveyPoints")
that show where signal/throughput are high and low.

## Internals

The file structure (using `tree --gitignore`) is:

```
├── LICENSE
├── README.md
├── To-Do.md
├── __tests__
│   └── parsing
│       ├── linux.test.tsx
│       ├── mac.test.tsx
│       └── windows.test.tsx
├── components.json
├── eslint.config.js
├── next.config.mjs
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── public
│   └── favicon.ico
├── src
│   ├── app
│   │   ├── api
│   │   │   ├── events
│   │   │   │   └── route.ts
│   │   │   ├── socket
│   │   │   │   └── route.ts
│   │   │   └── start-task
│   │   │       └── route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── old-page.tsx
│   │   └── page.tsx
│   ├── components
│   │   ├── AlertDialogModal.tsx
│   │   ├── ApMapping.tsx
│   │   ├── EditableField.tsx
│   │   ├── Floorplan-old.tsx
│   │   ├── Floorplan.tsx
│   │   ├── GlobalSettings.tsx
│   │   ├── HeatmapAdvancedConfig.tsx
│   │   ├── Heatmaps.tsx
│   │   ├── Loader.tsx
│   │   ├── NewToast.tsx
│   │   ├── PointsTable.tsx
│   │   ├── PopoverHelpText.tsx
│   │   ├── PopupDetails.tsx
│   │   ├── SettingsEditor.tsx
│   │   ├── SettingsViewer.tsx
│   │   ├── TabPanel.tsx
│   │   └── ui
│   │       ├── accordion.tsx
│   │       ├── alert-dialog.tsx
│   │       ├── alert.tsx
│   │       ├── button.tsx
│   │       ├── checkbox.tsx
│   │       ├── dialog.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── popover.tsx
│   │       ├── switch.tsx
│   │       ├── table.tsx
│   │       ├── textarea.tsx
│   │       ├── toast.tsx
│   │       ├── toaster.tsx
│   │       ├── toggle.tsx
│   │       └── use-toast.ts
│   └── lib
│       ├── actions.ts
│       ├── database.ts
│       ├── fileHandler.ts
│       ├── iperfRunner.ts
│       ├── radius.ts
│       ├── server-utils.ts
│       ├── types.ts
│       ├── utils.ts
│       └── wifiScanner.ts
├── tailwind.config.ts
├── tsconfig.json
└── various
    ├── top1.jpg
    └── top2.jpg

14 directories, 66 files
```
