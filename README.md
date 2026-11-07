# Daybook

A daily to-do list that keeps the time you spend on each task.

Live site: [https://naimworld77.github.io/daybook/](https://naimworld77.github.io/daybook/)

## What it does

- The to-do list is the main panel. Add a task, then work through the list.
- A task that is not finished is **red**.
- Press the circle when you finish it. The row turns **green** and shows a tick.
- Press **Start** when you begin a task. The stopwatch counts hours, minutes, and seconds until you pause or mark it done.
- Only one task runs at a time. Starting another task pauses the one that was running.
- **Yesterday**, **today**, and **tomorrow** are the smaller cards. Click one to see that day’s list.
- The flow chart lines the tasks up in the order you worked them, with the time on each step.
- **Day to day** shows the hours for the last seven days, plus the total of every day you have recorded.
- **Daily goal** is the hours you want to work each day. A day is green when you reach it and red when you do not.

## How to use it

1. Open the [live site](https://naimworld77.github.io/daybook/).
2. Type a task and press **Add**.
3. Press **Start** when you begin.
4. Press **Pause** if you stop in the middle. **Resume** continues from the same time.
5. Press the circle, or **Done**, when the task is finished.

Tasks you do not finish move to the next day. Finished tasks stay on the day you completed them.

Your list stays in this browser on this computer. It is still there after you close the page. Clearing the site’s data in the browser clears the days. The tasks are not stored in this GitHub repository.

You can send the live link to a friend. They get their own list. Press **Sign up** and the top corner shows the name, email, and picture entered on that computer. A friend who signs up on their computer sees their own name, not yours.

## Run it on your computer

The site is one HTML page, a stylesheet, and a script. No build step is required.

From this folder:

```powershell
py -3 -m http.server 8765
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

On Windows, `Daybook.vbs` opens the live site in its own window. A desktop shortcut can point at that file.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | The page |
| `styles.css` | Layout and the red and green task colors |
| `app.js` | The list, timer, flow chart, and saved days |
| `Daybook.ps1` | Opens the live site in an app window |
| `Daybook.vbs` | Starts that window without a console |
