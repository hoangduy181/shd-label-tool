import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import cv2
from PIL import Image, ImageTk
import json
import threading

class VideoAnnotationTool:
    def __init__(self, root, video_path, events):
        self.root = root
        self.video_path = video_path
        self.events = events
        self.cap = cv2.VideoCapture(video_path)
        if not self.cap.isOpened():
            messagebox.showerror("Error", "Could not open video file.")
            return
        self.current_frame = None
        self.paused = False
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.setup_gui()

        # Start video playback in a separate thread
        self.play_thread = threading.Thread(target=self.play_video, daemon=True)
        self.play_thread.start()

    def setup_gui(self):
        self.root.title("Video Annotation Tool")

        # Main container
        self.main_frame = ttk.Frame(self.root, padding="10")
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        # Video display
        self.video_label = ttk.Label(self.main_frame)
        self.video_label.grid(row=0, column=0, columnspan=3, pady=10)

        # Event list
        self.event_frame = ttk.LabelFrame(self.main_frame, text="Events", padding="10")
        self.event_frame.grid(row=1, column=0, sticky="nsew", padx=5, pady=5)

        self.event_listbox = tk.Listbox(self.event_frame, width=50, height=10)
        self.event_listbox.pack(fill=tk.BOTH, expand=True)
        for event in self.events:
            self.event_listbox.insert(tk.END, event['description'])
        self.event_listbox.bind('<<ListboxSelect>>', self.on_event_select)

        # Progress bar
        self.progress_frame = ttk.LabelFrame(self.main_frame, text="Video Progress", padding="10")
        self.progress_frame.grid(row=2, column=0, columnspan=3, sticky="ew", padx=5, pady=5)

        self.progress = ttk.Scale(self.progress_frame, from_=0, to=self.total_frames, orient=tk.HORIZONTAL, command=self.on_progress_change)
        self.progress.pack(fill=tk.X, expand=True)

        # Control buttons
        self.control_frame = ttk.Frame(self.main_frame, padding="10")
        self.control_frame.grid(row=3, column=0, columnspan=3, sticky="ew", pady=5)

        self.pause_button = ttk.Button(self.control_frame, text="Pause", command=self.toggle_pause)
        self.pause_button.pack(side=tk.LEFT, padx=5)

        self.add_event_button = ttk.Button(self.control_frame, text="Add Event", command=self.add_event)
        self.add_event_button.pack(side=tk.LEFT, padx=5)

        self.edit_event_button = ttk.Button(self.control_frame, text="Edit Event", command=self.edit_event)
        self.edit_event_button.pack(side=tk.LEFT, padx=5)

        self.delete_event_button = ttk.Button(self.control_frame, text="Delete Event", command=self.delete_event)
        self.delete_event_button.pack(side=tk.LEFT, padx=5)

        self.save_button = ttk.Button(self.control_frame, text="Save Annotations", command=self.save_annotations)
        self.save_button.pack(side=tk.LEFT, padx=5)

    def play_video(self):
        while True:
            if not self.paused:
                ret, frame = self.cap.read()
                if not ret:
                    break  # Stop if the video ends
                self.current_frame = frame
                try:
                    # Convert the frame to RGB and display it
                    img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                    imgtk = ImageTk.PhotoImage(image=img)
                    self.video_label.imgtk = imgtk
                    self.video_label.configure(image=imgtk)
                    self.progress.set(int(self.cap.get(cv2.CAP_PROP_POS_FRAMES)))
                except Exception as e:
                    print(f"Error processing frame: {e}")
                    break
            self.root.update_idletasks()
            self.root.after(30)

    def toggle_pause(self):
        self.paused = not self.paused
        self.pause_button.config(text="Resume" if self.paused else "Pause")

    def on_event_select(self, event):
        selected_index = self.event_listbox.curselection()
        if selected_index:
            selected_index = selected_index[0]
            selected_event = self.events[selected_index]
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, selected_event['frame'])
            self.progress.set(selected_event['frame'])

    def on_progress_change(self, value):
        if not self.paused:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, int(float(value)))

    def add_event(self):
        frame_number = int(self.cap.get(cv2.CAP_PROP_POS_FRAMES))
        description = simpledialog.askstring("Add Event", "Enter event description:")
        if description:
            self.events.append({'description': description, 'frame': frame_number})
            self.event_listbox.insert(tk.END, description)

    def edit_event(self):
        selected_index = self.event_listbox.curselection()
        if selected_index:
            selected_index = selected_index[0]
            new_description = simpledialog.askstring("Edit Event", "Enter new description:", initialvalue=self.events[selected_index]['description'])
            if new_description:
                self.events[selected_index]['description'] = new_description
                self.event_listbox.delete(selected_index)
                self.event_listbox.insert(selected_index, new_description)
                self.event_listbox.selection_set(selected_index)

    def delete_event(self):
        selected_index = self.event_listbox.curselection()
        if selected_index:
            selected_index = selected_index[0]
            self.event_listbox.delete(selected_index)
            del self.events[selected_index]

    def save_annotations(self):
        with open("annotations.json", "w") as f:
            json.dump(self.events, f, indent=4)
        messagebox.showinfo("Save Annotations", "Annotations saved successfully!")

if __name__ == "__main__":
    root = tk.Tk()
    video_path = "match.mp4"
    events = [
        {'description': 'Foul at 00:05:23', 'frame': 323},
        {'description': 'Offside at 00:10:45', 'frame': 645},
        # Add more events here
    ]
    app = VideoAnnotationTool(root, video_path, events)
    root.mainloop()