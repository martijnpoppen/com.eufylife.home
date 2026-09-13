'use strict';

/**
 * This app is deprecated, and everything that says so.
 *
 * It is replaced by **Anker Eufy** (`com.eufy`), which supports these robot vacuums alongside the
 * cameras, doorbells, HomeBases, locks, keypads and sensors that used to need Eufy Security — all in
 * one app. This app still works, and is meant to keep working while people move across, so nothing
 * here makes a device unavailable or blocks a Flow. It informs; it does not punish.
 *
 * The notice reaches a user three ways, because no single one reaches everybody:
 *
 *   - a Homey timeline notification, sent once per install (see {@link notifyOnce});
 *   - a warning banner on every device, which is what somebody still using the app sees daily;
 *   - the App Store listing and README, which is what somebody about to INSTALL it sees.
 */

/** The app that replaces this one, as a user will find it in the Homey App Store. */
const SUCCESSOR_NAME = 'Anker Eufy';

/** Its app id, for anything that addresses it rather than names it. */
const SUCCESSOR_ID = 'com.eufy';

/**
 * Where the "already told them" flag lives.
 *
 * `homey.settings` survives app restarts and updates, which is the whole point: a notification sent
 * on every boot is noise, and noise is what people learn to ignore.
 */
const NOTIFIED_SETTING = 'deprecationNotified';

/**
 * Which notice this install has already seen.
 *
 * Stored rather than a bare boolean so a genuinely new message can be sent later by changing this
 * value. Change it only when there is something new to say — not to fix a typo, because every
 * install would be told again.
 */
const NOTICE_ID = 'deprecation-anker-eufy-2026';

/**
 * The device banner. Short on purpose: it renders on a device tile, next to the controls.
 *
 * No URL — a banner is glanceable, not clickable, and the app name is what someone types into the
 * App Store search.
 */
const WARNING_TEXT = `This app is deprecated and no longer being developed. Install "${SUCCESSOR_NAME}" from the Homey App Store and add your devices there.`;

/**
 * The timeline notification, sent once.
 *
 * Longer than the banner because it is read once and has room to say what the move actually costs.
 * It carries no link on purpose: a one-time notification cannot be corrected for anyone who has
 * already received it, and the App Store URL depends on the successor being published. The name is
 * searchable, and README.txt carries the link.
 */
const NOTIFICATION_TEXT = `[Eufy Clean] This app is deprecated and no longer being developed. Its replacement, ${SUCCESSOR_NAME}, is in the Homey App Store: it supports your robot vacuums alongside the rest of the eufy range. Install it, add your devices there, and remove this app once your Flows are rebuilt. Both apps can run side by side while you move across.`;

/**
 * Tell this Homey once that the app is deprecated.
 *
 * Never throws. A notification that cannot be sent is worth a log line and nothing more — it must
 * not stop the app starting, and the device banner says the same thing anyway.
 *
 * The flag is written BEFORE the notification is sent, deliberately. Getting the notice twice is
 * worse than not getting it at all: the banner and the App Store listing both still carry it, so a
 * notification lost to a crash between the two costs nothing, while a retry loop that fires on every
 * boot is exactly the noise this avoids.
 *
 * @param {import('homey').App} app the app instance, for `homey` and logging
 */
async function notifyOnce(app) {
    try {
        if (app.homey.settings.get(NOTIFIED_SETTING) === NOTICE_ID) {
            return;
        }

        app.homey.settings.set(NOTIFIED_SETTING, NOTICE_ID);

        await app.homey.notifications.createNotification({ excerpt: NOTIFICATION_TEXT });
        app.log('deprecation - notified');
    } catch (error) {
        app.error('deprecation - could not notify', error);
    }
}

module.exports = {
    SUCCESSOR_NAME,
    SUCCESSOR_ID,
    NOTICE_ID,
    NOTIFIED_SETTING,
    WARNING_TEXT,
    NOTIFICATION_TEXT,
    notifyOnce
};
