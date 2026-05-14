import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export const useVoiceSearch = (onResult) => {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const isStartingRef = useRef(false);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.onstart = null;
                recognitionRef.current.onresult = null;
                recognitionRef.current.onerror = null;
                recognitionRef.current.onend = null;
                recognitionRef.current.stop();
            } catch (e) {
                // Ignore errors on stop
            }
            recognitionRef.current = null;
        }
        setIsListening(false);
        isStartingRef.current = false;
    }, []);

    const startListening = useCallback(() => {
        if (isListening || isStartingRef.current) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            toast.error("Voice search is not supported in this browser.");
            return;
        }

        try {
            isStartingRef.current = true;
            const recognition = new SpeechRecognition();
            recognition.lang = 'en-IN';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                setIsListening(true);
                isStartingRef.current = false;
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                if (onResult) {
                    onResult(transcript);
                }
                stopListening();
            };

            recognition.onerror = (event) => {
                const errorType = event.error;
                
                // Only show errors that are actual problems
                if (errorType === 'not-allowed') {
                    toast.error("Microphone access denied.");
                } else if (errorType === 'no-speech') {
                    // Silent on no-speech to avoid annoying toasts
                } else if (errorType === 'network') {
                    toast.error("Network error during voice search.");
                } else if (errorType !== 'aborted') {
                    console.error('Speech recognition error:', errorType);
                }
                
                stopListening();
            };

            recognition.onend = () => {
                setIsListening(false);
                isStartingRef.current = false;
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch (error) {
            isStartingRef.current = false;
            console.error('Speech recognition initialization failed:', error);
        }
    }, [isListening, onResult, stopListening]);

    return {
        isListening,
        startListening,
        stopListening
    };
};
