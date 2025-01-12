$(document).ready(function () {
    let videoPlayer = document.getElementById('videoPlayer');
    let videoFile = null;
    let annotations = []; // Initialize as an empty array

    // Function to convert gameTime to seconds
    function parseGameTimeToSeconds(gameTime) {
        const [half, time] = gameTime.split(' - ');
        const [minutes, seconds] = time.split(':');
        const totalSeconds = parseFloat(minutes) * 60 + parseFloat(seconds);

        // Add 45 minutes for the second half
        return half === '2' ? totalSeconds + (45 * 60) : totalSeconds;
    }

    // Function to convert seconds to gameTime format
    function convertSecondsToGameTime(seconds) {
        const half = seconds < 2700 ? '1' : '2'; // First half is 0-2700 seconds (45 minutes)
        const minutes = Math.floor((seconds % 2700) / 60); // Minutes in the current half
        const secs = (seconds % 60).toFixed(3); // Seconds with milliseconds
        return `${half} - ${String(minutes).padStart(2, '0')}:${String(secs).padStart(6, '0')}`;
    }

    // Function to get color for an event type
    function getEventColor(label) {
        const colors = {
            'Kickoff': '#FF5733',
            'Shot': '#33FF57',
            'Goal': '#3357FF',
            'Foul': '#FF33A1',
            'Penalty': '#A133FF',
            'Challenge': '#33FFF5',
            'Free kick': '#F5FF33',
            'Corner': '#FF8C33',
            'Offside': '#8C33FF',
            'Substitute': '#33FF8C',
            'Caution': '#FF3333',
            'Yellow card': '#FFFF33',
            'Red card': '#FF3333',
            'Save': '#33FF33',
            'Clearance': '#3333FF',
            'Out of play': '#888888'
        };
        return colors[label] || '#000000'; // Default to black if label not found
    }

// Handle video upload
$('#videoUpload').on('change', function (e) {
    videoFile = e.target.files[0];
    if (videoFile) {
        let formData = new FormData();
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

                // Extract the annotations array from the response
                if (response.annotations && Array.isArray(response.annotations.annotations)) {
                    annotations = response.annotations.annotations; // Correctly assign the annotations array
                    console.log('Annotations loaded:', annotations); // Debugging
                } else {
                    annotations = []; // Default to an empty array if annotations are not found
                    console.warn('No valid annotations found in response:', response);
                }

                // Update the UI with the loaded annotations
                updateEventList();
            },
            error: function (xhr) {
                alert('Error uploading video');
            }
        });
    }
});
    // Open modal to add event
    $('#addEventBtn').on('click', function () {
        if (!videoFile) {
            alert('Please upload a video first');
            return;
        }

        // Set default values
        $('#seconds').val(videoPlayer.currentTime.toFixed(2)); // Set to current video time in seconds
        $('#label').val($('#eventFilter').val() || 'Kickoff'); // Set to selected filter or 'Kickoff'
        $('#team').val('not_applicable'); // Set to 'Not Applicable' by default
        $('#visibility').val('not_applicable'); // Set to 'Not Applicable' by default

        // Show the modal
        $('#addEventModal').modal('show');
    });

    // Save event from modal
    $('#saveEventBtn').on('click', function () {
        const seconds = parseFloat($('#seconds').val());
        const label = $('#label').val();
        const position = parseInt($('#position').val()) || 0; // Default to 0 if not filled
        const team = $('#team').val();
        const visibility = $('#visibility').val();

        // Check if important fields are filled
        if (isNaN(seconds) || !label || isNaN(position) || !team || !visibility) {
            alert('Please fill all important fields correctly.');
            return;
        }

        // Create a new annotation object
        const newAnnotation = {
            seconds,  // Use seconds for calculations
            label,
            position,  // Use the default value if not filled
            team,
            visibility
        };

        annotations.push(newAnnotation);
        updateEventList();
        $('#addEventModal').modal('hide');
    });

    // Save annotations
    $('#saveAnnotationsBtn').on('click', function () {
        if (!videoFile || !Array.isArray(annotations) || annotations.length === 0) {
            alert('No annotations to save');
            return;
        }

        // Get the filename of the uploaded video
        const filename = videoFile.name;

        // Prepare the data to match the backend's expected format
        const dataToSave = {
            filename: filename, // Include the filename
            annotations: annotations.map(annotation => ({
                ...annotation,
                gameTime: convertSecondsToGameTime(annotation.seconds) // Convert back to gameTime for saving
            }))
        };

        // Send the data to the server
        $.ajax({
            url: '/save_annotations',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dataToSave),
            success: function () {
                alert('Annotations saved successfully');
            },
            error: function (xhr) {
                alert('Error saving annotations');
            }
        });
    });

    // Filter events by type
    $('#eventFilter').on('change', function () {
        updateEventList();
    });

    // Update event list and seek bar markers
    function updateEventList() {
        const filter = $('#eventFilter').val();
    
        // Filter annotations based on the selected filter
        const filteredAnnotations = filter === 'all' 
            ? annotations 
            : annotations.filter(event => event.label === filter);
    
        // Clear the event list
        $('#eventList').empty();
    
        // Add filtered events to the event list
        filteredAnnotations.forEach((event, index) => {
            // Ensure the event has a valid `seconds` property
            if (typeof event.seconds === 'number' && !isNaN(event.seconds)) {
                $('#eventList').append(`
                    <li class="list-group-item event-item" data-seconds="${event.seconds}">
                        <strong>${event.label}:</strong> ${event.seconds.toFixed(2)}s (${event.team})
                        <button class="btn btn-sm btn-warning float-end me-2" onclick="editEvent(${index})">Edit</button>
                        <button class="btn btn-sm btn-danger float-end" onclick="deleteEvent(${index})">Delete</button>
                    </li>
                `);
            } else {
                console.warn('Invalid annotation (missing or invalid `seconds` property):', event);
            }
        });
    
        // Update seek bar markers
        //updateSeekBarMarkers();

        // Add click event to each event item to seek to the corresponding time
        $('.event-item').on('click', function() {
            const seconds = parseFloat($(this).data('seconds'));
            if (!isNaN(seconds)) {
                videoPlayer.currentTime = seconds; // Seek to the event time
                videoPlayer.play(); // Optionally, start playing the video
            }
        });
    }

    // Update seek bar markers
    function updateSeekBarMarkers() {
        const $seekBarMarkers = $('#seekBarMarkers');
        $seekBarMarkers.empty(); // Clear existing markers

        if (videoPlayer.duration && Array.isArray(annotations)) {
            annotations.forEach(event => {
                const markerPosition = (event.seconds / videoPlayer.duration) * 100; // Calculate position as a percentage
                const color = getEventColor(event.label);
                $seekBarMarkers.append(`
                    <div class="seek-bar-marker" data-description="${event.label}" style="left: ${markerPosition}%; background-color: ${color};"></div>
                `);
            });
        }
    }

    // Delete event
    window.deleteEvent = function (index) {
        console.log("Deleting event at index:", index); // Debugging
        const filter = $('#eventFilter').val();
        const filteredAnnotations = filter === 'all' 
            ? annotations 
            : annotations.filter(event => event.label === filter);

        if (index >= 0 && index < filteredAnnotations.length) {
            const originalIndex = annotations.indexOf(filteredAnnotations[index]); // Find the original index
            annotations.splice(originalIndex, 1); // Remove the event from the original annotations array
            updateEventList(); // Refresh the event list
            console.log("Annotations after deletion:", annotations); // Debugging
        } else {
            console.error("Invalid index for deletion:", index); // Debugging
        }
    };

    // Edit event
    window.editEvent = function (index) {
        const filter = $('#eventFilter').val();
        const filteredAnnotations = filter === 'all' 
            ? annotations 
            : annotations.filter(event => event.label === filter);

        if (index >= 0 && index < filteredAnnotations.length) {
            const event = filteredAnnotations[index];
            
            // Populate the modal with the event's current details
            $('#seconds').val(event.seconds);
            $('#label').val(event.label);
            $('#position').val(event.position);
            $('#team').val(event.team);
            $('#visibility').val(event.visibility);

            // Show the modal
            $('#addEventModal').modal('show');

            // Update the save button to handle editing
            $('#saveEventBtn').off('click').on('click', function () {
                const seconds = parseFloat($('#seconds').val());
                const label = $('#label').val();
                const position = parseInt($('#position').val());
                const team = $('#team').val();
                const visibility = $('#visibility').val();

                if (isNaN(seconds) || !label  || !team || !visibility) {
                    alert('Please fill all fields correctly.');
                    return;
                }

                // Find the original index to update
                const originalIndex = annotations.indexOf(event); // Find the original index
                annotations[originalIndex] = { seconds, label, position, team, visibility }; // Update the event in the original annotations array
                updateEventList();
                $('#addEventModal').modal('hide');
            });
        } else {
            console.error("Invalid index for editing:", index); // Debugging
        }
    };

    // Update seek bar markers when the video metadata is loaded
    videoPlayer.addEventListener('loadedmetadata', function () {
        //updateSeekBarMarkers();
    });

    // Update seek bar markers when the video is seeked
    videoPlayer.addEventListener('seeked', function () {
       // updateSeekBarMarkers();
    });

    // Set up playback speed control
    $('#playbackSpeed').on('change', function () {
        videoPlayer.playbackRate = parseFloat($(this).val());
    });

    // Set up volume control
    $('#volumeControl').on('input', function () {
        videoPlayer.volume = parseFloat($(this).val());
    });

    // Keyboard shortcuts
    $(document).on('keydown', function (e) {
        switch (e.key) {
            case ' ':
                // Spacebar for play/pause
                if (videoPlayer.paused) {
                    videoPlayer.play();
                } else {
                    videoPlayer.pause();
                }
                e.preventDefault(); // Prevent scrolling the page
                break;
            case 'ArrowUp':
                // Increase volume
                if (videoPlayer.volume < 1) {
                    videoPlayer.volume = Math.min(videoPlayer.volume + 0.1, 1);
                    $('#volumeControl').val(videoPlayer.volume); // Update the volume control
                }
                break;
            case 'ArrowDown':
                // Decrease volume
                if (videoPlayer.volume > 0) {
                    videoPlayer.volume = Math.max(videoPlayer.volume - 0.1, 0);
                    $('#volumeControl').val(videoPlayer.volume); // Update the volume control
                }
                break;
            case 'ArrowRight':
                // Seek forward 5 seconds
                videoPlayer.currentTime = Math.min(videoPlayer.currentTime + 5, videoPlayer.duration);
                break;
            case 'ArrowLeft':
                // Seek backward 5 seconds
                videoPlayer.currentTime = Math.max(videoPlayer.currentTime - 5, 0);
                break;
            default:
                break;
        }
    });
});