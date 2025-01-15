$(document).ready(function () {
    // Initialize variables
    const videoPlayer = document.getElementById('videoPlayer');
    let videoFile = null;
    let annotations = [];
    let isSeeking = false;

    // Function to convert gameTime to seconds
    function parseGameTimeToSeconds(gameTime) {
        const [half, time] = gameTime.split(' - ');
        const [minutes, seconds] = time.split(':');
        const totalSeconds = parseFloat(minutes) * 60 + parseFloat(seconds);
        return half === '2' ? totalSeconds + (45 * 60) : totalSeconds;
    }

    // Function to convert seconds to gameTime format
    function convertSecondsToGameTime(seconds) {
        const half = seconds < 2700 ? '1' : '2';
        const minutes = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(3);
        return `${half} - ${String(minutes).padStart(2, '0')}:${String(secs).padStart(6, '0')}`;
    }

    // Function to get color for an event type
    function getEventColor(label) {
        const colors = {
            'Kickoff': '#FF5733', 'Shot': '#33FF57', 'Goal': '#3357FF', 'Foul': '#FF33A1',
            'Penalty': '#A133FF', 'Challenge': '#33FFF5', 'Free kick': '#F5FF33', 'Corner': '#FF8C33',
            'Offside': '#8C33FF', 'Substitute': '#33FF8C', 'Caution': '#FF3333', 'Yellow card': '#FFFF33',
            'Red card': '#FF3333', 'Save': '#33FF33', 'Clearance': '#3333FF', 'Out of play': '#888888'
        };
        return colors[label] || '#000000';
    }

    // Handle video upload
    $('#videoUpload').on('change', function (e) {
        videoFile = e.target.files[0];
        if (videoFile) {
            const formData = new FormData();
            formData.append('video', videoFile);

            $.ajax({
                url: '/upload',
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: function (response) {
                    videoPlayer.src = `/uploads/${response.filename}`;
                    videoPlayer.load();
                    annotations = response.annotations?.annotations || [];
                    updateEventList();
                },
                error: function () {
                    alert('Error uploading video');
                }
            });
        }
    });

    // Open modal to add event
    let wasPlaying = false; // Global variable to track if the video was playing
    $('#addEventBtn').off('click').on('click', function () {
        if (!videoFile) {
            alert('Please upload a video first');
            return;
        }
            // Pause the video if it's playing
        if (!videoPlayer.paused) {
            wasPlaying = true; // Track that the video was playing
            videoPlayer.pause(); // Pause the video
        }
        $('#seconds').val(videoPlayer.currentTime.toFixed(2));
        $('#label').val($('#eventFilter').val() || 'Kickoff');
        $('#team').val('not_applicable');
        $('#visibility').val('not_applicable');

        $('#addEventModal').modal('show');

          // Save event from modal
    $('#saveEventBtn').off('click').on('click', function () {
        const seconds = parseFloat($('#seconds').val());
        const label = $('#label').val();
        const position = parseInt($('#position').val()) || 0;
        const team = $('#team').val();
        const visibility = $('#visibility').val();

        if (isNaN(seconds) || !label || !team || !visibility) {
            alert('Please fill all fields correctly.');
            return;
        }
            // Check for existing event within the same 4 seconds
        const existingEvent = annotations.find(event => 
            event.label === label &&
            event.team === team &&
            event.visibility === visibility &&
            Math.abs(event.seconds - seconds) < 4 // Check if within 4 seconds
        );

        if (existingEvent) {
            alert('An event with the same label, team, and visibility already exists within 4 seconds.');
            return; // Prevent saving the new event
        }
            const newAnnotation = { seconds, label, position, team, visibility };
        addAnnotation(newAnnotation);
        $('#addEventModal').modal('hide');
        if (wasPlaying) {
            videoPlayer.play(); // Resume playing the video
            wasPlaying = false; // Reset the flag
        }
    });

    });

  
    // Save annotations
    $('#saveAnnotationsBtn').on('click', function () {
        if (!videoFile || annotations.length === 0) {
            alert('No annotations to save');
            return;
        }

        const dataToSave = {
            filename: videoFile.name,
            annotations: annotations.map(annotation => ({
                ...annotation,
                gameTime: convertSecondsToGameTime(annotation.seconds)
            }))
        };

        $.ajax({
            url: '/save_annotations',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dataToSave),
            success: function () {
                alert('Annotations saved successfully');
            },
            error: function () {
                alert('Error saving annotations');
            }
        });
    });

    // Filter events by type
    $('#eventFilter').on('change', updateEventList);

    // Update event list and seek bar markers
    function updateEventList() {
        const filter = $('#eventFilter').val();
        const filteredAnnotations = filter === 'all' ? annotations : annotations.filter(event => event.label === filter);

        $('#eventList').empty();
        filteredAnnotations.forEach((event, index) => {
            if (typeof event.seconds === 'number' && !isNaN(event.seconds)) {
                $('#eventList').append(`
                    <li class="list-group-item event-item" data-seconds="${event.seconds}">
                        <strong>${event.label}:</strong> ${formatTime(event.seconds)} (${event.team})
                        <button class="btn btn-sm btn-danger float-end" onclick="deleteEvent(${index})">Delete</button>
                        <button class="btn btn-sm btn-warning float-end me-2" onclick="editEvent(${index})">Edit</button>
                    </li>
                `);
            }
        });

        $('.event-item').off('click').on('click', function () {
            const seconds = parseFloat($(this).data('seconds'));
            if (!isNaN(seconds)) videoPlayer.currentTime = seconds;
        });
    }

    // Delete event
    window.deleteEvent = function (index) {
        const filter = $('#eventFilter').val();
        const filteredAnnotations = filter === 'all' ? annotations : annotations.filter(event => event.label === filter);

        if (index >= 0 && index < filteredAnnotations.length) {
            annotations.splice(annotations.indexOf(filteredAnnotations[index]), 1);
            updateEventList();
        }
    };

    // Edit event
    window.editEvent = function (index) {
        const filter = $('#eventFilter').val();
        const filteredAnnotations = filter === 'all' ? annotations : annotations.filter(event => event.label === filter);

        if (index >= 0 && index < filteredAnnotations.length) {
            const event = filteredAnnotations[index];
            $('#seconds').val(event.seconds);
            $('#label').val(event.label);
            $('#position').val(event.position);
            $('#team').val(event.team);
            $('#visibility').val(event.visibility);

            $('#addEventModal').modal('show');
            $('#saveEventBtn').off('click').on('click', function () {
                const seconds = parseFloat($('#seconds').val());
                const label = $('#label').val();
                const position = parseInt($('#position').val());
                const team = $('#team').val();
                const visibility = $('#visibility').val();

                if (isNaN(seconds) || !label || !team || !visibility) {
                    alert('Please fill all fields correctly.');
                    return;
                }

                editAnnotation(index, { seconds, label, position, team, visibility });
                $('#addEventModal').modal('hide');
            });
        }
    };

    // Format time as MM:SS
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Playback speed control
    $('#playbackSpeed').on('change', function () {
        videoPlayer.playbackRate = parseFloat($(this).val());
    });

    // Volume control
    $('#volumeControl').on('input', function () {
        videoPlayer.volume = parseFloat($(this).val());
    });

    // Keyboard shortcuts
    $(document).on('keydown', function (e) {
        if (isSeeking) return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                if (document.activeElement !== videoPlayer) {
                    videoPlayer.focus();
                    videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
                }
                break;
            case 'Enter':
                $('#addEventBtn').click();
                e.preventDefault();
                break;
            case 'ArrowUp':
                videoPlayer.volume = Math.min(videoPlayer.volume + 0.1, 1);
                $('#volumeControl').val(videoPlayer.volume);
                break;
            case 'ArrowDown':
                videoPlayer.volume = Math.max(videoPlayer.volume - 0.1, 0);
                $('#volumeControl').val(videoPlayer.volume);
                break;
            case 'ArrowRight':
                e.preventDefault();
                console.log('ArrowRight');
                
                if (document.activeElement !== videoPlayer) {
                    videoPlayer.focus();
                }
                isSeeking = true;
                videoPlayer.currentTime = Math.min(videoPlayer.currentTime -50 , videoPlayer.duration);
                if (videoPlayer.duration-videoPlayer.currentTime <=60){
                    videoPlayer.currentTime = Math.max(currentVideoTime +10, 0);
                }
                setTimeout(() => {
                    isSeeking = false;
                }, 200);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                isSeeking = true;
                if (document.activeElement !== videoPlayer) {
                    videoPlayer.focus();
                }
                if (videoPlayer.currentTime <=60){
                    ti=videoPlayer.currentTime
                    videoPlayer.currentTime = Math.max(currentVideoTime -10, 0);
                }
                else {
                videoPlayer.currentTime = Math.max(videoPlayer.currentTime +50, 0);}

                setTimeout(() => {
                    isSeeking = false;
                }, 200);
                break;
        }
    });
    let currentVideoTime = 0; // Global variable to store the current time of the video
    let timeUpdateInterval; // Variable to hold the interval ID
    
    // Function to start updating the current video time
    function startUpdatingCurrentTime() {
        // Clear any existing interval to avoid multiple intervals running
        clearInterval(timeUpdateInterval);
    
        // Set up an interval to update the current time every second
        timeUpdateInterval = setInterval(() => {
            currentVideoTime = videoPlayer.currentTime; // Update the global variable
            console.log(`Current Video Time: ${currentVideoTime}`); // Optional: log the current time
        }, 1000); // Update every 1000 milliseconds (1 second)
    }
    
    // Function to stop updating the current time
    function stopUpdatingCurrentTime() {
        clearInterval(timeUpdateInterval); // Clear the interval
    }
    
    // Event listeners for video play and pause
    videoPlayer.addEventListener('play', startUpdatingCurrentTime);
    videoPlayer.addEventListener('pause', stopUpdatingCurrentTime);
    videoPlayer.addEventListener('ended', stopUpdatingCurrentTime);
    
    // Handle full-screen changes
    document.addEventListener('fullscreenchange', () => {
        const modal = $('#addEventModal');
        if (document.fullscreenElement === videoPlayer) {
            videoPlayer.parentNode.appendChild(modal[0]);
            modal.css('z-index', '10500');
        } else {
            document.body.appendChild(modal[0]);
            modal.css('z-index', '');
        }
    });

    // Function to add a new annotation
    function addAnnotation(newAnnotation) {
        annotations.push(newAnnotation);
        // Sort annotations by seconds to maintain order
        annotations.sort((a, b) => a.seconds - b.seconds);
        updateEventList(); // Update the UI with the sorted annotations
    }

    // Function to edit an existing annotation
    function editAnnotation(originalIndex, updatedAnnotation) {
        annotations[originalIndex] = updatedAnnotation; // Update the event in the original annotations array
        // Sort annotations by seconds to maintain order
        annotations.sort((a, b) => a.seconds - b.seconds);
        updateEventList(); // Update the UI with the sorted annotations
    }
});