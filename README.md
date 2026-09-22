# ToDo

A personal to-do app with a calendar, color-coded categories, repeating tasks, US and Korean holidays, and sync across iPhone, iPad and Mac. It works fully offline and syncs when a connection returns.

Plain HTML, CSS and JavaScript with no build step. Hosted on Netlify, synced with Supabase.

## Setup

Your Supabase project and keys are already in `config.js`. These steps finish the server side and put the app online.

### 1. Adjust two Supabase sign-in settings

In the Supabase dashboard open **Authentication**, then **Sign In / Providers**, then **Email**.

1. Turn off **Confirm email**, then save. This lets you sign in right after creating your account.
2. Come back after step 4 and turn off **Allow new users to sign up** (under Authentication, Sign In / Providers). This keeps the app private to you.

### 2. Create the database tables

1. Open **SQL Editor** and click **New query**.
2. Paste all of `supabase/setup.sql` and click **Run**.
3. You should see "Success. No rows returned".

Running it again later is safe.

### 3. Put the app online with Netlify

Quick way. Go to app.netlify.com/drop and drag the whole `todo` folder onto the page. Netlify gives you a web address right away.

Better for updates. Put the folder in a GitHub repository, then in Netlify choose **Add new site**, **Import an existing project**, and pick the repository. Leave the build command empty and set the publish directory to the repository root. Every push then updates the app.

### 4. Create your account

Open the Netlify address in Safari, tap **Create an account**, and enter your email and a password of at least 6 characters. A Personal category is created for you. Then go back to step 1 and turn off new sign-ups.

### 5. Install on each device

- **iPhone and iPad.** Open the address in Safari, tap the Share button, then **Add to Home Screen**.
- **Mac.** Open the address in Safari, then choose **File**, **Add to Dock**.

Sign in once on each device. After that the app opens straight to your tasks, even offline.

## How sync works

- Every change saves on the device first, so the app never waits for the network.
- Changes go to Supabase within about a second when online, and are queued when offline.
- The app checks for changes from your other devices when it opens, when you switch back to it, when the connection returns, and every 30 seconds while open.
- If the same task was edited on two devices, the most recent edit wins.
- A chip next to the icons in the header shows **Offline** or **Sync issue** when relevant. Settings shows the full status and a **Sync now** button.
- Logging out clears the data stored on that device. Anything not yet synced is lost, and the app warns you first.

## Updating the app

Change the files and redeploy. Because the app is stored for offline use, each device picks up the new version the second time it opens after the update. If something looks out of date, close the app fully and open it again.

## Features

- Month calendar starting on Sunday, with a dot per category on each day
- Tasks in unlimited categories, each with one of 38 colors
- Quick add, check off (done tasks turn gray with a line through), notes, move to tomorrow, drag to reorder or move between categories
- Repeats: daily, weekly on chosen days, monthly by date, last day or weekday (like the last Tuesday), yearly by solar or lunar date, every N days, weeks, months or years, with an optional end date
- A 31st repeat uses the last day of shorter months, Feb 29 uses Feb 28 in other years, and a lunar 30th uses the 29th when that month has no 30th
- Single days of a repeat can be skipped, moved or edited, or changes can apply to that day and every later one
- US and Korean holidays in red, each with its own switch in Settings. US holidays are calculated for any year. Korean holidays come from the official government calendar through the holidays-kr project, need no API key, are kept on each device for offline use, and include substitute and temporary holidays. If the source can't be reached, built-in 2026 and 2027 dates are used.

## Checklist on your devices

The app was tested in Chrome at iPhone 13 mini, iPad mini and MacBook Pro sizes against a stand-in for Supabase. Safari and the real Supabase project couldn't be reached from the test environment, so please try these once on real devices.

1. Create your account in Safari on the Mac and add a task.
2. Install on the iPhone and sign in. The task from the Mac should appear within a few seconds.
3. Check off a task on the iPhone. Switch to the Mac app. It should show as done.
4. Turn on Airplane Mode on the iPhone, add a task, close the app fully, and reopen it. The task should still be there. Turn Airplane Mode off and check the Mac.
5. Type a Korean task name with the Korean keyboard and press Return. It should save the full word.
6. Make a weekly repeat, then move one day of it with **Move to tomorrow**, and edit another day with **This day only**.
7. Make a yearly lunar repeat and check the next dates against a Korean calendar.
8. Rotate the iPad and check that the calendar and task list sit side by side in both orientations.
9. Look at September 2026. Sep 7 and Sep 24 to 26 should be red.

## Files

| Path | What it does |
|---|---|
| `index.html` | Page structure for every screen |
| `styles.css` | Styling for iPhone, iPad and Mac sizes |
| `config.js` | Supabase address and publishable key |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Home screen name and icon |
| `js/app.js` | Screens, sign-in and task editing |
| `js/store.js` | Data saved on the device and the queue of unsynced changes |
| `js/sync.js` | Sending and receiving changes with Supabase |
| `js/repeat.js` | Repeat rules and lunar dates |
| `js/holidays.js` | US holiday rules and Korean holiday names |
| `js/holiday-feed.js` | Downloads Korean holidays, with a backup source |
| `js/dates.js`, `js/palette.js` | Date helpers and the color palette |
| `js/vendor/`, `fonts/` | Bundled libraries and fonts, so nothing loads from other sites |
| `supabase/setup.sql` | Tables and security rules |

## Credits

Supabase JS client (MIT), SortableJS (MIT), korean-lunar-calendar (MIT, based on KASI data, valid through 2050), holidays-kr by Hyunbin Seo (MIT, data only, fetched at runtime), Figtree and Bricolage Grotesque fonts (SIL Open Font License).
