// SPDX-License-Identifier: Apache-2.0
package kiosk.xmas;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import me.jxl.kiosk.plugins.PluginHost;

/** Checks the settings reach the page and the screensaver is published and withdrawn. */
public final class VillageTest {
    static final class Host implements PluginHost {
        final List<Map<String, Object>> published = new ArrayList<>();
        boolean removed;
        String status;
        boolean statusError;
        boolean old;
        public void showWindow(String title, String message, String button) {}
        public void hideWindow() {}
        public void log(String message) {}
        public void status(String message, boolean error) { status = message; statusError = error; }
        public void publishScreensaverAsset(String key, String title, String entry, Map<String, Object> data) {
            if (old) throw new UnsupportedOperationException("Screensaver assets are unavailable");
            assert VillagePlugin.KEY.equals(key) && VillagePlugin.TITLE.equals(title) && VillagePlugin.ENTRY.equals(entry);
            published.add(data);
        }
        public void removeScreensaver(String key) { removed = VillagePlugin.KEY.equals(key); }
    }

    static Map<String, Object> map(Object... pairs) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) m.put((String) pairs[i], pairs[i + 1]);
        return m;
    }

    public static void main(String[] args) {
        // Defaults.
        Map<String, Object> o = VillagePlugin.options(map());
        assert "auto".equals(o.get("timeOfDay")) && o.get("sunrise").equals(480) && o.get("sunset").equals(960) : o;
        assert o.get("snow").equals(2) && o.get("santaEvery").equals(120) : o;
        assert Boolean.FALSE.equals(o.get("diagnostics")) : o;
        assert o.get("scroll").equals(3) : o;
        assert VillagePlugin.options(map("scroll", "0 (no scroll)")).get("scroll").equals(0);
        assert VillagePlugin.options(map("scroll", "2")).get("scroll").equals(2);
        assert VillagePlugin.options(map("scroll", "fast")).get("scroll").equals(3);
        assert "off".equals(o.get("clock")) && Boolean.FALSE.equals(o.get("countdown")) : o;
        o = VillagePlugin.options(map("clock", "12 hour", "countdown", true));
        assert "12".equals(o.get("clock")) && Boolean.TRUE.equals(o.get("countdown")) : o;
        assert Boolean.TRUE.equals(VillagePlugin.options(map()).get("countdownSeconds"));
        assert Boolean.FALSE.equals(VillagePlugin.options(map("countdownSeconds", false)).get("countdownSeconds"));
        assert "24".equals(VillagePlugin.options(map("clock", "24 hour")).get("clock"));
        assert Boolean.TRUE.equals(VillagePlugin.options(map("diagnostics", true)).get("diagnostics"));

        // Every setting.
        o = VillagePlugin.options(map("timeOfDay", "Always night", "sunrise", "07:30", "sunset", "17:00", "snow", "Blizzard", "santaEvery", "Never"));
        assert "night".equals(o.get("timeOfDay")) && o.get("sunrise").equals(450) && o.get("sunset").equals(1020) : o;
        assert o.get("snow").equals(3) && o.get("santaEvery").equals(0) : o;
        assert VillagePlugin.options(map("santaEvery", "Every 30 minutes")).get("santaEvery").equals(1800);
        assert "fast".equals(VillagePlugin.options(map("timeOfDay", "A day every 3 minutes")).get("timeOfDay"));
        assert VillagePlugin.options(map("snow", "None")).get("snow").equals(0);

        // Bad values fall back.
        assert VillagePlugin.minutes("25:00", 1) == 1 && VillagePlugin.minutes("7", 2) == 2 && VillagePlugin.minutes(7, 3) == 3;
        assert VillagePlugin.options(map("timeOfDay", "Sometimes", "snow", "Lots")).get("snow").equals(2);

        // Publish on start, again only when settings change, withdraw on stop.
        Host host = new Host();
        VillagePlugin plugin = new VillagePlugin();
        plugin.start(host, map());
        assert host.published.size() == 1 && !host.statusError : host.status;
        plugin.configure(map());
        assert host.published.size() == 1 : "Unchanged settings don't publish again";
        plugin.configure(map("snow", "Light"));
        assert host.published.size() == 2 && host.published.get(1).get("snow").equals(1);
        plugin.stop();
        assert host.removed;

        // An older Kiosk Satellite says so instead of failing.
        Host old = new Host();
        old.old = true;
        new VillagePlugin().start(old, map());
        assert old.statusError && old.published.isEmpty();

        System.out.println("VillageTest passed");
    }
}
