from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import cv2
import re
import json
from datetime import datetime

# Khởi tạo ứng dụng Flask và cấu hình các thư mục để lưu trữ video được tải lên và các chú thích
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ANNOTATIONS_FOLDER'] = 'annotations'

# Ensure upload and annotations folders exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['ANNOTATIONS_FOLDER'], exist_ok=True)

# route cơ bản
ind=None
@app.route('/')
def index():
    print("----------------> / -> index")
    return render_template('index.html')

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

    # Mở file video bằng OpenCV để trích xuất thông tin
    cap = cv2.VideoCapture(video_path)

    # Lấy số khung hình trên giây (frames per second) của video
    fps = cap.get(cv2.CAP_PROP_FPS)
    print("----------------> /upload -> upload_video -> fps: " + str(fps))

    # Lấy tổng số khung hình trong video
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print("----------------> /upload -> upload_video -> frame_count: " + str(frame_count))

    # Tính thời lượng video bằng cách chia tổng số khung hình cho FPS
    duration = frame_count / fps
    print("----------------> /upload -> upload_video -> duration: " + str(duration))

    # Giải phóng tài nguyên sau khi đã xử lý xong video
    cap.release()

    # Duyệt qua tất cả các thư mục và file trong thư mục "annotations"
    for root, dirs, files in os.walk('annotations'):
        print("----------------> /upload -> upload_video -> for_annotations")
        print(files)
        # standard.json - Đây có vẻ là file chứa định dạng chú thích mới
        if 'standard.json' in files:
            print("----------------> /upload -> upload_video -> for_annotations -> found")
            print("found")

            # Nếu tìm thấy, đặt format_type = "new" và xác định đường dẫn đến file này
            format_type="new"
            annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'standard.json')

        else:
            print("----------------> /upload -> upload_video -> for_annotations -> not found")
            # Nếu không tìm thấy, đặt format_type = None
            format_type=None

    # Xử lý trường hợp không tìm thấy file tiêu chuẩn
    if format_type==None:
        print("----------------> /upload -> upload_video -> format_type -> none")
        # Tạo đường dẫn đến file chú thích dựa trên tên file video
        annotation_path = os.path.join(app.config['ANNOTATIONS_FOLDER'], f'{video_file.filename.split(".")[0]}.json')

    # Nếu file chú thích đã tồn tại
    if os.path.exists(annotation_path):
        print("----------------> /upload -> upload_video -> annotation_path -> exist")
        with open(annotation_path, 'r') as f:
            annotations = json.load(f)

        # Xác định định dạng của file (gọi hàm determine_format())
        format_type = determine_format(annotations)
    else:
        print("----------------> /upload -> upload_video -> annotation_path -> not exist")
        # Tạo cấu trúc dữ liệu cho định dạng cũ với các trường rỗng
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
            # Ghi cấu trúc JSON vào file, định dạng với thụt lề 4 ký tự
            json.dump(annotations, f, indent=4)
        format_type = "old"  # Default format

    # Sử dụng biến toàn cục ind để lưu trữ chỉ số của video trong danh sách videos (nếu sử dụng định dạng mới)
    global ind

    # Gọi hàm add_seconds_to_events() để thêm trường "seconds" vào các chú thích (Truyền vào đường dẫn file chú thích và tên file video (không có phần mở rộng))
    index=add_seconds_to_events(annotation_path,video_file.filename.split(".")[0])

    # Lưu chỉ số vào biến toàn cục ind
    ind=index

    # Nếu đang sử dụng định dạng mới và có chỉ số hợp lệ
    if format_type=="new" and ind!=None:
        print("----------------> /upload -> upload_video -> format_type -> new")
        # Chỉ lấy chú thích của video cụ thể từ danh sách videos
        annotations  = annotations["videos"][index] 
        print("----------------> /upload -> upload_video -> format_type -> new -> " + annotations)

    # In loại dữ liệu của chú thích để debug
    print("Annotations loaded:", type(annotations))  # Debugging
   
    #  Trả về phản hồi JSON
    return jsonify({
        'filename': video_file.filename,
        'duration': duration,
        'annotations': annotations,  # Include annotations in the response
        'format': format_type  # Send the format to the client
    })


def determine_format(data):
    print("----------------> /upload -> determine_format")
    """Determine if the data follows the old or new format."""
    # Định dạng mới
    if "version" in data and "videos" in data:
        print("----------------> /upload -> determine_format -> new")
        return "new"
    # Định dạng cũ: Kiểm tra xem data có phải là một dictionary (isinstance(data, dict)) và có chứa khóa "annotations" hay không.
    elif isinstance(data, dict) and "annotations" in data:
        print("----------------> /upload -> determine_format -> old")
        return "old"
    else:
        print("----------------> /upload -> determine_format -> unknown")
        return "unknown"

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
                annotation["seconds"] = convert_game_time_to_seconds(annotation["gameTime"])
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

# Hàm này sẽ xử lý các yêu cầu HTTP POST đến đường dẫn "/save_annotations"
@app.route('/save_annotations', methods=['POST'])
def save_annotations():
    print("----------------> /save_annotations -> save_annotations")
    data = request.json

    # Trích xuất trường "filename" từ dữ liệu JSON, sử dụng phương thức get() để tránh lỗi nếu trường không tồn tại
    filename = data.get('filename')  
    annotations = data.get('annotations')
    print("----------------> /save_annotations -> save_annotations -> " + str(filename) + " & " + str(annotations))

    # Kiểm tra tính hợp lệ của dữ liệu
    if not filename or annotations is None:
        print("----------------> /save_annotations -> save_annotations -> Invalid data") 
        return jsonify({'error': 'Invalid data'}), 400


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

    # Sử dụng biến toàn cục ind để truy cập chỉ số video đã xác định trước đó (có thể từ route upload)
    global ind

    # Kiểm tra xem dữ liệu có tuân theo định dạng mới không
    if "version" in original_data and "videos" in original_data:
        print("----------------> /save_annotations -> save_annotations -> version and video") 
        # Nếu là định dạng mới: Kiểm tra xem danh sách videos có phần tử nào không
        if original_data["videos"]:
            # Cập nhật chú thích của video cụ thể tại chỉ số ind
            original_data["videos"][ind]["annotations"] = annotations
        else:
            # Nếu không có video nào: Tạo một mục mới trong danh sách videos với chú thích được cung cấp
            original_data["videos"] = [{"annotations": annotations}]
    else:
        print("----------------> /save_annotations -> save_annotations -> not version and video") 
        # Nếu là định dạng cũ: Cập nhật trực tiếp trường "annotations"
        original_data["annotations"] = annotations

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
            format_type = determine_format(annotations)  # Determine the format
            print("Annotations loaded:", annotations)

        # jsonify(): Chuyển đổi đối tượng Python thành phản hồi JSON
        return jsonify({
            'annotations': annotations,
            'format': format_type  # Send the format to the client
        })
    
    # Nếu file không tồn tại, trả về một mảng chú thích rỗng
    # Mặc định sử dụng định dạng "old" khi không có file
    return jsonify({'annotations': [], 'format': 'old'})  # Default to old format if no file exists

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)