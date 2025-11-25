const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const transcriptBox = document.getElementById('transcriptBox');
const langSelect = document.getElementById('languageSelect');
const sandboxFrame = document.getElementById('sandboxFrame');

let mediaStream = null;
let audioContext = null;
let processor = null;
let source = null;
let isCapturing = false;

// Buffer for audio data
let audioBuffer = [];
const CHUNK_LENGTH_SECONDS = 5; // Process every 5 seconds of audio
const SAMPLE_RATE = 16000;

// 1. Message Handling from Sandbox
window.addEventListener('message', (event) => {
    const data = event.data;
    if (data.type === 'STATUS') {
        statusText.textContent = `AI Status: ${data.message}`;
    } else if (data.type === 'RESULT') {
        addTranscript(data.text);
    }
});

function addTranscript(text) {
    if (!text || text.trim().length === 0) return;
    
    const div = document.createElement('div');
    div.className = 'chunk';
    const time = new Date().toLocaleTimeString();
    div.innerHTML = `<span class="timestamp">[${time}]</span> ${text}`;
    transcriptBox.appendChild(div);
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

// 2. Start Capture Logic
startBtn.onclick = async () => {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    transcriptBox.innerHTML = '';
    audioBuffer = [];

    try {
        // A. Request Tab Audio
        // This prompts Chrome to capture the active tab's audio
        chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
            if (!stream) {
                statusText.textContent = "Error: Could not capture stream. (Did you interact with the page?)";
                resetUI();
                return;
            }
            
            mediaStream = stream;
            initAudioProcessing(stream);
        });

    } catch (err) {
        console.error(err);
        statusText.textContent = "Error: " + err.message;
        resetUI();
    }
};

// 3. Audio Processing Pipeline
async function initAudioProcessing(stream) {
    statusText.textContent = "Audio captured. Initializing AI...";
    isCapturing = true;

    // Create Audio Context at 16kHz (Whisper native rate)
    // Note: Browsers might emulate this if hardware is 48k, which is fine.
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    
    // Create Source from Tab Stream
    source = audioContext.createMediaStreamSource(stream);
    
    // IMPORTANT: Connect to destination so user still hears the audio!
    source.connect(audioContext.destination);

    // Create Processor to intercept raw audio data
    // Buffer size 4096 is a good balance between latency and performance
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
        if (!isCapturing) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Add to buffer
        // We must clone the data because inputData is reused by the browser
        audioBuffer.push(new Float32Array(inputData));

        // Check if we have enough data for a chunk
        const totalSamples = audioBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
        const requiredSamples = SAMPLE_RATE * CHUNK_LENGTH_SECONDS;

        if (totalSamples >= requiredSamples) {
            processBuffer();
        }
    };
}

function processBuffer() {
    if (audioBuffer.length === 0) return;

    // Flatten buffer
    const totalLength = audioBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
    const fullFloatArray = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of audioBuffer) {
        fullFloatArray.set(chunk, offset);
        offset += chunk.length;
    }

    // Clear buffer immediately to start recording next chunk
    audioBuffer = [];

    // Send to Sandbox
    statusText.textContent = "Processing chunk...";
    sandboxFrame.contentWindow.postMessage({
        type: 'PROCESS_AUDIO',
        audioData: fullFloatArray,
        language: langSelect.value
    }, '*');
}

// 4. Stop Logic
stopBtn.onclick = resetUI;

function resetUI() {
    isCapturing = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "Stopped.";

    if (processor) processor.disconnect();
    if (source) source.disconnect();
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
}