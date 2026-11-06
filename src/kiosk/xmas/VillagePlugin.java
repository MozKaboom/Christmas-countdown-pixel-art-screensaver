// SPDX-License-Identifier: Apache-2.0
package kiosk.xmas;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import me.jxl.kiosk.plugins.KioskPlugin;
import me.jxl.kiosk.plugins.PluginHost;

/**
 * Christmas Village, a screensaver. The page in assets/village draws everything: the village by
 * day and by night, following the kiosk's clock, with snow, lights, smoke and Santa's sleigh.
 * The plugin only hands it the settings.
 */
public final class VillagePlugin implements KioskPlugin {
    static final String KEY = "village";
    static final String TITLE = "Christmas Village";
    static final String ENTRY = "village/index.html";
    static final List<String> TIMES = Arrays.asList("Follow the clock", "Always day", "Always night", "A day every 3 minutes");
    static final List<String> MODES = Arrays.asList("auto", "day", "night", "fast");
    static final List<String> SNOW = Arrays.asList("None", "Light", "Steady", "Blizzard");

    private PluginHost host;
    private Map<String, Object> published;

    @Override
    public synchronized void start(PluginHost host, Map<String, Object> settings) {
        this.host = host;
        if (host.isHeadless()) return;
        publish(settings);
    }

    @Override
    public synchronized void configure(Map<String, Object> settings) {
        if (host == null || host.isHeadless()) return;
        publish(settings);
    }

    @Override
    public void execute(String command, Map<String, Object> arguments) {}

    @Override
    public void onEvent(String event, Map<String, Object> payload) {}

    @Override
    public synchronized void stop() {
        try {
            if (host != null && published != null) host.removeScreensaver(KEY);
        } catch (RuntimeException ignored) {
            // KS removes a stopped plugin's screensavers itself.
        }
        published = null;
        host = null;
    }

    private void publish(Map<String, Object> settings) {
        Map<String, Object> options = options(settings);
        if (options.equals(published)) return;
        try {
            host.publishScreensaverAsset(KEY, TITLE, ENTRY, options);
            published = options;
            host.status("Pick Christmas Village under Screensaver > Screensaver mode", false);
        } catch (UnsupportedOperationException | LinkageError olderHost) {
            host.status("This Kiosk Satellite version can't show packaged screensavers", true);
        }
    }

    /** What the page needs, from the settings. Unknown or missing values fall back to the defaults. */
    static Map<String, Object> options(Map<String, Object> settings) {
        Map<String, Object> options = new LinkedHashMap<>();
        int time = TIMES.indexOf(settings.get("timeOfDay"));
        options.put("timeOfDay", MODES.get(time < 0 ? 0 : time));
        options.put("sunrise", minutes(settings.get("sunrise"), 8 * 60));
        options.put("sunset", minutes(settings.get("sunset"), 16 * 60));
        int snow = SNOW.indexOf(settings.get("snow"));
        options.put("snow", snow < 0 ? 2 : snow);
        options.put("santa", !Boolean.FALSE.equals(settings.get("santa")));
        return options;
    }

    /** "07:30" to 450. */
    static int minutes(Object value, int fallback) {
        if (!(value instanceof String)) return fallback;
        String[] parts = ((String) value).split(":");
        if (parts.length != 2) return fallback;
        try {
            int h = Integer.parseInt(parts[0].trim()), m = Integer.parseInt(parts[1].trim());
            if (h < 0 || h > 23 || m < 0 || m > 59) return fallback;
            return h * 60 + m;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
