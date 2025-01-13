from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import cv2
import json

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ANNOTATIONS_FOLDER'] = 'annotations'

# Ensure upload and annotations folders exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['ANNOTATIONS_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file uploaded'}), 400

    video_file = request.files['video']
    if video_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    # Save the video file
    video_path = os.path.join(app.config['UPLOAD_FOLDER'], video_file.filename)
    video_file.save(video_path)

    # Get video duration using OpenCV
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps
    cap.release()

    # Load annotations for the video
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{video_file.filename.split(".")[0]}.json')
    add_seconds_to_events(annotation_path)
    if os.path.exists(annotation_path):
        with open(annotation_path, 'r') as f:
            annotations = json.load(f)
    else:
        annotations = []

    print("Annotations loaded:", annotations)  # Debugging

    return jsonify({
        'filename': video_file.filename,
        'duration': duration,
        'annotations': annotations  # Include annotations in the response
    })
import json
import re

import json
import re
from collections import OrderedDict

def add_seconds_to_events(file_path):
    def convert_game_time_to_seconds(game_time):
        """Convert a game time string to total seconds."""
        # Parse "half - MM:SS.mmm" (e.g., "2 - 02:41.360")
        match = re.match(r"(\d+) - (\d+):(\d+)\.(\d+)", game_time)
        if not match:
            return None  # Return None if the format is invalid
        half, minutes, seconds, milliseconds = map(int, match.groups())
        total_seconds = 0 + minutes * 60 + seconds + milliseconds / 1000
        return total_seconds

    # Read the JSON file, preserving order
    with open(file_path, 'r') as file:
        data = json.load(file, object_pairs_hook=OrderedDict)

    # Check if the root is a list or a dictionary
    if isinstance(data, list):
        # Iterate through each item if it's a list
        for item in data:
            if "annotations" in item:
                for annotation in item["annotations"]:
                    # Skip if 'seconds' field already exists
                    if "seconds" not in annotation and "gameTime" in annotation:
                        annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
    elif isinstance(data, dict):
        # Process directly if it's a dictionary
        for annotation in data.get("annotations", []):
            # Skip if 'seconds' field already exists
            if "seconds" not in annotation and "gameTime" in annotation:
                annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
    else:
        raise ValueError("Unsupported JSON structure: expected a list or a dictionary at the root.")

    # Overwrite the JSON file with updated data, preserving structure
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=4, ensure_ascii=False)

    print(f"File '{file_path}' has been updated successfully!")







@app.route('/save_annotations', methods=['POST'])
def save_annotations():
    data = request.json
    filename = data.get('filename')  # Get the filename from the request
    annotations = data.get('annotations')

    if not filename or annotations is None:
        return jsonify({'error': 'Invalid data'}), 400

    # Define the path to save the file
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{filename.split(".")[0]}.json')

    # Check if the file already exists
    if os.path.exists(annotation_path):
        # Load the existing file to preserve the original structure
        with open(annotation_path, 'r') as f:
            original_data = json.load(f)
    else:
        # Create a new structure if the file doesn't exist
        original_data = {
            "UrlLocal": "",
            "UrlYoutube": "",
            "gameHomeTeam": "",
            "gameAwayTeam": "",
            "gameDate": "",
            "gameScore": "",
            "annotations": []
        }

    # Update the annotations in the original structure
    original_data['annotations'] = annotations

    # Save the updated structure back to the file
    with open(annotation_path, 'w') as f:
        json.dump(original_data, f, indent=4)

    return jsonify({'message': 'Annotations saved successfully'})


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/get_annotations/<filename>')
def get_annotations(filename):
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{filename.split(".")[0]}.json')
    if os.path.exists(annotation_path):
        with open(annotation_path, 'r') as f:
            annotations = json.load(f)
            print("Annotations loaded:", annotations)
        return jsonify(annotations)
    return jsonify([])

if __name__ == '__main__':
    app.run(debug=True)