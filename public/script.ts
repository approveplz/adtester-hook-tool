/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// =============================================
// Configuration
// =============================================
interface Config {
    BUCKET_NAME: string;
    FOLDER_NAME: string;
    BASE_SERVER_URL: string;
    CREATOMATE_TEMPLATE: Record<string, any>;
}

const CONFIG: Config = {
    BUCKET_NAME: 'hooks-tools',
    FOLDER_NAME: 'hooks-with-subs',
    BASE_SERVER_URL:
        'https://us-central1-solar-ad-tester-2.cloudfunctions.net/hooksTool',
    CREATOMATE_TEMPLATE: {
        output_format: 'mp4',
        width: 720,
        height: 1280,
        elements: [
            {
                id: 'ceabf58e-92b4-4963-8994-0955495a3044',
                name: 'hook-video',
                type: 'video',
                track: 1,
                time: 0,
                y: '46.0351%',
                width: '113.7266%',
                height: '37.0663%',
                source: '1efba592-995d-4fc2-a084-863a996111ad',
                dynamic: true,
            },
            {
                id: '03fe4108-e7fe-4678-a3ce-92355d1cd44d',
                name: 'main-video',
                type: 'video',
                track: 1,
                source: '065e2f34-df0a-4f19-80f8-8e9f5ca58171',
                dynamic: true,
            },
        ],
    },
};

// =============================================
// State Management
// =============================================
interface AppState {
    mainVideoFile: File | null;
    selectedHookVideos: Set<string>;
    allHooksSelected: boolean;
    adName: string;
    mainVideoWidth: number | null;
    mainVideoHeight: number | null;
}

const state: AppState = {
    mainVideoFile: null,
    selectedHookVideos: new Set<string>(),
    allHooksSelected: false,
    adName: '',
    mainVideoWidth: null,
    mainVideoHeight: null,
};

// =============================================
// API Helpers
// =============================================

// Add interfaces for API responses
interface GCSItem {
    name: string;
    contentType: string;
}

interface GCSResponse {
    items: GCSItem[];
}

interface CreatomateRenderResponse {
    id: string;
    status: string;
    error?: string;
    result?: {
        url: string;
        thumbnailUrl: string;
    };
}

async function fetchHookVideosFromGcs(): Promise<
    Array<{ name: string; url: string }>
> {
    const API_URL = `https://storage.googleapis.com/storage/v1/b/${CONFIG.BUCKET_NAME}/o?prefix=${CONFIG.FOLDER_NAME}`;
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(
                `GCS list API request failed with status ${response.status}`
            );
        }
        const data: GCSResponse = await response.json();

        if (!data.items) {
            return [];
        }

        const hookVideos = data.items
            .filter((item: GCSItem) => {
                return (
                    item.contentType === 'video/mp4' ||
                    item.name.endsWith('.mp4')
                );
            })
            .map((item: GCSItem) => ({
                name: item.name
                    .replace(`${CONFIG.FOLDER_NAME}/`, '')
                    .replace('.mp4', ''),
                url: `https://storage.googleapis.com/${
                    CONFIG.BUCKET_NAME
                }/${encodeURIComponent(item.name)}`,
            }));

        return hookVideos;
    } catch (error) {
        console.error('Error fetching hook videos:', error);
        return [];
    }
}

const uploadFileToGcsBucket = async (
    bucketName: string,
    file: File
): Promise<string> => {
    const url = `https://storage.googleapis.com/${bucketName}/${file.name}`;

    console.log('Uploading file to:', url);

    const response = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': file.type,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to upload file');
    }

    return url;
};

// Function to fetch the Creatomate API key from the server
async function fetchCreatomateApiKey(): Promise<string> {
    try {
        // Remove hooksTool to test locally
        const response = await fetch('hooksTool/api/creatomate_key');
        if (!response.ok) {
            throw new Error('Failed to fetch Creatomate API key from server.');
        }
        const data = await response.json();
        return data.apiKey;
    } catch (error) {
        console.error('Error fetching Creatomate API key:', error);
        throw error;
    }
}

async function uploadToCreatomate(
    mainVideoUrl: string,
    hookVideo: { name: string; url: string },
    adName: string,
    apiKey: string
): Promise<CreatomateRenderResponse> {
    const url = 'https://api.creatomate.com/v1/renders';

    const { name: hookVideoName, url: hookVideoUrl } = hookVideo;

    const data = {
        source: CONFIG.CREATOMATE_TEMPLATE,
        modifications: {
            'hook-video.source': hookVideoUrl,
            'main-video.source': mainVideoUrl,
        },
        metadata: JSON.stringify({
            main_video_url: mainVideoUrl,
            ad_name: adName,
            hook_name: hookVideoName,
        }),
        webhook_url: `${CONFIG.BASE_SERVER_URL}/api/creatomate_webhook`,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Debug response details
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers));
        const responseText = await response.text();
        console.log('Raw response:', responseText);

        try {
            return JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            throw new Error(`Failed to parse response: ${responseText}`);
        }
    } catch (error) {
        console.error('Error uploading to Creatomate:', error);
        throw error;
    }
}

// =============================================
// UI Helpers
// =============================================

/**
 * Updates UI elements during processing
 * @param {HTMLButtonElement} button
 * @param {string} status
 * @param {boolean} disabled
 */
function updateSubmitButtonStatus(
    button: HTMLButtonElement,
    status: string,
    disabled: boolean
): void {
    button.textContent = status;
    button.disabled = disabled;
}

/**
 * Creates a hook video item element
 * @param {Object} hookVideo
 * @returns {HTMLElement}
 */
function createHookVideoElement(hookVideo: {
    name: string;
    url: string;
}): HTMLElement {
    const itemDiv = document.createElement('div');
    itemDiv.classList.add('hook-video-item');

    const videoEl = document.createElement('video');
    videoEl.controls = true;
    videoEl.src = hookVideo.url;
    itemDiv.appendChild(videoEl);

    // Create a label element to act as the clickable container
    const checkboxContainer = document.createElement('label');
    checkboxContainer.classList.add('hook-checkbox-container');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `checkbox-${hookVideo.name}`;
    checkbox.classList.add('hook-checkbox');

    // Event listener for checkbox changes
    checkbox.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
            state.selectedHookVideos.add(hookVideo.name);
        } else {
            state.selectedHookVideos.delete(hookVideo.name);
        }
    });

    const labelText = document.createElement('span');
    labelText.innerText = 'Use this hook';

    // Append the checkbox and label text to the label container
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(labelText);

    // Append the checkbox container to the item container
    itemDiv.appendChild(checkboxContainer);

    return itemDiv;
}

// =============================================
// Validation Helpers
// =============================================

/**
 * Validates the form data before submission
 * @returns {string|null} Error message if validation fails, null if successful
 */
function validateSubmission(): string | null {
    if (!state.mainVideoFile) {
        return 'Please select a main video first!';
    }
    if (state.selectedHookVideos.size === 0) {
        return 'Please select at least one hook video!';
    }
    if (!state.adName) {
        return 'Please enter an Ad Name!';
    }
    return null;
}

// =============================================
// Event Handlers
// =============================================

/**
 * Handles the main video file selection
 * @param {Event} event
 * @param {HTMLVideoElement} videoPlayer
 */
function handleMainVideoSelection(
    event: Event,
    videoPlayer: HTMLVideoElement
): void {
    const input = event.target as HTMLInputElement;
    const file = input.files ? input.files[0] : null;
    if (!file) return;

    state.mainVideoFile = file;
    videoPlayer.src = URL.createObjectURL(file);

    videoPlayer.addEventListener('loadedmetadata', () => {
        // Store dimensions in state
        state.mainVideoWidth = videoPlayer.videoWidth;
        state.mainVideoHeight = videoPlayer.videoHeight;

        console.log('📹 Main video file details:', {
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            type: file.type,
            dimensions: `${videoPlayer.videoWidth}x${videoPlayer.videoHeight}`,
        });
    });
}

/**
 * Handles ad name input changes
 * @param {Event} event
 */
function handleAdNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    state.adName = input.value.trim();
}

/**
 * Handles the select all functionality
 * @param {HTMLButtonElement} selectAllButton
 * @param {NodeList} checkboxes
 */
function handleSelectAll(
    selectAllButton: HTMLButtonElement,
    checkboxes: NodeListOf<HTMLInputElement>
): void {
    state.allHooksSelected = !state.allHooksSelected;
    selectAllButton.textContent = state.allHooksSelected
        ? 'Deselect All'
        : 'Select All';

    checkboxes.forEach((checkbox) => {
        checkbox.checked = state.allHooksSelected;
        checkbox.dispatchEvent(new Event('change'));
    });
}

// =============================================
// Main Processing Logic
// =============================================

/**
 * Processes videos with Creatomate
 * @param {string} mainVideoUrl
 * @param {Array} hookVideos
 * @param {string} apiKey
 * @returns {Promise}
 */
async function processVideos(
    mainVideoUrl: string,
    hookVideos: Array<{ name: string; url: string }>,
    apiKey: string
): Promise<CreatomateRenderResponse[]> {
    const creatomatePromises = Array.from(state.selectedHookVideos).map(
        async (hookVideoName: string) => {
            const hookVideo = hookVideos.find(
                (video) => video.name === hookVideoName
            );
            if (!hookVideo) {
                throw new Error(`Hook video ${hookVideoName} not found`);
            }
            return uploadToCreatomate(
                mainVideoUrl,
                hookVideo,
                state.adName,
                apiKey
            );
        }
    );

    return Promise.all(creatomatePromises);
}

/**
 * Handles the form submission
 * @param {HTMLButtonElement} submitButton
 * @param {Array} hookVideos
 */
async function handleSubmit(
    submitButton: HTMLButtonElement,
    hookVideos: Array<{ name: string; url: string }>
): Promise<void> {
    const validationError = validateSubmission();
    if (validationError) {
        alert(validationError);
        return;
    }

    console.log('State before submission:', state);

    try {
        updateSubmitButtonStatus(submitButton, 'Uploading...', true);

        const creatomateApiKey = await fetchCreatomateApiKey();

        const mainVideoUrl = await uploadFileToGcsBucket(
            CONFIG.BUCKET_NAME,
            state.mainVideoFile as File
        );
        console.log('Main video upload completed successfully!');

        updateSubmitButtonStatus(
            submitButton,
            'Processing with Creatomate...',
            true
        );

        const results = await processVideos(
            mainVideoUrl,
            hookVideos,
            creatomateApiKey
        );
        console.log('All videos processed with Creatomate:', results);

        alert('Video processing complete!');
    } catch (error: any) {
        console.error('❌ Process failed:', error);
        alert(`Processing failed: ${error.message}`);
    } finally {
        updateSubmitButtonStatus(submitButton, 'Submit', false);
    }
}

// =============================================
// Initialization
// =============================================

window.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    const mainVideoUpload = document.getElementById(
        'main-video-upload'
    ) as HTMLInputElement;
    const mainVideoPlayer = document.getElementById(
        'main-video-player'
    ) as HTMLVideoElement;
    const hookVideosContainer = document.getElementById(
        'hook-videos-container'
    ) as HTMLElement;
    const selectAllHooksButton = document.getElementById(
        'select-all-hooks-button'
    ) as HTMLButtonElement;
    const submitButton = document.getElementById(
        'submit-button'
    ) as HTMLButtonElement;
    const adNameInput = document.getElementById(
        'ad-name-input'
    ) as HTMLInputElement;

    // Initialize main video handling
    mainVideoUpload.addEventListener('change', (e) =>
        handleMainVideoSelection(e, mainVideoPlayer)
    );

    // Initialize ad name handling
    adNameInput.addEventListener('input', handleAdNameInput);

    // Initialize hook videos
    const hookVideos = await fetchHookVideosFromGcs();
    console.log('Fetched hook videos from GCS:', hookVideos);
    hookVideos.forEach((hookVideo) => {
        hookVideosContainer.appendChild(createHookVideoElement(hookVideo));
    });

    // Initialize select all functionality
    selectAllHooksButton.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll(
            '.hook-checkbox'
        ) as NodeListOf<HTMLInputElement>;
        handleSelectAll(selectAllHooksButton, checkboxes);
    });

    // Initialize submit handling
    submitButton.addEventListener('click', () =>
        handleSubmit(submitButton, hookVideos)
    );
});
