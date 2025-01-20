from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import cv2
import re
import json
from datetime import datetime

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ANNOTATIONS_FOLDER'] = 'annotations'

# Ensure upload and annotations folders exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['ANNOTATIONS_FOLDER'], exist_ok=True)


ind=None
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
    for root, dirs, files in os.walk('annotations'):
        print(files)
        if 'standard.json' in files:
            print("found")
            format_type="new"
            annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'standard.json')

        else:
            format_type=None


    if format_type==None:
          # Define the path to save the file
           annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{video_file.filename.split(".")[0]}.json')

    
    if os.path.exists(annotation_path):
        with open(annotation_path, 'r') as f:
            annotations = json.load(f)
        format_type = determine_format(annotations)  # Determine the format
    else:
        # Default to the old format if no annotation file exists
        annotations = {
            "UrlLocal": "",
            "UrlYoutube": "",
            "gameHomeTeam": "",
            "gameAwayTeam": "",
            "gameDate": "",
            "gameScore": "",
            "annotations": []
        }
        with open(annotation_path, 'w') as f:
            json.dump(annotations, f, indent=4)
        format_type = "old"  # Default format

    # Add 'seconds' field to annotations
    global ind
    index=add_seconds_to_events(annotation_path,video_file.filename.split(".")[0])
    ind=index
    if format_type=="new" and ind!=None:
         annotations  = annotations["videos"][index] 

    print("Annotations loaded:", type(annotations))  # Debugging
   

    return jsonify({
        'filename': video_file.filename,
        'duration': duration,
        'annotations': annotations,  # Include annotations in the response
        'format': format_type  # Send the format to the client
    })

def determine_format(data):
    """Determine if the data follows the old or new format."""
    if "version" in data and "videos" in data:
        return "new"
    elif isinstance(data, dict) and "annotations" in data:
        return "old"
    else:
        return "unknown"

def add_seconds_to_events(file_path,filename):
    def convert_game_time_to_seconds(game_time):
        """Convert a game time string to total seconds."""
        match = re.match(r"(\d+) - (\d+):(\d+)", game_time)
        if not match:
            return None  # Return None if the format is invalid
        half, minutes, seconds = map(int, match.groups())
        total_seconds = 0 + minutes * 60 + seconds   # Assuming 45 minutes per half  (half - 1) * 45 * 60
        return total_seconds

    # Read the JSON file
    with open(file_path, 'r') as file:
        data = json.load(file)

    # Handle the new format
    index=None
    if "version" in data and "videos" in data:
        videos_list=[]
        for idx,video in enumerate(data["videos"]):
            vid_name=video['path'].split("/")[-1].split(".")[0]
            
            if filename==vid_name:
                    index=idx
                    print(vid_name)
                    for annotation in video.get("annotations", []):
                        if "seconds" not in annotation and "gameTime" in annotation:
                            print(annotation["gameTime"])
                            annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
                    break        
    # Handle the old format
    elif isinstance(data, dict) and "annotations" in data:
        for annotation in data["annotations"]:
            if "seconds" not in annotation and "gameTime" in annotation:
                annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
    else:
        raise ValueError("Unsupported JSON structure: expected a specific format.")

    # Overwrite the JSON file with updated data
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=4, ensure_ascii=False)

    print(f"File '{file_path}' has been updated successfully!")
    return index

@app.route('/save_annotations', methods=['POST'])
def save_annotations():
    data = request.json
    filename = data.get('filename')  # Get the filename from the request
    annotations = data.get('annotations')

    if not filename or annotations is None:
        return jsonify({'error': 'Invalid data'}), 400
    
    #search for the standard annotion file of the new soccerNet database
    


    # Define the path to save the file
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{filename.split(".")[0]}.json')

    # Check if the file already exists
    if os.path.exists(annotation_path):
        # Load the existing file to preserve the original structure
        with open(annotation_path, 'r') as f:
            original_data = json.load(f)
    else:
        # Default to the old format if the file doesn't exist
        original_data = {
            "UrlLocal": "",
            "UrlYoutube": "",
            "gameHomeTeam": "",
            "gameAwayTeam": "",
            "gameDate": "",
            "gameScore": "",
            "annotations": []
        }

    # Determine the format of the existing file
    global ind
    if "version" in original_data and "videos" in original_data:
        # New format: Update annotations in the first video's annotations list
        if original_data["videos"]:
            original_data["videos"][ind]["annotations"] = annotations
        else:
            # If no videos exist, create a new video entry
            original_data["videos"] = [{"annotations": annotations}]
    else:
        # Old format: Update the annotations directly
        original_data["annotations"] = annotations

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
            format_type = determine_format(annotations)  # Determine the format
            print("Annotations loaded:", annotations)
        return jsonify({
            'annotations': annotations,
            'format': format_type  # Send the format to the client
        })
    return jsonify({'annotations': [], 'format': 'old'})  # Default to old format if no file exists

if __name__ == '__main__':
    app.run(debug=True)