Hello,

# Prompt: Monty the Home Automation Web Application - Plan Review
**Objective** I want to create A web application for controlling and monitoring smart home devices, including A-OK roller shades via Arduino with a 433 MHz RF transmitter, playing music, displaying weather data from OpenWeatherMap, and temperature data from Govee WiFi Hygrometers.

## Background:
I would like the application to be called Monty - Monty is a name I have given my "home automation butler".  Monty is a play on words - my wifi is called "Monty's Prospect" and in latin "Montis Prospect" translates roughly to Mountain View (I have a splendid view of the mountains from my house).  This town I live in is also a Mining town - so i love the double entendre =)

(By the way - Monty is an OWL🦉)

The I desire for the web application to also have an iphone and android app counterpart (but this is a future step - we will **NOT address this now**, but only keep this in mind for determining the structure of this application.)

## Scope
My own Personal use for my house, single-user (or for whoever is on my wifi), deployed locally.

### Vibe
Development should be lightweight, functional, built iteratively with you.  Please do not skip ahead of singular tasks - I will notify you when to proceed.  This will be my first full-stack application.

### Key Notes
The primary driver behind this whole webpage & webserver is to drive **_Shade Automation_**
I will describe the Windows and Shade "Scene Status" for my house here:	

#### The Main Level
The Main Level has 2 shades over each window: A privacy shade and a solar shade.
- Scene/Event: **Good Night** - At night after sundown the main floor privacy shades (Shade id: 14) are lowered down
	- This time will dynamically change on a calendar-schedule.  I want this shade to lower ~20-40 minutes after sunset (Sooner if it gets darker faster, later if it gets darker slower).
- Scene: **Good Morning** - At a specific time every morning the main floor privacy shades (Shade id: 14) are rolled up
	- This time will be static (~7:45 AM) unless a **"Wake Up"** time is set by the user (see below scene), then it will match whatever time is set.
- Scene: **Good Afternoon** - At a specific time every afternoon the main floor solar shades (Shade id: 28) are lowered down (to shade from the sun)
	- This time will dynamically follow the position of the sun in the sky on a calendar-schedule.
- Scene: **Good Evening** - At a specific time every late-afternoon the main floor solar shades (Shade id: 28) are raised (to show the sunset)
	- This time will dynamically follow the position of the sun in the sky on a calendar-schedule.
#### The Bedroom
The Bedroom has 2 shades over each window: A privacy shade and a blackout shade. 
- Scene/Event: **Rise'n'Shine** - At a specific time every morning the bedroom blackout shades (Shade id: 40) are rolled up 
	- This time will be static (~7:45 AM) unless a **"Wake Up"** Alarm time is set by the user.
	- Here are some examples containing primary cases and potential edge cases:
		- A user opens the app/webpage On Friday June 6 at 9:00PM and sets **"Wake Up"** time as 9:00AM.  Therefore the privacy shades on the main level and bedroom blackout shades will both raise at 9:00AM on Saturday June 7.
		- A user opens the app/webpage On Saturday June 7 at 2:00AM and sets **"Wake Up"** time as 9:00AM.  Therefore the privacy shades on the main level and bedroom blackout shades will both raise at 9:00AM on Saturday June 7.
		- A user opens the app/webpage On Saturday June 7 at 2:00AM and sets **"Wake Up"** time as 9:00AM.  The user then wakes up at 8:45AM on Saturday June 7 and decides to sleep in.  The user sets the **"Wake Up"** time as 10:00AM.  Therefore the privacy shades on the main level and bedroom blackout shades will both raise at 10:00AM on Saturday June 7.
		- A user opens the app/webpage On Friday June 7 at 9:05AM.  (The shades have alread risen at 9:00AM)  The user set's "**Wake Up"** time as 8:00AM.  Therefore the privacy shades on the main level and bedroom blackout shades will both raise at 8:00AM on Saturday June 7.
- Scene/Event: **Let the Sun In** - 7 minutes after **"Wake Up"** is triggered then the west facing privacy shades in the bedroom (Shade id: 42 & 43) plus the all Loft shades (Shade id: 48) are raised. (The south facing privacy shade will stay down until the user manually raises it for privacy from neighbors)
- Scene/Event: **"Bed Time"** - When **"Good Night"** is triggered for the Main Level, then the blackout shades in the bedroom (Shade id: 40) will lower also.
#### The Office
The Office has 2 groups of shades (solar & privacy)
- Scene/Event: **Start the Day** - 20 minutes after "Wake Up" then most of the office shades (all office privacy Shade id:33 and west-facing office solar Shade id:34) are raised.
	- Note I have special "hold instructions on these shades" so after 20 seconds of (**Wake Up**+20 minutes), then also send another UP instruction to shade id: 31 to ensure it is fully raised)
- Scene/Event: **Office Needs Shade** - When "Good Afternoon" is triggered for the Main Level, also the Office Solar shades (Shade id: 36) are sent a command to be lowered (in case they are not already)
- Scene: **"Good Night Office"** - When **"Good Night"** is triggered for the Main Level then all office privacy shades (Shade id: 33) are sent a command to be lowered (in case they are not already)

#### The Loft
The Loft has all it's shades in one group
- Scene: **"Good Night Loft"** - When **"Good Night"** is triggered for the Main Level then all office shades (Shade id: 48) are lowered.

## Context:

### Key functionality
**Shades:**
	Currently I have a FULL implementation of shades to be controlled via command line - https://github.com/DOUGSKEEZ/AC123_shade_controller
		This repo consists of the .ino (Arduino file), .py (python interface), and .db (the information for all my individual shades + shade group commands/info)

**Weather Data:**
	From OpenWeatherMap.  I have an API key ready with my location: ZIP 80498

**Temperature Data:**
	I have 6 Govee H5100 sensors.  They will  be placed in the following locations:
	1. Outside
	2. Main Floor
	3. Master Bedroom
	4. Garage
	5. Guest Bedrrom
	6. Humidor

**Music:**
	I have Klipsch The Fives speakers.  It is important that I do not have a stereo system on ALL the time.  Fortunately these speakers are in a standby mode until they get a Bluetooth syncing request.  I would like to sync the local server to these speakers and play music via `pianobar` (https://github.com/PromyLOPh/pianobar)


### Design & Features
The following Headings will identify the pages in scope and their features & functionality

#### The Main Page (#Main_Page) of the application will show
- **Monty the Owl** at the top left or right (Using a placeholder icon for now, I will draw him to be incorporated later)

- A Graphical representation denoting **"Home or Away" status** 
	- Clicking on this will allow you to change the Status to "Home" or "Away" or "Schedule an Away Period" via the **Home or Away Status/Configuration Page**

- Silverthorne **current Weather, Temp, & Main floor Temp**
	- Clicking on the Silverthorne Weather icon or Temp # will take you to a page (#Local_Weather) showing the upcoming 7 or 10 day forecast (whatever is standard per the OpenWeatherMap API)
	- Clicking on the Main floor Temp number will take you 

- A Graphical representation of the **"Scene Status" of the shades for the main level** ("Good Morning" showing Sunrise /"Good Afternoon" showing Sun Rays/"Good Evening" showing Sun Set/"Good Night" showing Moon and Stars)
	- Clicking/tapping on this will take you to **Shade Control Page** (a page that allows you to control individual shades or groups of shades - details below)

- A button with Graphical Representation to set the **"Wake Up"** Alarm time for the next day and a graphical representation showing what tomorrow's Wake Up time is...
	- **Wake Up** is the alarm that triggers **"Rise'n'Shine**" for the bedroom shades... and Monty's house!
	- 
	- If there is an upcoming scheduled "Wake Up" then you can see it dyanmically represented on this home page / otherwise if no Wake Up is set then the Alarm is greyed out.
	- You can set the Wake Up time right from the Main Page in a little dialogue menu (with a nifty clock)
	- There will be no dedicated page for this - it will be handled in dynamic interaction (hopefully there is a library that accomodates our timer/alarm/clock to be set nicely!)

---

Below these top key features on the main page will be buttons/links to the other features of the home app


- **Play Music** (a link to a page that allows control of playing music to my speakers THE FIVES using `pianobar`)
	- I would like a button here to STOP music too.
	- 

- **Configuration** - A link to a configuration page that allows configuration of:
	- Modifying when Scenes start (e.g. the static 7:45 standard Wake Up time to 7:00 AM, or let's say we have shades go down some constant after sundown into **Good Night** we should be able to set that here instead of changing the application code
	- I welcome other configuration aspects that I may have missed that would be best practice to edit from here rather than the underlying code.

__________


#### Home or Away Status/Configuration Page
- This page will show Home or Away status.  
	- The **Home** status will mean that all Shade automation (detailed below) or scheduled Music playing will happen on it's regular daily schedule.
	- The **Away** status will mean that all Shade automation (detailed below) or scheduled Music playing will NOT happen on it's regular daily schedule.
- This page will also have way to set a schedule for Home or Away status and the current and next calendar months will be visible to see days marked "Away" (E.g. I will be gone June 1-5, then I can set this and queue it up where it is visibly seen on a Calendar on the page.)
- Date ranges can be picked with `Flatpickr` using the range feature for Away times.  The ranges that are finalized can be simply listed as bulleted records on this configuration page or with another 2 `Flatpickr` calendars (current and next month) showinging the days that are marked as "Away".



#### Temp & Weather Page
- This page will show the current weather forecast for Silverthorne CO via the OpenWeatherMan API.
- This page will show the temperatures reported by the Govee temperature sensors too.
- Leverage [Weather Icons](https://erikflowers.github.io/weather-icons/) if OpenWeatherMap has insufficient UI artifacts.
- Temperatures should be displayed in Fahrenheit

#### Shade Control Page
- This page will display 4 "Groups of shades" with **TWO** sets of interactive instructions (UP / DOWN / STOP) on the page because each group has a *TWO* types of shades on it (e.g. Main Floor has privacy & solar shades on windows / Bedroom has privacy & blackout shades on windows / Office has dimming & solar shades / Loft has dimming & blackout), each group will also have it's own sub page to control the individual shades.
- The 4 groups are as follows:
  	- Main Level
  	- Bedroom
  	- Office
  	- Loft

Each group will look kind of like this on the page:  	
```
⬆️		⬆️	
⏹️ Main ⏹️	
⬇️		⬇️	
⚫		⚪	
solar	dimming

⬆️			⬆️
⏹️ Bedroom 	⏹️
⬇️			⬇️
⚫			⚪
blackout	dimming
```
(How do you like my ascii / emoji drawing in text? 😄)

Hopefully you follow.

**Example:** If the user were to hit the UP ⬆️ arrow in the ⚪ dimming column in the Main group, then the Shade id: 14 would send the command for UP

**Example**: If the user were to hit the DOWN ⬇️ arrow in the ⚫ solar column in the Office group, then the Shade id: 36 would send the command for DOWN

**Example**: If the user were to hit the STOP ⏹️ button in the ⚫ solar column in the Main group, then the Shade id: 28 would send the command for STOP

**Example**: If the user were to click on Bedroom then the user would be taken to the "Shade Control Sub-Page: Bedroom" page showing all of the bedroom shades - See next section for details on that!

#### Shade Control Sub-Page: Main
The top of the sub-page will have a toggle slider `(⚪↔️⚫)`, by toggleing the slider it will determine whether the up/down/stop commands are given to the dimming or solar shades.  (This toggle is to save space on the page... Having 26 UP/DOWN/STOP would be overwhelming)

Just below the toggle will be an UP / STOP / DOWN for **ALL**  ⚪or⚫ shades in this Main window group.
(All Main Dimming = Shade id 14)
(All Main Solar = Shade id 28)

In the main body of the page there is to be 3 Rows of Boxes to send individual  UP⬆️ / STOP⏹️ / DOWN⬇️ commands
- The 1st row will be called "Kitchen" and have 5 Windows 
	- Depending on what is toggled Solar/Dimming 1st Row commands will be for Shade id's: 1-5 for ⚪ dimming, Shade id's: 15-19 for ⚫ solar)
- The 2nd row will be called "Great Room" and have 6 Windows 
	- Depending on what is toggled Solar/Dimming 2nd Row commands will be for Shade id's: 6-11 for ⚪ dimming, Shade id's: 20-25 for ⚫ solar 
- The 3rd row will be called "Dining & Pantry" and have 2 Windows.
	- Depending on what is toggled Solar/Dimming 3d Row commands will be for Shade id's: 12-13 for ⚪ dimming, Shade id's: 26-27 for ⚫ solar 

Below these Rows will leave space for an image - I may want to upload an image with labels.

#### Shade Control Sub-Page: Bedroom
The top of the Bedroom sub-page will have a toggle slider `(⚪↔️⚫)`, by toggleing the slider it will determine whether the up/down/stop commands are given to the Dimming or BLACKOUT.  (This toggle is to save space on the page)

Just below the toggle will be an UP / STOP / DOWN for **ALL**  ⚪or⚫ shades in this Bedroom window group.
(All Bedroom BLACKOUT = Shade id 40)
(All Bedroom Dimming = Shade id 44)

There are only 3 windows in this group so there will be only 1 row for bedroom.  There will be 1 row of Boxes to send individual  UP⬆️ / STOP⏹️ / DOWN⬇️ commands to the windows in the Bedroom

- The row will be called "Bedroom" and have 3 Windows 
	- Depending on what is toggled Dimming/BLACKOUT, the Row commands will be for Shade id's: 41-43 for ⚪ dimming, Shade id's: 37-39 for ⚫ BLACKOUT

Below the Row will leave space for an image - I may want to upload an image with labels.

#### Shade Control Sub-Page: Office
The top of this page will NOT have a slider.  The window & shade layout is weird in this room.  There are 2 BIG solar shades, but 3 smaller + 1 BIG dimming shade spanned accross 4 windows.

Unlike the previous Shade Control Sub-Page's this page will have 2 buttons UP / STOP / DOWN for **ALL**  ⚪or⚫ shades in this Office window group. 
(All Office Solar = Shade id 36)
(All Office Dimming = Shade id 33)

In the main boy of the page there is to be 2 Rows of Boxes to send individaul UP⬆️ / STOP⏹️ / DOWN⬇️ commands
- The 1st row will be called "Office Solar" and will have 2 boxes of UP⬆️ / STOP⏹️ / DOWN⬇️ commands for Solar Shades shade id's: 34-35
- The 2nd  row will be called "Office Dimming" and will have 4 boxes of UP⬆️ / STOP⏹️ / DOWN⬇️ commands for Dimming Shades shade id's: 29-32

#### Shade Control Sub-Page: Loft
The top of the Loft sub-page will have a not toggle slider due to limitations of hardware for sending commands to all windows of this group.  

Instead **ALL** shades for the windows in this group will go up and down regardless of type.

UP / STOP / DOWN for **ALL**  shades in this Loft window group:
(All Loft shades = Shade id 48)

There are only 2 windows in this group so will have only 1 rows for loft to send individual  UP⬆️ / STOP⏹️ / DOWN⬇️ commands to each shade in the loft

- The row will be called "Loft" and have 3 shades:
	- Desk Shade Dimming: Shade id 45
	- Desk Shade Blackout: Shade id 46
	- Loft Back Window Dimming: Shade id 47
	
Below the Row will leave space for an image - I may want to upload an image with labels.


#### Music Page ("Monty's Pianobar")
This page will show an interface for interacting with `pianobar`

##### Notes on running Pianobar
- `pianobar` should be run in the background using `pianobar` & or `nohup pianobar` & to detach it from the terminal.
- To control it: `pianobar` creates a named pipe (FIFO) file (`default: ~/.config/pianobar/ctl`) when it starts. You can write commands to this file to control pianobar while it’s running, without interrupting its CLI process. This keeps the shell free.
- Example (just an example we are not committing to Flask yet!):
- ```python
# Python code in your webserver (e.g., Flask)
def send_pianobar_command(command):
    with open('/home/user/.config/pianobar/ctl', 'w') as fifo:
        fifo.write(command + '\n')

# Send pause command
send_pianobar_command('p')
# Change to station 2
send_pianobar_command('s 2')
# Next song
send_pianobar_command('n')
```
- How do we parse what is playing though, to show in the interface? Well... this can be difficult, however `pianobar` Supports an Event Command (`eventcmd`):
	- `pianobar` supports an `eventcmd` script in its config (`~/.config/pianobar/config`) that runs when events occur (e.g., song change, station change).
	- We cab configure `pianobar` to call a script that writes song/station info to a file:
	```bash
	# pianobar_event.sh
	#!/bin/bash
	if [ "$1" = "songstart" ]; then
		echo "{\"song\": \"$4\", \"artist\": \"$5\", \"station\": \"$8\"}" > /path/to/pianobar_status.json
	fi
	```
##### Monty's Pianobar Page layout & functionality

**Title**
At the top of the page will be an image of Monty the Owl wearing headphones 🦉🎧 next to the page title "Monty's Pianobar" in a music-note style typset [sort of like this one](https://www.shutterstock.com/image-vector/vector-music-note-font-alphabet-design-1950945625) - see attached image for Monty wearing headphones: `Monty_Headphones.jpg`

**On/Off Indicator**
Next to the title area will an reactive indicator whether music is playing or not.  Clicking/tapping on this will start or stop the process of connecting to the speakers, starting `pianobar`, and playing music.  Since the startup sequence can take several seconds, we should prevent the user from being able to change between ON/OFF for the music quickly with a timeout and a graphical representation of this start-up countdown or startup graphic.  Stopping the music should be instant though! (Sometimes you just want to shut it off right NOW!)
- Since the process takes a long time to start up, there should always be an "Are you Sure?" type of message that pops up before turning on or off.

**Track Information** 
Below the title area will be information about what is currently plaining with `pianobar`

I want to display the following (and I will also include the `pianobar` command used to get the info the instruction):

- Information about the song/station (`pianobar`: "i – print information about song/station")
- Information about why the song is played (`pianobar`: "e – explain why this song is played")
- Song Length & Time Remaining: Capture the total song length in the JSON file via `eventcmd` on `songstart`, as it’s static. `pianobar` provides this in the songstart event (variable `$6` or similar, check `eventcmd` docs).
	```bash
	# pianobar_event.sh
	if [ "$1" = "songstart" ]; then
  	echo "{\"song\": \"$4\", \"artist\": \"$5\", \"station\": \"$8\", \"length\": \"$6\"}" > /path/to/pianobar_status.json
	fi`
	```
	- Time Remaining: Calculate it in the frontend by:
		- Reading the song length from the JSON (e.g., 04:54).
		- Using JavaScript to track elapsed time since the song started (e.g., via a timestamp in the JSON or client-side timer).
		- The frontend handles the countdown, avoiding server-side I/O.
		- Include song length in the JSON via eventcmd and compute time remaining in the frontend with a JavaScript timer. This avoids intensive file updates and supports showing the countdown.
		- Display a countdown (e.g., 04:54 - elapsed = -01:35) updated every second in the browser.

**User interaction with player**
Below the information I want to display some interactive buttons: Love Song️ ❤️, Play ▶️, Pause ⏸, ️ Next
- Note when pause is selected it should also pause our frontend countdown timer
- Note also - these are the actions sent via the FIFO pipe instead of directly in the CLI
-  (`pianobar`: "+ – love song")
-  (`pianobar`: "P – resume playback")
-  (`pianobar`: "S – pause playback")
-  (`pianobar`: "n – next song")
	
**Change Station**
Below I want the user to have the option to change the station.  I will pre-populate the stations.  They are part of my pandora account
-  (`pianobar`: "s – change station")
- Send the s command to the FIFO file (~/.config/pianobar/ctl) to trigger the station list.
- Configure eventcmd to capture the station list output (emitted during stationfetchplaylist or similar events) and write it to a JSON file (e.g., /path/to/pianobar_stations.json).
```bash
# pianobar_event.sh
if [ "$1" = "stationfetchplaylist" ]; then
  # Capture station list (exact variable depends on pianobar event)
  echo "{\"stations\": [\"$4\", \"$5\", ...]}" > /path/to/pianobar_stations.json
fi
```

- Alternatively, run `pianobar` once on startup to dump the station list to a file via a script (Then Parse stations.txt into JSON for the webserver):
```bash
pianobar <<EOF > /path/to/pianobar_stations.txt
s
EOF`
```
- - On page load, the frontend fetches `/music/stations (served from pianobar_stations.json)`to populate the stations
- When the user selects a station, send `POST /music/control { "command": "s 2" }` to change stations.
- Fetch track info (i) after station changes to update the “Now Playing” display.
- Overwrite pianobar_stations.json on startup or when stations sync to keep it current

- At the bottom of the page have a little text note that new stations can be added from the Admin's Pandora Account




## Notes:
- Sometimes I refer to shades as "dimming" or "privacy", they mean the same thing.
- There are challenges due to `pianobar` and `control_shades.py` taking over the CLI. Run these programs in the background or as non-interactive processes.
- When the **Wake Up** sequence starts music - `pianobar` should always initiate by playing the same pre-selected station: `"Jazz Fruits Music Radio" (128737420597291214)`
- I want a menu icon located in top right that allows the user to navigate the site from HOME / Shade Control / Music Control / Weather / Away Configuration





