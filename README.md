# Christmas Village

A [Kiosk Satellite](https://kiosksatellite.com) screensaver: an animated pixel art Christmas village that follows the time of day. By day the sun shines on the snow and clouds drift past. Towards sunset the sky turns orange and pink, and at night the moon comes up, the stars twinkle and Santa's sleigh flies across the sky. All day long the snow falls, the tree lights twinkle, the chimneys smoke and the river shimmers.

![Christmas Village at night: a snowy pixel art village under a full moon, with a lit Christmas tree, a snowman and a countdown to Christmas at the top](https://raw.githubusercontent.com/MozKaboom/Christmas-countdown-pixel-art-screensaver/main/docs/screenshots/night.webp)

![Christmas Village by day, with the clock showing at the top](https://raw.githubusercontent.com/MozKaboom/Christmas-countdown-pixel-art-screensaver/main/docs/screenshots/day.webp)

<img src="https://raw.githubusercontent.com/MozKaboom/Christmas-countdown-pixel-art-screensaver/main/docs/screenshots/portrait.webp" alt="Christmas Village on a portrait screen, with the countdown at the top" width="320">

## Installation

### Community Plugins (Recommended)

Christmas Village is listed in [Community Plugins](https://kiosksatellite.com/plugins/). Use the button below to open it in your Kiosk Satellite and install it.

[![Install in Kiosk Satellite](https://kiosksatellite.com/img/badges/plugin-add.svg)](https://kiosksatellite.com/redirect/plugin/?repository=MozKaboom/Christmas-countdown-pixel-art-screensaver)

Or search for `Christmas Village` in **Settings > Plugin Manager > Browse plugins** in Kiosk Satellite.

### Manual

1. Open **Settings > Plugin Manager** in Kiosk Satellite and turn on **Enable Plugins**.
2. Choose **Add plugin**, paste `https://github.com/MozKaboom/Christmas-countdown-pixel-art-screensaver` and choose **Preview**.
3. Review the plugin and choose **Trust and install**.

## Use it

1. Enable **Christmas Village** from its entry row in Plugin Manager.
2. Open **Screensaver > Screensaver mode** and pick **Christmas Village (Christmas Village)**. You can also pick it in a screensaver schedule entry.
3. Start the screensaver from the kiosk menu, or wait for the idle timeout.

The village fills the screen's height with no borders, in landscape and portrait. The picture is much wider than the screen, with pine woods and snowy fields either side of the village, so it scrolls slowly from side to side to show it all. The **Scroll speed** setting slows it down or keeps it still.

## Settings

Open **Settings > Plugin Manager**, choose **Christmas Village** and change any of these. The screensaver picks up a change the next time it starts.

### Day and night

| Setting | Choices | Default | What it does |
| --- | --- | --- | --- |
| Time of day | Follow the clock, Always day, Always night, A day every 3 minutes | Follow the clock | **Follow the clock** uses the kiosk's own time, so the village is light by day and dark at night. **Always day** and **Always night** keep one look all the time. **A day every 3 minutes** runs through a whole day, from sunrise to night, to show everything off. |
| Sunrise | 06:00 to 10:00, every half hour | 08:00 | When it gets light. The sky starts to brighten about 50 minutes before, with a pink and orange sunrise glow. |
| Sunset | 14:30 to 20:00, every half hour | 16:00 | When it gets dark. The sunset glow starts about 50 minutes before, then the moon and stars come out. |

### Scene

| Setting | Choices | Default | What it does |
| --- | --- | --- | --- |
| Snow | None, Light, Steady, Blizzard | Steady | How much snow falls. A blizzard is thick, fast and blows sideways. |
| Santa flies past | Never, every 1, 2, 5, 10 or 30 minutes | Every 2 minutes | How often Santa's sleigh crosses the night sky. He also flies past soon after the screensaver starts. He only flies at night. |
| Scroll speed | 0 (no scroll), 1, 2, 3 | 3 | How fast the picture drifts from side to side. **0** keeps it still, centred on the village. **1** and **2** are a third and two thirds of the full speed. **3** is the fastest. |

### Clock and countdown

| Setting | Choices | Default | What it does |
| --- | --- | --- | --- |
| Clock | Off, 24 hour, 12 hour | Off | Shows the time at the top of the screen in pixel lettering, like a 16-bit game. |
| Countdown to Christmas | On or off | Off | Shows the days, hours, minutes and seconds until Christmas Day, under the clock if it's on. Under it, UNTIL CHRISTMAS DAY! a little larger. On Christmas Day it says MERRY CHRISTMAS! |
| Show seconds in the countdown | On or off | On | Counts down the seconds too, as in 30 DAYS & 09:14:05 HOURS. Off shows 30 DAYS & 09:14 HOURS. |

The clock and countdown stay put while the picture scrolls behind them.

### Troubleshooting

| Setting | Choices | Default | What it does |
| --- | --- | --- | --- |
| Show diagnostics | On or off | Off | Shows the screen size, frame rate, whether the pictures loaded and any errors in the corner of the screen, for tracking down a problem. |

## Data and privacy

Christmas Village makes no network requests and stores nothing. Everything it shows is inside the plugin.

## How it works

The screensaver is a web page in the plugin's `assets/village` folder, which Kiosk Satellite shows as a packaged screensaver. It draws the village by night and by day and blends between them as the clock moves through dawn and dusk. The snow, lights, stars, smoke, river and clouds are drawn on a layer of pixels the same size as the art's own, so they look part of the picture.

To try the page on a computer, serve `assets/village` with any web server and open `index.html`. Add `?t=17:00` to see a set time of day, or `?demo` to run through a whole day in three minutes.

## Credits

- The village artwork is by MozKaboom.

## Build

Install Python 3, JDK 17 or newer and an Android SDK with a platform and build-tools. Set `ANDROID_HOME` and `JAVA_HOME` as needed.

```sh
python3 tools/test.py
python3 tools/build.py
```

The build creates `dist/christmas-village-screensaver-<version>.zip`. To try it, open **Plugin Manager > Developer Tools > Install from ZIP** in Kiosk Satellite.

Releases are built by the GitHub Actions workflow in `.github/workflows/build.yml` when a release is published.

## License

[Apache-2.0](LICENSE) for the code. The SDK interfaces in `sdk/` and the build tools in `tools/` come from the [Kiosk Satellite plugin template](https://github.com/jxlarrea/kiosk-satellite-plugins) under the same license.
