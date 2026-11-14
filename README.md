# Daybook

A calm, personal daily to-do site for **Abdu Naim**.

- **Live site:** https://naimworld77.github.io/daybook/
- **GitHub:** https://github.com/NaimWorld77/daybook

Daybook is a static site with no build step, no server account, and no backend. The list, timers, daily goal, and profile stay in this browser only.

## What it does

### The list

Add tasks with the text field above the list. Tasks show **Start** when pending, **Resume** and **Done** when paused, and **Pause** and **Done** while running. A running task shows a live clock.

The blue checkbox marks a task done. Press the green tick again to reopen it. A task that was never started reopens as pending; a task with recorded time reopens as paused. Deleting is a two-step action: **Delete**, then **Remove?**. Click a task title to rename it in place. Done tasks keep a line such as `Started at 9:24 AM · Done at 9:42 AM`.

Only one task can run at a time. Starting another pauses the first. A running timer survives a refresh because the start time is stored as an absolute timestamp.

The overview above the board shows today’s total tasks, completed count, and counted focus time. A small toast confirms saves and removals, and the empty state has a **Create a task** action that jumps to the add field.

### The stopwatch

When a task is running, the stopwatch shows that task with **Pause** and **Mark done**. When no task is running, it is a stopwatch on its own with **Start** and **End**. Starting a task freezes the stopwatch-only timer. Stopwatch-only time is never added to a task, to today, or to the daily goal.

### Days

The three cards open **Yesterday**, **Today**, or **Tomorrow**. The large panel shows the selected list, and **Back to today** appears when another day is open. On load and at midnight, unfinished tasks from earlier days move onto today. A running task is paused before it moves, and its recorded time moves with it. Done tasks stay on the day they were finished, and tomorrow's planned tasks stay on tomorrow.

### The daily goal

Set one goal from 1 minute to 24 hours. The start date is the local day you set it; changing the hours later keeps that original start date. Days before the start date say “Didn't add a goal” and show no tick or red mark.

From the start date onward, each day is compared with the goal:

- Met: green card, green tick, **Goal completed**
- Short: red card, red cross, **Goal not completed**

Today updates live while a timer runs and turns green the moment the total crosses the goal. At midnight, the finished day is frozen with its total, the goal then in force, whether it was met, and how much of each task counted that day. Frozen days keep their mark. Time already counted on a finished day does not count again on the new day, while the task clock still shows the full time worked.

The last seven days appear today first.

### The charts

**Day to day** shows the last seven days with the week total and the total across all recorded days. Today's bar is blue, other bars are light blue, and empty days are gray; the legend under the chart repeats those colors.

**Flow chart** shows the tasks of the selected day in created order: a start node, each task step with its time and status, and a total node.

### Local profile

The optional profile stores a name, email, and an optional picture only in this browser. A picture is resized to a 96px JPEG. Click the avatar or name in the header to reopen the profile and change any of those details. Signing out removes only the profile; it keeps the tasks. There is no password, no shared account, and no sync to another computer.

Action confirmations appear in a short toast at the bottom of the page, and the current date/time stays in the header.

A friend who opens the same link gets an empty list and their own local sign-up.

## Files

- `index.html` — page shell
- `styles.css` — layout and visual design
- `app.js` — all behavior in one IIFE, no framework
- `favicon.svg` — green tick in a rounded square
- `Daybook.ps1` — opens the live site in an Edge or Chrome app window
- `Daybook.vbs` — launches the PowerShell script with no console
- `.nojekyll` — tells GitHub Pages to serve the folder as-is

## Desktop window

`Daybook.vbs` runs `Daybook.ps1` hidden. The script opens Edge if it is installed, otherwise Chrome, using `--app` with:

`https://naimworld77.github.io/daybook/?app=<unix seconds>`

The changing query makes each launch load the current live page instead of an old saved copy. The window is 1480 by 920 and uses the normal browser storage for the site. No separate browser profile is created.

A Windows shortcut can run:

```text
wscript //B "d:\Personal_website\Daybook.vbs"
```

## Data and privacy

Everything is stored in `localStorage` in this browser. Dates are local `YYYY-MM-DD` values. There is no server account and no sync across computers.

- `daybook.v1` — days and tasks
- `daybook.profile.v1` — local profile
- `daybook.goal.v1` — daily goal
- `daybook.goal.results.v1` — frozen finished-day results
- `daybook.watch.v1` — the stopwatch on its own

To publish, update the `?v=` query on `styles.css` and `app.js` when those files change so the browser does not keep an old copy. GitHub Pages serves the `main` branch from the repository root.
