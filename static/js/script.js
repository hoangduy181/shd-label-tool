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
    $('#addEventBtn').off('click').on('click', function () {
        if (!videoFile) {
            alert('Please upload a video first');
            return;
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

        const newAnnotation = { seconds, label, position, team, visibility };
        annotations.push(newAnnotation);
        annotations.sort((a, b) => a.seconds - b.seconds);
        console.log("adding event saved")
        updateEventList();
        $('#addEventModal').modal('hide');
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

                annotations[annotations.indexOf(event)] = { seconds, label, position, team, visibility };
                updateEventList();
                //$('#addEventModal').modal('hide');
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
                isSeeking = true;
                videoPlayer.currentTime = Math.min(videoPlayer.currentTime + 5, videoPlayer.duration);
                setTimeout(() => isSeeking = false, 200);
                break;
            case 'ArrowLeft':
                isSeeking = true;
                videoPlayer.currentTime = Math.max(videoPlayer.currentTime - 5, 0);
                setTimeout(() => isSeeking = false, 200);
                break;
        }
    });

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
});