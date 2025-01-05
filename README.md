# WiFi Heatmapper

This project is a WiFi heatmapper solution for macOS/Windows, inspired by [python-wifi-survey-heatmap](https://github.com/jantman/python-wifi-survey-heatmap). I wanted to create a heatmap of my WiFi coverage, but the original project didn't work because I am running on Mac (Apple Sillicon).
A Windows support was added subsequently.

![Screenshot](various/top1.jpg)
![Screenshot](various/top2.jpg)

## Recording

[![showcase recording](https://img.youtube.com/vi/pXlm-eWaJCs/0.jpg)](https://www.youtube.com/watch?v=pXlm-eWaJCs)

## Prerequisites

- macOS (tested on Apple M2, Sequoia 15) or Windows
- `npm` and `iperf3` installed (can be installed via `brew install npm iperf3`)
   - `iperf3` must be available in `PATH`, i.e. from the terminal you are running `npm run dev` you **must** be able to run e.g. `iperf3 --version` just fine. This is 
      likely default on macOS if you used e.g. `brew iperf3` (as if you have "normally" configured `brew`, it adds `iperf3` binary into directory that is in your path), but for Windows
      you might have to do something like `set PATH=%PATH%;C:\path\to\iperf3`, e.g. do `set PATH=%PATH%;C:\iperf3` (or `setx` to make it permanent) before running `npm run dev`

## Installation

    git clone https://github.com/hnykda/wifi-heatmapper.git
    cd wifi-heatmapper
    npm install

## Usage


0. check that your `iperf3` command works by `iperf3 --version`
1. Start the application from where you want to run the tests (very likely your Mac/Windows laptop so you can move around the house):

   ```bash
   npm run dev
   ```

2. On a separate server that you want to run the tests against, run the following command to start the `iperf3` server (you will need its IP address to be accessible from the laptop running the application):

   ```bash
   iperf3 -s
   ```

3. Open a web browser and go to `http://localhost:3000`.

4. Upload your floor plan image. You might have to create it using some other software, such as `sweethome3d`.

5. Follow the on-screen instructions to complete the WiFi survey and generate the heatmap.

## How does this work

It's actually pretty simple. The app is written in Next.js. To get the information, we invoke the `iperf3`, `wdutil` and `ioreg` commands via JS `child_process` and parse the output. The webapp then just stores everything in simple JSON "database" file.

## Credits

This project was inspired by [python-wifi-survey-heatmap](https://github.com/jantman/python-wifi-survey-heatmap). Special thanks to the original author for their work.

## Contributing

Feel free to contribute to this project by opening an issue or submitting a pull request. I am more than happy for that!

### Some ideas one could work on:

1. extend this to work on Windows and Linux
2. find out how to get RSSI and other stuff from `ioreg` so sudo is not needed (for `wdutil`)
3. make the app more user-friendly and informative (step by step wizard for the measurements)
4. serialize the image to the database file so it can be loaded later
5. add leaflet to make the maps interactive
6. load/save heatmap config to database
