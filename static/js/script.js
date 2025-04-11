$(document).ready(function () {
    // Initialize variables
    const videoPlayer = document.getElementById('videoPlayer');
    let videoFile = null;
    let annotations = [];
    let isSeeking = false;
    let currentFormat = 'new'; // Default format
    let wasPlaying = false; // Global variable to track if the video was playing
    let videoMetadata = null;
    let currentFrame = 0;
    let frameRate = 30; // Default frame rate, will be updated when video loads
    let addEventModalOpened = false; // Track if modal is currently open
    let videoFileName = null;
    let hasUnsavedChanges = false; // Track if there are unsaved changes
    let originalAnnotations = []; // Store original annotations for comparison
    let baseSeekTime = 5; // Base seeking time in seconds
    let currentSeekTime = baseSeekTime; // Current seeking time, will be adjusted based on playback rate
    let matchInfo = {
        urlLocal: '',
        gameHomeTeam: '',
        gameAwayTeam: '',
        gameDate: '',
        gameScore: ''
    }; // Store match information
    // Define event labels for old and new formats
    const eventLabels = {
        // old: [
        //     "Kickoff", "Shot", "Goal", "Foul", "Penalty", "Challenge", "Free kick",
        //     "Corner", "Offside", "Substitute", "Caution", "Yellow card", "Red card",
        //     "Save", "Clearance", "Out of play"
        // ],
        new: [
            "Ball out of play",
            "Throw-in",
            "Foul",
            "Indirect free-kick",
            "Clearance",
            "Shots on target",
            "Shots off target",
            "Corner",
            "Substitution",
            "Kick-off",
            "Direct free-kick",
            "Offside",
            "Yellow card",
            "Goal",
            "Penalty",
            "Red card",
            "Yellow->red card"
        ]
    };

    const eventLabelValues = {
        // old: [
        //     "kickoff", "shot", "goal", "foul", "penalty", "challenge", "free_kick",
        //     "corner", "offside", "substitute", "caution", "yellow_card", "red_card",
        //     "save", "clearance", "out_of_play"
        // ],
        new: [
            "ball_out_of_play", //#0
            "throw_in", //#1
            "foul", //#2    
            "indirect_free_kick", //#3
            "clearance", //#4
            "shots_on_target", //#5
            "shots_off_target", //#6
            "corner", //#7
            "substitution", //#8
            "kick_off", //#9
            "direct_free_kick", //#10 -> D
            "offside", //#11 -> O
            "yellow_card", //#12 -> Y
            "goal", //#13 -> G
            "penalty", //#14 -> P
            "red_card", //#15 -> R
            "yellow_red_card" //#16 -> S = sent off
        ]
    }

    // Hide shortcuts initially
    $('#eventShortcuts').parent().parent().hide();

    // Function to update shortcuts visibility
    function updateShortcutsVisibility() {
        if (videoFile) {
            $('#eventShortcuts').parent().parent().show();
        } else {
            $('#eventShortcuts').parent().parent().hide();
        }
    }

    // Function to populate dropdowns with event labels
    function populateEventDropdowns(format) {
        console.log("populateEventDropdowns -> format ", format);
        const labels = eventLabels[format] || [];
        const labelValues = eventLabelValues[format] || [];
        // add to eventFilter
        const eventFilter = document.getElementById('eventFilter');
        // add to labelDropdown
        const labelDropdown = document.getElementById('labelevent');

        // Clear existing options
        eventFilter.innerHTML = '<option value="all">All Events</option>';
        labelDropdown.innerHTML = '';

        // Add new options
        labels.forEach((label, index) => {
            const option = document.createElement('option');
            option.value = labelValues[index];
            option.textContent = label;
            eventFilter.appendChild(option.cloneNode(true)); // Add to filter dropdown
            labelDropdown.appendChild(option); // Add to modal dropdown
        });

        // Update action buttons colors
        updateActionButtonsColors();
    }

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
            'ball_out_of_play': '#4A90E2', // Bright blue
            'throw_in': '#E74C3C',     // Strong red
            'foul': '#9B59B6',         // Rich purple
            'indirect_free_kick': '#8E44AD', // Deep purple
            'clearance': '#795548',    // Rich brown
            'shots_on_target': '#27AE60', // Deep green
            'shots_off_target': '#C0392B', // Dark red
            'corner': '#2980B9',       // Deep blue
            'substitution': '#2C3E50', // Dark slate
            'kick_off': '#1ABC9C',     // Turquoise
            'direct_free_kick': '#16A085', // Dark turquoise
            'offside': '#D35400',      // Dark orange
            'yellow_card': '#F1C40F',  // Bright yellow
            'goal': '#8E44AD',         // Purple
            'penalty': '#2980B9',      // Deep blue
            'red_card': '#C0392B',     // Dark red
            'yellow_red_card': '#E67E22' // Dark orange
        };
        return colors[label] || '#000000';
    }

    // Function to update action buttons colors
    function updateActionButtonsColors() {
        $('.action-btn').each(function () {
            const action = $(this).data('action');
            console.log("updateActionButtonsColors -> action ", action);
            // const label = eventLabelValues[currentFormat][action];
            const color = getEventColor(action);
            $(this).css('background-color', color);
        });
    }

    // Populate video select dropdown with available videos
    function populateVideoSelect() {
        $.get('/get_videos', function (videos) {
            const videoSelect = $('#videoSelect');
            videoSelect.empty().append('<option value="">Choose a video...</option>');
            videos.forEach(video => {
                videoSelect.append(`<option value="${video.filename}">${video.filename}</option>`);
            });
        });
    }

    // Call on page load
    populateVideoSelect();

    // Add event handler for event shortcuts
    $('#eventShortcuts').on('click', '.action-btn', function(e) {
        e.preventDefault();
        const label = $(this).data('action');
        if (label) {
            openEventModal(label);
        }
    });

    // Function to format time as MM:SS.MS
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }

    // format time as MM:SS
    function formatTimeToSeconds(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Function to update time display
    function updateTimeDisplay() {
        try {
            const currentTime = formatTime(videoPlayer.currentTime);
            const duration = formatTime(videoPlayer.duration);
            $('#currentTime').text(currentTime);
            $('#duration').text(duration);

            // Update seek bar position
            const percentage = (videoPlayer.currentTime / videoPlayer.duration) * 100;
            $('#seekBarMarkers').css('width', `${percentage}%`);
        } catch (error) {
            console.error("Error updateTimeDisplay:", error);
        }
    }

    // Function to get frame number from timestamp
    function getFrameNumberFromTime(time) {
        try {
            if (!videoMetadata) return 0;
            console.log("getFrameNumberFromTime -> time ", time);
            const frameNumber = Math.round(time * videoMetadata.fps);
            return Math.min(Math.max(0, frameNumber), videoMetadata.frame_count - 1);
        } catch (error) {
            console.error("Error getFrameNumberFromTime:", error);
            return 0;
        }
    }

    // Function to get time from frame number
    function getTimeFromFrameNumber(frameNumber) {
        try {
            if (!videoMetadata) return 0;
            return frameNumber / videoMetadata.fps;
        } catch (error) {
            console.error("Error getTimeFromFrameNumber:", error);
            return 0;
        }
    }

    function playVideoPlayer() {
        if (!videoFile) return;
        videoPlayer.play();
        $('#playPauseBtn').html('<i class="bi bi-pause-fill"></i>');
    }

    function pauseVideoPlayer() {
        if (!videoFile) return;
        videoPlayer.pause();
        $('#playPauseBtn').html('<i class="bi bi-play-fill"></i>');
    }

    // Function to update seek time based on playback rate
    function updateSeekTime(playbackRate) {
        if (playbackRate <= 2) {
            currentSeekTime = baseSeekTime;
        } else {
            currentSeekTime = baseSeekTime * (playbackRate / 2);
        }
        // Update button texts
        $('#seekBack5s').html(`<i class="bi bi-skip-backward-fill"></i> ${currentSeekTime}s`);
        $('#seekForward5s').html(`<i class="bi bi-skip-forward-fill"></i> ${currentSeekTime}s`);
    }

    // Function to seek to a specific time
    function seekTo(time) {
        if (addEventModalOpened) return; // Prevent seeking if modal is open

        // Ensure time is within valid range
        time = Math.max(0, Math.min(time, videoPlayer.duration));

        // Store current play state
        const wasPlaying = !videoPlayer.paused;

        // Pause video before seeking
        if (!videoPlayer.paused) {
            pauseVideoPlayer();
        }

        // Set the new time
        console.log("--------------------------------");
        console.log("seekTo -> oldTime ", videoPlayer.currentTime);
        videoPlayer.currentTime = time;
        console.log("seekTo -> newTime ", time);
        console.log("--------------------------------");
        updateTimeDisplay();
        updateMetadataDisplay();
        if (wasPlaying) {
            playVideoPlayer();
        }
    }

    // Function to seek by frames
    function seekByFrames(frames) {
        if (addEventModalOpened) return; // Prevent seeking if modal is open
        if (!videoMetadata) return;

        // Calculate new frame number
        const newFrame = currentFrame + frames;
        console.log("seekByFrames -> newFrame ", newFrame);

        wasPlaying = !videoPlayer.paused;

        const playPauseBtn = $('#playPauseBtn');
        playPauseBtn.html('<i class="bi bi-play-fill"></i>');

        // Ensure frame number is within bounds
        if (newFrame >= 0 && newFrame < videoMetadata.frame_count) {
            const targetTime = getTimeFromFrameNumber(newFrame);
            console.log("seekByFrames -> targetTime ", targetTime);

            // Force pause before seeking
            videoPlayer.pause();

            // Seek to the exact frame time
            videoPlayer.currentTime = targetTime;

            // Update current frame immediately
            currentFrame = newFrame;
            $('#metadataCurrentFrame').text(`Frame: ${currentFrame}`);

            updateMetadataDisplay();
        }
    }

    // Frame navigation with debouncing
    let frameTimeout;
    $('#seekBackFrame').on('click', function () {
        if (addEventModalOpened) return; // Prevent seeking if modal is open
        clearTimeout(frameTimeout);
        frameTimeout = setTimeout(() => {
            seekByFrames(-1);
        }, 50);
    });

    $('#seekForwardFrame').on('click', function () {
        if (addEventModalOpened) return; // Prevent seeking if modal is open
        clearTimeout(frameTimeout);
        frameTimeout = setTimeout(() => {
            seekByFrames(1);
        }, 50);
    });

    $('#videoPlayer').off('click').on('click', function () {
        console.log('videoPlayer click');
    });

    // Update keyboard shortcuts
    $(document).on('keydown', function (e) {
        // Event label shortcuts
        const shortcuts = {
            '0': 'ball_out_of_play',
            '1': 'throw_in',
            '2': 'foul',
            '3': 'indirect_free_kick',
            '4': 'clearance',
            '5': 'shots_on_target',
            '6': 'shots_off_target',
            '7': 'corner',
            '8': 'substitution',
            '9': 'kick_off',
            'd': 'direct_free_kick',
            'v': 'offside',
            'y': 'yellow_card',
            'g': 'goal',
            'p': 'penalty',
            'r': 'red_card',
            'x': 'yellow_red_card'
        };
        // console.log('keydown -> e', e);
        if (addEventModalOpened) {
            const key = e.key.toLowerCase();
            if (shortcuts[key]) {
                e.preventDefault();
                $('#labelevent').val(shortcuts[key]);
                return;
            }

            switch (e.key) {
                case 'ArrowLeft':
                case 'ArrowRight':
                    e.preventDefault();
                    const team = $('#team').val();
                    console.log("addEventModalOpened -> team ", team);
                    const teamOptions = $('#team').find('option').map(function() {
                        return $(this).val();
                    }).get();
                    console.log("addEventModalOpened -> teamOptions ", teamOptions);
                    const currentIndexTeam = teamOptions.indexOf(team);
                    console.log("addEventModalOpened -> currentIndexTeam ", currentIndexTeam);
                    console.log("addEventModalOpened -> ArrowLeftRight");
                    // set next value of team
                    let nextIndexTeam = currentIndexTeam;
                    console.log("addEventModalOpened -> ArrowLeftRight -> currentIndexTeam ", currentIndexTeam);
                    if (e.key === 'ArrowLeft') {
                        console.log("addEventModalOpened -> ArrowLeft");
                        nextIndexTeam = (currentIndexTeam - 1 + teamOptions.length) % teamOptions.length;
                    } else {
                        console.log("addEventModalOpened -> ArrowRight");
                        nextIndexTeam = (currentIndexTeam + 1) % teamOptions.length;
                    }
                    console.log("addEventModalOpened -> ArrowLeftRight -> nextIndexTeam ", nextIndexTeam);
                    $('#team').val(teamOptions[nextIndexTeam]);
                    break;
                case 'ArrowUp':
                case 'ArrowDown':
                    e.preventDefault();
                    console.log("addEventModalOpened -> ArrowUpDown");
                    const visibility = $('#visibility').val();
                    const visibilityOptions = $('#visibility').find('option').map(function() {
                        return $(this).val();
                    }).get();
                    const currentIndexVisibility = visibilityOptions.indexOf(visibility);
                    // set next value for visibility
                    let nextIndexVisibility = currentIndexVisibility;
                    console.log("addEventModalOpened -> ArrowUpDown -> currentIndexVisibility ", currentIndexVisibility);
                    if (e.key === 'ArrowUp') {
                        console.log("addEventModalOpened -> ArrowUp");  
                        nextIndexVisibility = (currentIndexVisibility - 1 + visibilityOptions.length) % visibilityOptions.length;
                    } else {
                        console.log("addEventModalOpened -> ArrowDown");
                        nextIndexVisibility = (currentIndexVisibility + 1) % visibilityOptions.length;
                    }
                    console.log("addEventModalOpened -> ArrowUpDown -> nextIndexVisibility ", nextIndexVisibility);
                    $('#visibility').val(visibilityOptions[nextIndexVisibility]);
                    break;
                case 'Enter':
                    console.log("addEventModalOpened -> Enter");
                    e.preventDefault();
                    $('#saveEventBtn').click();
                    break;
            }
            return;
        }

        if (matchInfoModalOpened) {
            console.log("✏️✏️✏️✏️ addEventModalOpened -> matchInfoModalOpened");
            if (e.key === 'Escape') {
                $('#matchInfoModal').modal('hide');
                console.log("addEventModalOpened -> Escape");
                return;
            } else if (e.key === 'Enter') {
                $('#saveMatchInfoBtn').click();
                console.log("addEventModalOpened -> Enter");
                return;
            }
        }

        if (isSeeking) return; // Prevent seeking if modal is open

        // Check if the pressed key matches any shortcut
        const key = e.key.toLowerCase();
        if (shortcuts[key]) {
            e.preventDefault();
            openEventModal(shortcuts[key]);
            return;
        }

        // Handle video control shortcuts
        switch (e.key) {
            case ' ':
                e.preventDefault();
                if (videoPlayer.paused) {
                    playVideoPlayer();
                } else {
                    pauseVideoPlayer();
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (e.shiftKey) {
                    seekByFrames(-1);
                } else {
                    seekTo(videoPlayer.currentTime - currentSeekTime);
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (e.shiftKey) {
                    seekByFrames(1);
                } else {
                    seekTo(videoPlayer.currentTime + currentSeekTime);
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                videoPlayer.volume = Math.min(videoPlayer.volume + 0.1, 1);
                $('#volumeControl').val(videoPlayer.volume);
                break;
            case 'ArrowDown':
                e.preventDefault();
                videoPlayer.volume = Math.max(videoPlayer.volume - 0.1, 0);
                $('#volumeControl').val(videoPlayer.volume);
                break;
            case 'Enter':
                e.preventDefault();
                $('#addEventBtn').click();
                break;
        }
    });

    // Update timeupdate event listener to maintain frame accuracy
    videoPlayer.addEventListener('timeupdate', function () {
        try {
            updateTimeDisplay();
            if (videoMetadata) {
                const newFrame = getFrameNumberFromTime(videoPlayer.currentTime);
                if (newFrame !== currentFrame) {
                    currentFrame = newFrame;
                    $('#metadataCurrentFrame').text(`Frame: ${currentFrame}`);
                    updateMetadataDisplay();
                }
            }
        } catch (error) {
            console.error("Error timeupdate:", error);
        }
    });

    // Video event listeners
    videoPlayer.addEventListener('loadedmetadata', function () {
        updateTimeDisplay();
        // Get frame rate from video
        let count = videoPlayer.webkitVideoDecodedByteCount
        console.log("count ", count);
        frameRate = videoPlayer.webkitVideoDecodedByteCount !== undefined ?
            videoPlayer.webkitVideoDecodedByteCount : 30;
    });

    // Custom controls
    $('#playPauseBtn').on('click', function () {
        if (videoPlayer.paused) {
            console.log("playPauseBtn -> play -> currentTime ", videoPlayer.currentTime);
            playVideoPlayer();
        } else {
            console.log("playPauseBtn -> pause -> currentTime ", videoPlayer.currentTime);
            pauseVideoPlayer();
        }
    });

    // Update seek buttons
    $('#seekBack5s').on('click', function () {
        if (addEventModalOpened) return; // Prevent seeking if modal is open
        clearTimeout(frameTimeout);
        frameTimeout = setTimeout(() => {
            seekTo(videoPlayer.currentTime - currentSeekTime);
        }, 50);
    });

    $('#seekForward5s').on('click', function () {
        if (addEventModalOpened) return; // Prevent seeking if modal is open
        clearTimeout(frameTimeout);
        frameTimeout = setTimeout(() => {
            seekTo(videoPlayer.currentTime + currentSeekTime);
        }, 50);
    });

    // Custom seek bar
    $('#seekBar').on('click', function (e) {
        if (addEventModalOpened) return; // Prevent seeking if modal is open
        try {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            const time = percentage * videoPlayer.duration;
            seekTo(time);
        } catch (error) {
            console.error("Error seekBar onclick:", error);
        }
    });

    // Function to update metadata display
    function updateMetadataDisplay() {
        try {
            if (!videoMetadata) return;

            // Update static metadata
            $('#metadataDuration').text(formatTime(videoMetadata.duration));
            $('#metadataFps').text(videoMetadata.fps.toFixed(2));
            $('#metadataFrameCount').text(videoMetadata.frame_count);
            $('#metadataResolution').text(`${videoMetadata.width}x${videoMetadata.height}`);
            $('#metadataCurrentFrame').text(`Frame: ${currentFrame}`);

            // Update match info if available
            if (videoMetadata.matchInfo) {
                matchInfo = videoMetadata.matchInfo;
                updateMatchInfoForm();
            }
        } catch (error) {
            console.error("Error updateMetadataDisplay:", error);
        }
    }

    // Function to update match info form
    function updateMatchInfoForm() {
        $('#urlLocal').val(matchInfo.urlLocal || videoFileName || '');
        $('#gameHomeTeam').val(matchInfo.gameHomeTeam || '');
        $('#gameAwayTeam').val(matchInfo.gameAwayTeam || '');
        $('#gameDate').val(matchInfo.gameDate || '');
        $('#gameScore').val(matchInfo.gameScore || '');
        
        // Update the modal title with video name if available
        if (videoFileName) {
            $('#matchInfoModalLabel').text(`Match Information - ${videoFileName}`);
        } else {
            $('#matchInfoModalLabel').text('Match Information');
        }
    }

    // Handle edit match info button click
    $('#editMatchInfoBtn').on('click', function() {
        if (!videoFile) {
            alert('Please load a video first');
            return;
        }
        updateMatchInfoForm();
        $('#matchInfoModal').modal('show');
    });

    // Track match info modal state
    let matchInfoModalOpened = false;
    $('#matchInfoModal').on('show.bs.modal', function () {
        matchInfoModalOpened = true;
        // Update the modal title with video name if available
        if (videoFileName) {
            $('#matchInfoModalLabel').text(`Match Information - ${videoFileName}`);
        } else {
            $('#matchInfoModalLabel').text('Match Information');
        }
        
        // Ensure the modal is properly focused
        setTimeout(function() {
            // Focus on the first input field
            $('#gameHomeTeam').focus();
            
            // Ensure the modal is clickable
            $('#matchInfoModal').css('pointer-events', 'auto');
            $('.modal-content').css('pointer-events', 'auto');
        }, 100);
    });

    $('#matchInfoModal').on('shown.bs.modal', function () {
        // Additional focus handling after animation completes
        $('#gameHomeTeam').focus();
    });

    $('#matchInfoModal').on('hidden.bs.modal', function () {
        matchInfoModalOpened = false;
    });

    // Handle save match info button click
    $('#saveMatchInfoBtn').on('click', function() {
        const form = document.getElementById('matchInfoForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        matchInfo = {
            urlLocal: $('#urlLocal').val(),
            gameHomeTeam: $('#gameHomeTeam').val(),
            gameAwayTeam: $('#gameAwayTeam').val(),
            gameDate: $('#gameDate').val(),
            gameScore: $('#gameScore').val()
        };

        // Save match info to metadata
        $.ajax({
            url: '/save_metadata',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                filename: videoFileName,
                metadata: {
                    ...videoMetadata,
                    matchInfo: matchInfo
                }
            }),
            success: function() {
                // Update video metadata
                videoMetadata.matchInfo = matchInfo;
                
                // Update annotations with match info
                const dataToSave = {
                    filename: videoFileName,
                    annotations: annotations.map(annotation => ({
                        ...annotation,
                        gameTime: convertSecondsToGameTime(annotation.seconds),
                        matchInfo: matchInfo
                    }))
                };

                $.ajax({
                    url: '/save_annotations',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify(dataToSave),
                    success: function() {
                        originalAnnotations = JSON.parse(JSON.stringify(annotations));
                        hasUnsavedChanges = false;
                        updateUnsavedChangesStatus();
                        $('#matchInfoModal').modal('hide');
                        alert('Match information saved successfully');
                    },
                    error: function() {
                        alert('Error saving annotations');
                    }
                });
            },
            error: function() {
                alert('Error saving match information');
            }
        });
    });

    // Function to update video source and controls when video is loaded/selected
    function updateVideoSource(src, filename) {
        // First load the video
        videoPlayer.src = src;
        videoPlayer.load();
        console.log('✏️✏️✏️✏️✏️✏️ updateVideoSource -> filename', filename);
        videoFileName = filename;
        // Show loading indicator
        $('#metadataLoading').removeClass('d-none');

        // Then get metadata and update UI
        $.get(`/get_video_metadata/${filename.split('.')[0]}`, function (metadata) {
            videoMetadata = metadata;
            currentFrame = 0;
            console.log("Video metadata loaded:", metadata);
            // update videoFileName
            $('#videoFileName').text(filename);
            $('#playPauseBtn').html('<i class="bi bi-play-fill"></i>');
            updateMetadataDisplay();
            updateShortcutsVisibility();
            updateAllModalVisibility();
            
            // Show elements when video is loaded
            $('#videoContainerCard').addClass('loaded');
            $('#metadataCard').addClass('loaded');
            $('#eventListCard').addClass('loaded');
            
            // Add video-loaded class to body
            $('body').addClass('video-loaded');
            
            // no display modalTitle
            $('#modalTitle').css('display', 'none');
            // Change video column width to col-md-7
            $('#videoColumn').removeClass('col-md-12').addClass('col-md-7');
        }).fail(function (error) {
            console.error("Error loading metadata:", error);
            alert('Error loading video metadata');
        }).always(function () {
            // Hide loading indicator
            $('#metadataLoading').addClass('d-none');
        });
    }

    // Function to hide all elements when no video is loaded
    function hideAllElements() {
        $('#videoContainerCard').removeClass('loaded');
        $('#metadataCard').removeClass('loaded');
        $('#eventListCard').removeClass('loaded');
        
        // Remove video-loaded class from body
        $('body').removeClass('video-loaded');
        
        // Change video column width to col-md-12
        $('#videoColumn').removeClass('col-md-7').addClass('col-md-12');
    }

    // Call hideAllElements on page load
    hideAllElements();

    // Update the video selection handler
    $('#videoSelect').on('change', function () {
        if (hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Are you sure you want to load a different video?')) {
                $(this).val(videoFile); // Revert selection
                return;
            }
        }
        const selectedVideo = $(this).val();
        if (selectedVideo) {
            // Show loading indicator
            $('#metadataLoading').removeClass('d-none');

            $.get(`/select_video/${selectedVideo}`, function (response) {
                videoFile = selectedVideo;
                console.log('videoFile', videoFile);
                updateVideoSource(`/uploads/${response.filename}`, response.filename);
                annotations = response.annotations?.annotations || [];
                originalAnnotations = JSON.parse(JSON.stringify(annotations)); // Deep copy
                hasUnsavedChanges = false;
                if (!Array.isArray(annotations)) {
                    console.error("Annotations is not a list. Type:", typeof annotations);
                    console.error("Annotations content:", annotations);
                    annotations = [];
                }
                console.log("annotation received ", annotations, currentFormat);
                populateEventDropdowns(currentFormat);
                updateEventList();
                updateShortcutsVisibility();
                updateUnsavedChangesStatus();
            }).fail(function (error) {
                console.error("Error loading video:", error);
                alert('Error loading video');
                videoFile = null;
                updateShortcutsVisibility();
            }).always(function () {
                // Hide loading indicator
                $('#metadataLoading').addClass('d-none');
            });
        } else {
            videoFile = null;
            updateShortcutsVisibility();
        }
    });

    // Function to check if a video name already exists
    function checkVideoExists(filename) {
        return new Promise((resolve, reject) => {
            $.get('/get_videos', function(videos) {
                const exists = videos.some(video => video.filename === filename);
                resolve(exists);
            }).fail(function(error) {
                console.error("Error checking video existence:", error);
                reject(error);
            });
        });
    }

    // Update the video upload handler
    $('#videoUpload').on('change', function (e) {
        console.log('✈️✈️✈️✈️✈️✈️✈️✈️✈️✈️✈️✈️✈️✈️')
        console.log('videoUpload -> change -> videoFile', videoFile);
        videoFile = e.target.files[0];
        if (videoFile) {
            // Check if video with same name already exists
            checkVideoExists(videoFile.name)
                .then(exists => {
                    if (exists) {
                        alert(`A video with the name "${videoFile.name}" already exists. Please choose a different file or rename it.`);
                        // Reset the file input
                        $(this).val('');
                        videoFile = null;
                        return;
                    }
                    
                    // If video doesn't exist, proceed with upload
                    const formData = new FormData();
                    formData.append('video', videoFile);

                    $('#uploadProgress').removeClass('d-none');
                    const progressBar = $('#uploadProgress .progress-bar');

                    $.ajax({
                        url: '/upload',
                        type: 'POST',
                        data: formData,
                        processData: false,
                        contentType: false,
                        xhr: function () {
                            const xhr = new window.XMLHttpRequest();
                            xhr.upload.addEventListener('progress', function (e) {
                                if (e.lengthComputable) {
                                    const percent = Math.round((e.loaded / e.total) * 100);
                                    progressBar.css('width', percent + '%');
                                }
                            });
                            return xhr;
                        },
                        success: function (response) {
                            console.log('videoUpload -> success -> response', response);
                            updateVideoSource(`/uploads/${response.filename}`, response.filename)
                            //Update UI with video information
                            annotations = response.annotations?.annotations || [];
                            if (!Array.isArray(annotations)) {
                                console.error("Annotations is not a list. Type:", typeof annotations);
                                console.error("Annotations content:", annotations);
                                annotations = [];
                            }

                            // Update UI elements
                            populateEventDropdowns(currentFormat);
                            updateEventList();
                            $('#playPauseBtn').html('<i class="bi bi-play-fill"></i>');
                            updateMetadataDisplay();

                            // Hide progress bar
                            $('#uploadProgress').addClass('d-none');
                            progressBar.css('width', '0%');

                            // Refresh video select dropdown
                            populateVideoSelect();
                        },
                        error: function (error) {
                            console.error("Upload error:", error);
                            alert('Error uploading video');
                            $('#uploadProgress').addClass('d-none');
                            progressBar.css('width', '0%');
                            $('#metadataLoading').addClass('d-none');
                        }
                    });
                })
                .catch(error => {
                    console.error("Error checking video existence:", error);
                    alert('Error checking if video already exists. Please try again.');
                });
        }
    });

    // Open modal to add event
    $('#addEventModal').on('show.bs.modal', function () {
        if (addEventModalOpened) {
            return false; // Prevent modal from opening if already open
        }
        addEventModalOpened = true;
    });

    // Handle modal hidden event
    $('#addEventModal').on('hidden.bs.modal', function () {
        addEventModalOpened = false;
    });

    // Add event button clicked
    $('#addEventBtn').off('click').on('click', function () {
        openEventModal();
    });

    function updateAllModalVisibility() {
        //
    }

    function openEventModal(label = '', annotation_index = -1) {
        if (addEventModalOpened) {
            return; // Prevent opening if modal is already open
        }
        if (!videoFile) {
            alert('Please upload a video first');
            return;
        }
        if (!videoPlayer.paused) {
            wasPlaying = true;
            pauseVideoPlayer();
            // update playPauseBtn
            $('#playPauseBtn').html('<i class="bi bi-play-fill"></i>');
        }
        let is_editting = false;
        if (annotation_index >= 0) {
            is_editting = true;
        }

        $('#addEventModal').modal('show');
        console.log('openEventModal >>>>>>>> label >>>>>>>>>> annotation_index', label, annotation_index);
        if (is_editting) {
            // get filtered annotations
            const labelSelected = $('#eventFilter').val();

            const filteredAnnotations = labelSelected !== 'all' ? annotations.filter(event => event.label === labelSelected) : annotations;
            $('#seconds').val(filteredAnnotations[annotation_index].seconds);
            $('#labelevent').val(filteredAnnotations[annotation_index].label);
            $('#team').val(filteredAnnotations[annotation_index].team);
            $('#visibility').val(filteredAnnotations[annotation_index].visibility);

            // set function to save event
            $('#saveEventBtn').off('click').on('click', function () {
                console.log('🤐🤐🤐 edit save event 🤐🤐🤐')
                const seconds = parseFloat($('#seconds').val());
                const label = $('#labelevent').val();
                const team = $('#team').val();
                const visibility = $('#visibility').val();

                const original_index = annotations.findIndex(event => event.seconds === filteredAnnotations[annotation_index].seconds);

                editAnnotation(original_index, { seconds, label, team, visibility });
                $('#addEventModal').modal('hide');
                if (wasPlaying) {
                    playVideoPlayer();
                    wasPlaying = false;
                }
            });

        } else {
            // reset form
            console.log('🎃🎃🎃🎃 reset form 🎃🎃🎃🎃');
            $('#labelevent').val('');
            $('#team').val('home');
            $('#visibility').val('visible');

            // set seconds to current time
            $('#seconds').val(videoPlayer.currentTime.toFixed(2));
            $('#seconds').prop('disabled', true);
            $('#seconds').prop('readonly', true);
            $('#seconds').css('pointer-events', 'auto');

            if (label && eventLabelValues[currentFormat].includes(label)) {
                console.log('label is in eventLabels[currentFormat]', label);
                $('#labelevent').val(label);
            } else {
                console.log('label is not in eventLabelValues[currentFormat]', label);
                if ($('#eventFilter').val() && $('#eventFilter').val() !== 'all') {
                    console.log('eventFilter is not empty', $('#eventFilter').val());
                    $('#labelevent').val($('#eventFilter').val());
                } else {
                    // first item of eventLabels[currentFormat]
                    $('#labelevent').val(eventLabelValues[currentFormat][0]);
                }
            }

            // Save event from modal
            $('#saveEventBtn').off('click').on('click', function () {
                console.log('🎃🎃🎃🎃 original save event 🎃🎃🎃🎃');
                const seconds = parseFloat($('#seconds').val());
                const label = $('#labelevent').val();
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
                    Math.abs(event.seconds - seconds) < 4
                );

                if (existingEvent) {
                    alert('An event with the same label, team, and visibility already exists within 4 seconds.');
                    return;
                }
                console.log('create new annotation', seconds, label, team, visibility);
                const newAnnotation = { seconds, label, team, visibility };
                addAnnotation(newAnnotation);
                $('#addEventModal').modal('hide');
                if (wasPlaying) {
                    playVideoPlayer();
                    wasPlaying = false;
                }
            });
        }
    }

    // Save annotations
    $('#saveAnnotationsBtn').on('click', function () {
        if (!videoFile || annotations.length === 0) {
            alert('No annotations to save');
            return;
        }

        const dataToSave = {
            filename: videoFileName,
            annotations: annotations.map(annotation => ({
                ...annotation,
                gameTime: convertSecondsToGameTime(annotation.seconds)
            }))
        };

        console.log('dataToSave', dataToSave);
        $.ajax({
            url: '/save_annotations',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dataToSave),
            success: function () {
                originalAnnotations = JSON.parse(JSON.stringify(annotations)); // Update original annotations
                hasUnsavedChanges = false;
                updateUnsavedChangesStatus();
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

        // Sort annotations by time (seconds)
        filteredAnnotations.sort((a, b) => a.seconds - b.seconds);

        $('#eventList').empty();
        filteredAnnotations.forEach((event, index) => {
            if (typeof event.seconds === 'number' && !isNaN(event.seconds)) {
                const color = getEventColor(event.label);
                // Get the display label from eventLabels
                const labelIndex = eventLabelValues[currentFormat].indexOf(event.label);
                const displayLabel = eventLabels[currentFormat][labelIndex];
                $('#eventList').append(`
                    <li class="list-group-item event-item" data-seconds="${event.seconds}" style="border-left-color: ${color}; display: flex;" >
                        <p style="flex: 1; word-break: break-all;">
                            <strong>${displayLabel}:</strong> ${formatTimeToSeconds(event.seconds)} | ${event.team}
                        </p>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-danger float-end" onclick="deleteEvent(${index})"><i class="bi bi-trash"></i></button>
                            <button class="btn btn-sm btn-warning float-end me-2" onclick="editEvent(${index})"><i class="bi bi-pencil"></i></button>
                        </div>
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
        if (!confirm('Are you sure you want to delete this event?')) {
            return;
        }
        const filter = $('#eventFilter').val();
        const filteredAnnotations = filter === 'all' ? annotations : annotations.filter(event => event.label === filter);

        if (index >= 0 && index < filteredAnnotations.length) {
            annotations.splice(annotations.indexOf(filteredAnnotations[index]), 1);
            updateEventList();
            updateUnsavedChangesStatus();
        }
    };

    // Edit event
    window.editEvent = function (index) {
        console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
        console.log('editEvent', index);
        openEventModal('', index);
        console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
    };

    // Playback speed control
    $('#playbackSpeed').on('change', function () {
        const newRate = parseFloat($(this).val());
        videoPlayer.playbackRate = newRate;
        updateSeekTime(newRate);
    });

    // Volume control
    $('#volumeControl').on('input', function () {
        videoPlayer.volume = parseFloat($(this).val());
    });

    videoPlayer.addEventListener('click', function (e) {
        console.log('Video player clicked!');
        videoPlayer.blur();
    });

    // Function to add a new annotation
    function addAnnotation(newAnnotation) {
        console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
        console.log('addAnnotation', newAnnotation);
        annotations.push(newAnnotation);
        annotations.sort((a, b) => a.seconds - b.seconds);
        updateEventList();
        updateUnsavedChangesStatus();
    }

    // Function to edit an existing annotation
    function editAnnotation(originalIndex, updatedAnnotation) {
        console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
        console.log('editAnnotation', originalIndex, updatedAnnotation);
        annotations[originalIndex] = updatedAnnotation;
        annotations.sort((a, b) => a.seconds - b.seconds);
        updateEventList();
        updateUnsavedChangesStatus();
    }

    // Function to check if annotations have changed
    function checkForChanges() {
        if (!videoFile) return false;
        if (annotations.length !== originalAnnotations.length) return true;
        return JSON.stringify(annotations) !== JSON.stringify(originalAnnotations);
    }

    // Function to update unsaved changes status
    function updateUnsavedChangesStatus() {
        hasUnsavedChanges = checkForChanges();
        if (hasUnsavedChanges) {
            $('#saveAnnotationsBtn').addClass('btn-warning').removeClass('btn-success');
        } else {
            $('#saveAnnotationsBtn').addClass('btn-success').removeClass('btn-warning');
        }
    }

    // Add window beforeunload event
    window.addEventListener('beforeunload', function(e) {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        }
    });
});