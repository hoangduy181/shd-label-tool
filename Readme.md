Football Video Annotation Tool
Show Image
This repository contains a web-based tool for annotating football (soccer) videos. The tool allows users to upload videos, add annotations for specific events (e.g., goals, fouls, penalties), and save these annotations for later use. The annotations are displayed as markers on the video seek bar, similar to YouTube's chapter markers.
This application is intended to be used with SoccerNet annotations to ease the process of event annotations. For more information, visit SoccerNet.
Demo
demo.webm
Features

Video Upload: Upload football videos in common formats (e.g., MP4, AVI).
Annotation Management:

Add annotations for specific events (e.g., goals, fouls, penalties)
Edit or delete existing annotations
Filter annotations by event type


Save and Load Annotations: Save annotations to a JSON file and load them when reopening the video

Technologies Used

Frontend:

HTML, CSS, JavaScript
Bootstrap for styling
jQuery for DOM manipulation and AJAX requests


Backend:

Flask (Python) for handling file uploads and serving annotations


Video Processing:

OpenCV for extracting video metadata (e.g., duration)



Installation
Prerequisites

Python 3.x

Steps

Clone the Repository:
bashCopygit clone https://github.com/ibrahimabdelaal/Soccer-event-annotation-tool.git
cd football-video-annotation-tool

Install Dependencies:
bashCopypip install -r requirements.txt

Prepare Your Files:
File Organization

Place your video files in the uploads folder
Store annotation files in the annotations folder

Annotation Formats
The tool supports two annotation formats:

Basic Format (Legacy)

Create a JSON file with the same name as your video
Example: For match1.mp4, create match1.json in the annotations folder
Reference: See old_structure.json for format details


Standard Soccer Net Format

Uses the OpenSportsLab standard format
Place your annotations in standard.json in the annotations folder
The tool automatically:

Detects if standard.json exists
Finds annotations matching your video filename


Compatible with OSL-ActionSpotting
Reference: See standard.json for format details



⚠️ Important Note:

If standard.json exists in the annotations folder, the tool will always use it, even if you have corresponding files in the basic format
To use the basic format, ensure standard.json is removed from the annotations folder

Project Structure Example
Copyproject/
├── uploads/
│   ├── match1.mp4
│   └── match2.mp4
└── annotations/
    ├── match1.json     (Basic format)
    ├── match2.json     (Basic format)
    └── standard.json   (Soccer Net format)


Running the Application
To start the application, run the app.py file:
bashCopypython app.py
Usage
Upload a Video

Click the "Choose File" button to upload a video
Once uploaded, the video will be displayed in the player
Make sure that the corresponding annotation file is located in annotations folder with the same name as your video
See the structure of the JSON annotation file the app works with (example can be found in annotations_output.json)

Add Annotations

Use the "Add Event" button to open the annotation modal
Fill in the event details (e.g., time, label, team, visibility) and save the annotation

View Annotations

Annotations are displayed as markers on the video seek bar
Hover over a marker to see the event label
Click a marker to seek to the corresponding time in the video

Save Annotations

Click the "Save Annotations" button to save the annotations to a JSON file

Load Annotations

When reopening a video, annotations will be loaded automatically if a corresponding JSON file exists