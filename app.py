from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import cv2
import re
import json
from datetime import datetime
import numpy as np

# Khởi tạo ứng dụng Flask và cấu hình các thư mục để lưu trữ video được tải lên và các chú thích
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ANNOTATIONS_FOLDER'] = 'annotations'
app.config['METADATA_FOLDER'] = 'metadata'

# Ensure upload and annotations folders exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['ANNOTATIONS_FOLDER'], exist_ok=True)
os.makedirs(app.config['METADATA_FOLDER'], exist_ok=True)

# constants:
label_to_event = {
    "ball_out_of_play": "Ball out of play",
    "throw_in": "Throw-in",
    "foul": "Foul",
    "indirect_free_kick": "Indirect free-kick",
    "clearance": "Clearance",
    "shots_on_target": "Shots on target",
    "shots_off_target": "Shots off target",
    "corner": "Corner",
    "substitution": "Substitution",
    "kick_off": "Kick-off",
    "direct_free_kick": "Direct free-kick",
    "offside": "Offside",
    "yellow_card": "Yellow card",
    "goal": "Goal",
    "penalty": "Penalty",
    "red_card": "Red card",
    "yellow_red_card": "Yellow->red card"
}

reversed_label_to_event = {v: k for k, v in label_to_event.items()}
print("reversed_label_to_event",reversed_label_to_event)
# route cơ bản
# ind=None

@app.route('/')
def index():
    print("----------------> / -> index")
    # Get list of available videos
    videos = []
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        if filename.endswith(('.mp4', '.webm', '.avi', '.mov', '.mkv')):
            videos.append({
                'filename': filename,
                'path': f'/uploads/{filename}'
            })
    return render_template('index.html', videos=videos)

@app.route('/get_videos')
def get_videos():
    """Get list of available videos"""
    videos = []
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        if filename.endswith(('.mp4', '.webm', '.avi', '.mov', '.mkv')):
            videos.append({
                'filename': filename,
                'path': f'/uploads/{filename}'
            })
    return jsonify(videos)

def _format_annotation_for_webapp(annotation: dict) -> dict:
    
    return {
        "label": reversed_label_to_event.get(annotation.get("label")),
        # "position": annotation["position"],
        "team": annotation["team"],
        "visibility": annotation["visibility"],
        # "gameTime": annotation["gameTime"],
        "seconds": int(annotation["position"])/1000
    }

@app.route('/select_video/<filename>')
def select_video(filename):
    """Handle video selection from available videos"""
    video_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    print("----------------> /select_video -> select_video -> " + video_path)
    if not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404

    # Check if metadata exists
    video_name = os.path.splitext(filename)[0]
    metadata_path = os.path.join(app.config['METADATA_FOLDER'], f'{video_name}.json')
    
    if not os.path.exists(metadata_path):
        # Create metadata if it doesn't exist
        metadata = extract_video_metadata(video_path)
        if metadata is None:
            return jsonify({'error': 'Failed to process video'}), 500
    else:
        # Load existing metadata
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

    # Get annotations
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{video_name}.json')
    
    if os.path.exists(annotation_path):
        with open(annotation_path, 'r') as f:
            # load annotations từ BE lên FE
            annotations = json.load(f)
            annotations['annotations'] = [_format_annotation_for_webapp(annotation) for annotation in annotations['annotations']]
    else:
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

    global ind
    index = add_seconds_to_events(annotation_path, video_name)
    ind = index
    print("----------------> /select_video -> select_video -> annotations -> " + str(annotations))
    return jsonify({
        'filename': filename,
        'duration': metadata['duration'],
        'fps': metadata['fps'],
        'frame_count': metadata['frame_count'],
        'annotations': annotations,
    })

def extract_video_metadata(video_path):
    """Extract video metadata and frames using OpenCV"""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None

    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = frame_count / fps

    # Create metadata dictionary
    metadata = {
        'fps': fps,
        'frame_count': frame_count,
        'width': width,
        'height': height,
        'duration': duration,
        # 'frames': []
    }
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    print("----------------> /select_video -> extract_video_metadata -> video_name -> " + video_name)
    # save to metadata folder
    metadata_path = os.path.join(app.config['METADATA_FOLDER'], f'{video_name}.json')
    print("----------------> /select_video -> extract_video_metadata -> metadata_path -> " + metadata_path)
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=4)
    
    cap.release()
    return metadata

# route tải lên video
@app.route('/upload', methods=['POST'])
def upload_video():
    print("----------------> /upload -> upload_video")
    # Kiểm tra xem trong dữ liệu form được gửi lên có trường "video" hay không
    if 'video' not in request.files:
        print("----------------> /upload -> upload_video -> No video file uploaded")
        return jsonify({'error': 'No video file uploaded'}), 400

    video_file = request.files['video']

    # Xảy ra khi nhấn nút upload mà không chọn file
    if video_file.filename == '':   
        print("----------------> /upload -> upload_video -> No selected file")
        return jsonify({'error': 'No selected file'}), 400

    # Tạo đường dẫn đến folder upload và Lưu file upload vào folder upload
    video_path = os.path.join(app.config['UPLOAD_FOLDER'], video_file.filename)
    print("----------------> /upload -> upload_video -> " + video_path)
    video_file.save(video_path)

    # Extract video metadata and frames
    metadata = extract_video_metadata(video_path)
    if metadata is None:
        return jsonify({'error': 'Failed to process video'}), 500

    # Get annotations
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{video_file.filename.split(".")[0]}.json')

    if os.path.exists(annotation_path):
        with open(annotation_path, 'r') as f:
            # load annotations từ BE lên FE
            annotations = json.load(f)
            print("----------------> /upload -> upload_video -> annotations -> " + str(annotations))
            annotations = [_format_annotation_for_webapp(annotation) for annotation in annotations['annotations']]
    else:
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

    # Sử dụng biến toàn cục ind để lưu trữ chỉ số của video trong danh sách videos (nếu sử dụng định dạng mới)
    global ind

    # Gọi hàm add_seconds_to_events() để thêm trường "seconds" vào các chú thích (Truyền vào đường dẫn file chú thích và tên file video (không có phần mở rộng))
    index=add_seconds_to_events(annotation_path,video_file.filename.split(".")[0])

    # Lưu chỉ số vào biến toàn cục ind

    # In loại dữ liệu của chú thích để debug
    print("Annotations loaded:", type(annotations))  # Debugging
   
    #  Trả về phản hồi JSON
    return jsonify({
        'filename': video_file.filename,
        'duration': metadata['duration'],
        'fps': metadata['fps'],
        'frame_count': metadata['frame_count'],
        'annotations': annotations,  # Include annotations in the response
    })


def determine_format(data):
    print("----------------> /upload -> determine_format")
    """Determine if the data follows the old or new format."""
    # Định dạng mới
    # if "version" in data and "videos" in data:
    #     print("----------------> /upload -> determine_format -> new")
    #     return "new"
    # # Định dạng cũ: Kiểm tra xem data có phải là một dictionary (isinstance(data, dict)) và có chứa khóa "annotations" hay không.
    # elif isinstance(data, dict) and "annotations" in data:
    #     print("----------------> /upload -> determine_format -> old")
    #     return "old"
    # else:
    #     print("----------------> /upload -> determine_format -> unknown")
    #     return "unknown"
    return "new"

# Hàm này thêm trường "seconds" vào các chú thích (annotations) trong file JSON, chuyển đổi thời gian trò chơi sang giây.
def add_seconds_to_events(file_path,filename):
    print("----------------> /upload -> add_seconds_to_events")
    def convert_game_time_to_seconds(game_time):
        print("----------------> /upload -> add_seconds_to_events -> convert_game_time_to_seconds")
        """Convert a game time string to total seconds."""
       
        # ví dụ: "1 - 00:15:30"
        match2=re.match(r"(\d+) - (\d{2}):(\d{2}):(\d{2})", game_time)
        
        print("----------------> /upload -> add_seconds_to_events -> convert_game_time_to_seconds -> " + match2)
        if match2:
            print("match2",match2)
            # Chuyển đổi các nhóm được trích xuất thành số nguyên
            half, hour, minutes, seconds = map(int, match2.groups())
            total_seconds = hour*60*60 + minutes * 60 + seconds   # Assuming 45 minutes per half  (half - 1) * 45 * 60
            print("----------------> /upload -> add_seconds_to_events -> convert_game_time_to_seconds -> match2 -> " +str(total_seconds))
        else :
            print("----------------> /upload -> add_seconds_to_events -> convert_game_time_to_seconds -> not match2")
            # (ví dụ: "1 - 15:30"    
            match = re.match(r"(\d+) - (\d+):(\d+)", game_time)
            if not match and not match2:
                return None  # Return None if the format is invalid
            if match:
                # Chuyển đổi các nhóm được trích xuất thành số nguyên
                half, minutes, seconds = map(int, match.groups())
                total_seconds = 0 + minutes * 60 + seconds   # Assuming 45 minutes per half  (half - 1) * 45 * 60
            print("----------------> /upload -> add_seconds_to_events -> convert_game_time_to_seconds -> not match2 -> " +str(total_seconds))

        return total_seconds

    # Đọc file json
    with open(file_path, 'r') as file:
        data = json.load(file)

    # Xử lý định dạng mới 
    # Khởi tạo biến index là None, sẽ được gán giá trị nếu tìm thấy video phù hợp
    index = None      

    # Kiểm tra xem dữ liệu có tuân theo định dạng mới không (có cả khóa "version" và "videos")
    if "version" in data and "videos" in data:  
        print("----------------> /upload -> add_seconds_to_events -> version and videos")
        videos_list=[]

        # Lặp qua tất cả các video trong danh sách, lấy cả chỉ số và đối tượng video
        for idx,video in enumerate(data["videos"]):
            print("----------------> /upload -> add_seconds_to_events -> version and videos -> for")
            # Trích xuất tên file từ đường dẫn của video
            vid_name=video['path'].split("/")[-1].split(".")[0]
            
            # Kiểm tra xem tên file có khớp với tham số filename không
            if filename==vid_name:
                index=idx
                print(vid_name)

                # Lặp qua tất cả các chú thích của video
                for annotation in video.get("annotations", []):
                    # Kiểm tra xem chú thích đã có trường "seconds" chưa và có trường "gameTime" không
                    if "seconds" not in annotation and "gameTime" in annotation:
                        print(annotation["gameTime"])

                        # Thêm trường "seconds" bằng cách chuyển đổi gameTime
                        annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
                break   
                 
    # Xử lý định dạng cũ
    # Kiểm tra xem dữ liệu có tuân theo định dạng cũ không (là dict và có khóa "annotations")
    elif isinstance(data, dict) and "annotations" in data:
        print("----------------> /upload -> add_seconds_to_events -> old")

        for annotation in data["annotations"]:
            if "seconds" not in annotation and "gameTime" in annotation:
                # Thêm trường "seconds"
                # annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
                annotation["seconds"] = int(annotation["position"])/1000
    else:
        print("----------------> /upload -> add_seconds_to_events -> unknown")
        # Nếu dữ liệu không khớp với bất kỳ định dạng nào, ném ngoại lệ ValueError với thông báo lỗi
        raise ValueError("Unsupported JSON structure: expected a specific format.")

    # Mở file ở chế độ ghi, ghi đè lên nội dung cũ
    with open(file_path, 'w') as file:
        # Ghi đối tượng Python thành JSON với định dạng đẹp (ensure_ascii=False: Cho phép lưu các ký tự Unicode trực tiếp, không chuyển đổi thành mã ASCII)
        json.dump(data, file, indent=4, ensure_ascii=False)

    print(f"File '{file_path}' has been updated successfully!")
    return index

# input:
# {"gameTime":"1 - 16:33.740","label":"indirect_free_kick","seconds":993.74,"team":"home","visibility":"visible"} frame: 24844

# output:
# {
#     "gameTime": "2 - 26:10",
#     "label": "Substitution",
#     "position": "1570785",
#     "team": "home",
#     "visibility": "visible"
# }

# save from FE to BE
def _format_annotation(annotation: dict) -> dict:
    time = annotation["gameTime"].split(" - ")[1]
    position = int(int(time[0:2])*60*1000) + int(int(time[3:5])*1000) + int(time[6:])
    print(f"----------------> /upload -> _format_annotation -> time -> {int(time[0:2])*60*1000} ___ {int(time[3:5])*1000} ___ {int(time[6:])} => {position}")
    return {
        "label": label_to_event[annotation["label"]],
        "position": str(int(annotation["seconds"]*1000)),
        "team": annotation["team"],
        "visibility": annotation["visibility"],
        "gameTime": annotation["gameTime"],
        # "seconds": annotation["seconds"]
    }

def _format_annotations(annotations: list[dict]) -> list[dict]:
    formatted_annotations = [
        _format_annotation(annotation)
        for annotation in annotations
    ]
    return formatted_annotations
    

# Hàm này sẽ xử lý các yêu cầu HTTP POST đến đường dẫn "/save_annotations"
@app.route('/save_annotations', methods=['POST'])
def save_annotations():
    print("----------------> /save_annotations -> save_annotations")
    data: dict = request.json

    # Trích xuất trường "filename" từ dữ liệu JSON, sử dụng phương thức get() để tránh lỗi nếu trường không tồn tại
    filename = data.get('filename')  
    annotations = data.get('annotations')
    print("----------------> /save_annotations -> save_annotations -> " + str(filename) + " & " + str(annotations))

    # Kiểm tra tính hợp lệ của dữ liệu
    if not filename or annotations is None:
        print("----------------> /save_annotations -> save_annotations -> Invalid data") 
        return jsonify({'error': 'Invalid data'}, 400)


    # Tạo đường dẫn đến file chú thích dựa trên tên file video
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{filename.split(".")[0]}.json')

    
    # Kiểm tra xem file chú thích đã tồn tại chưa
    if os.path.exists(annotation_path):
        print("----------------> /save_annotations -> save_annotations -> exists file annotation") 
        # Nếu file tồn tại:
        # with open(annotation_path, 'r') as f:: Mở file ở chế độ đọc
        # original_data = json.load(f): Đọc nội dung JSON để giữ nguyên cấu trúc gốc
        with open(annotation_path, 'r') as f:
            original_data = json.load(f)
    else:
        print("----------------> /save_annotations -> save_annotations -> not exists file annotation") 
        # Nếu file chưa tồn tại:
        # Tạo cấu trúc mặc định cho định dạng cũ với các trường rỗng
        # Cấu trúc này bao gồm các thông tin về URL, đội, ngày, tỷ số và một mảng chú thích rỗng
        original_data = {
            "UrlLocal": "",
            "UrlYoutube": "",
            "gameHomeTeam": "",
            "gameAwayTeam": "",
            "gameDate": "",
            "gameScore": "",
            "annotations": []
        }
    # Tìm match metadata của trận và lưu vào các mục của file chú thích
    metadata_path = os.path.join(app.config['METADATA_FOLDER'], f'{filename.split(".")[0]}.json')
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
        matchInfoLoaded = metadata.get("matchInfo", None)
        if not matchInfoLoaded:
            print("----------------> /save_annotations -> save_annotations -> matchInfoLoaded -> not found")
            return jsonify({'error': 'Match info not found'}), 400
        
        urlLocalLoaded = matchInfoLoaded.get("urlLocal", "") 
        print("----------------> /save_annotations -> save_annotations -> urlLocalLoaded -> " + urlLocalLoaded, os.path.basename(urlLocalLoaded))
        
        # check if name of upload folder is in path, if not insert
        if app.config['UPLOAD_FOLDER'] not in urlLocalLoaded:
            print("----------------> /save_annotations -> save_annotations -> urlLocalLoaded -> not in upload folder")
            urlLocalLoaded = os.path.join(app.config['UPLOAD_FOLDER'], urlLocalLoaded)
        original_data["UrlLocal"] = urlLocalLoaded
        original_data["gameHomeTeam"] = matchInfoLoaded.get("gameHomeTeam", "")
        original_data["gameAwayTeam"] = matchInfoLoaded.get("gameAwayTeam", "")
        original_data["gameDate"] = matchInfoLoaded.get("gameDate", "")
        original_data["gameScore"] = matchInfoLoaded.get("gameScore", "")


    # Nếu là định dạng cũ: Cập nhật trực tiếp trường "annotations"    
    print("----------------> /save_annotations -> save_annotations -> not version and video") 
    # Nếu là định dạng cũ: Cập nhật trực tiếp trường "annotations"
    formated_annotations = _format_annotations(annotations)
    original_data["annotations"] = formated_annotations
    
    # Lưu dữ liệu đã cập nhật và trả về phản hồi
    with open(annotation_path, 'w') as f:
        json.dump(original_data, f, indent=4)

    return jsonify({'message': 'Annotations saved successfully'})

# Hàm này tạo một endpoint cho phép truy cập các file video đã tải lên, cho phép client (trình duyệt hoặc frontend) có thể trực tiếp phát các video.
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    print("----------------> /uploads/<filename> -> uploaded_file") 
    # send_from_directory(): Một hàm tiện ích của Flask để phục vụ file tĩnh từ một thư mục cụ thể
    # app.config['UPLOAD_FOLDER']: Đường dẫn đến thư mục lưu trữ các file đã tải lên (đã được cấu hình là "uploads")
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# Hàm này tạo một endpoint để lấy dữ liệu chú thích cho một file video cụ thể, giúp client hiển thị các chú thích đã lưu trước đó.
@app.route('/get_annotations/<filename>')
def get_annotations(filename):
    print("----------------> /get_annotations/<filename> -> get_annotations") 
    # app.config['ANNOTATIONS_FOLDER']: Đường dẫn đến thư mục lưu trữ chú thích (đã cấu hình là "annotations")
    annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{filename.split(".")[0]}.json')

    # Kiểm tra xem file chú thích có tồn tại không
    if os.path.exists(annotation_path):
        print("----------------> /get_annotations/<filename> -> get_annotations -> exist annotation_path") 

        # Nếu tồn tại:
        # Mở file và đọc nội dung JSON
        # Xác định định dạng bằng hàm determine_format()
        # In thông tin chú thích để debug
        with open(annotation_path, 'r') as f:
            annotations = json.load(f)
            print("Annotations loaded:", annotations)

        # jsonify(): Chuyển đổi đối tượng Python thành phản hồi JSON
        return jsonify({
            'annotations': annotations,
        })
    
    # Nếu file không tồn tại, trả về một mảng chú thích rỗng
    # Mặc định sử dụng định dạng "old" khi không có file
    return jsonify({'annotations': []})  # Default to old format if no file exists

@app.route('/get_frame/<video_name>/<frame_number>')
def get_frame(video_name, frame_number):
    """Serve a specific frame image"""
    frame_path = os.path.join(app.config['METADATA_FOLDER'], video_name, f'frame_{int(frame_number):06d}.jpg')
    if os.path.exists(frame_path):
        return send_from_directory(os.path.dirname(frame_path), os.path.basename(frame_path))
    return jsonify({'error': 'Frame not found'}), 404

@app.route('/get_video_metadata/<video_name>')
def get_video_metadata(video_name):
    """Get metadata for a specific video"""
    metadata_path = os.path.join(app.config['METADATA_FOLDER'], f'{video_name}.json')
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r') as f:
            return jsonify(json.load(f))
    return jsonify({'error': 'Metadata not found'}), 404

@app.route('/save_metadata', methods=['POST'])
def save_metadata():
    """Save video metadata including match information"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        metadata = data.get('metadata')

        if not filename or not metadata:
            return jsonify({'error': 'Missing filename or metadata'}), 400

        video_name = os.path.splitext(filename)[0]
        metadata_path = os.path.join(app.config['METADATA_FOLDER'], f'{video_name}.json')

        # Save metadata
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=4)

        return jsonify({'message': 'Metadata saved successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)