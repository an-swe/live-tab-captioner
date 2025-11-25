import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// FIX: Disable browser cache to prevent "Failed to read caches" error in sandbox
env.useBrowserCache = false;
env.allowLocalModels = false;

let transcriber = null;

window.addEventListener('message', async (event) => {
    const msg = event.data;

    if (msg.type === 'PROCESS_AUDIO') {
        await transcribeChunk(msg.audioData, msg.language);
    }
});

async function transcribeChunk(float32Array, language) {
    try {
        // 1. Init Model (First run only)
        if (!transcriber) {
            window.parent.postMessage({ type: 'STATUS', message: 'Loading Whisper...' }, '*');
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                quantized: true
            });
            window.parent.postMessage({ type: 'STATUS', message: 'Model Loaded. Listening...' }, '*');
        }

        // 2. Run Inference
        const output = await transcriber(float32Array, {
            language: language,
            task: 'transcribe',
            chunk_length_s: 30,
            stride_length_s: 5
        });

        // 3. Send back text
        if (output.text && output.text.length > 2) {
            window.parent.postMessage({ type: 'RESULT', text: output.text }, '*');
        }

    } catch (err) {
        console.error(err);
        window.parent.postMessage({ type: 'STATUS', message: 'Error: ' + err.message }, '*');
    }
}