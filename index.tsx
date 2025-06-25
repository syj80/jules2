
import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import ReactDOM from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx'; // For XLSX and CSV
import { GoogleGenAI, GenerateContentResponse, Chat } from "@google/genai";
import { sampleWords } from './src/data/sampleWords'; // Corrected path

// pdf.js worker setup
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.3.136/build/pdf.worker.mjs';
}

// --- Toast Notification System ---
interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}
interface ToastContextType {
    addToast: (message: string, type: ToastMessage['type']) => void;
}
const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToasts = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToasts must be used within a ToastProvider');
    }
    return context;
};

const ToastProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const toastIdRef = useRef(0);

    const addToast = useCallback((message: string, type: ToastMessage['type']) => {
        const id = toastIdRef.current++;
        setToasts(prevToasts => [...prevToasts, { id, message, type }]);
        const duration = type === 'error' || type === 'warning' ? 7000 : 5000;
        setTimeout(() => {
            removeToast(id);
        }, duration);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed top-5 right-5 z-[100] w-full max-w-xs sm:max-w-sm space-y-3">
                {toasts.map(toast => (
                    <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

interface ToastProps {
    message: string;
    type: ToastMessage['type'];
    onClose: () => void;
}
const Toast: React.FC<ToastProps> = React.memo(({ message, type, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);

    const typeStyles = useMemo(() => {
        switch (type) {
            case 'success': return { bg: 'bg-green-500', text: 'text-white', icon: '✔️' };
            case 'error': return { bg: 'bg-red-500', text: 'text-white', icon: '❌' };
            case 'warning': return { bg: 'bg-yellow-500', text: 'text-slate-800', icon: '⚠️' }; // Darker text for yellow
            case 'info': return { bg: 'bg-blue-500', text: 'text-white', icon: 'ℹ️' };
            default: return { bg: 'bg-slate-600', text: 'text-white', icon: '' };
        }
    }, [type]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(onClose, 300); 
    };

    return (
        <div 
            role="alert" 
            aria-live={type === 'error' ? 'assertive' : 'polite'}
            className={`flex items-start justify-between p-4 rounded-md shadow-lg ${typeStyles.bg} ${typeStyles.text} ${isExiting ? 'animate-slideOutRight' : 'animate-slideInRight'}`}
        >
            <div className="flex items-center">
                {typeStyles.icon && <span className="mr-2 text-lg">{typeStyles.icon}</span>}
                <p className="text-sm">{message}</p>
            </div>
            <button onClick={handleClose} aria-label="Close notification" className={`ml-4 p-1 rounded-md hover:bg-black/20 focus:outline-none focus:ring-2 ${type==='warning' ? 'focus:ring-slate-700/50' : 'focus:ring-white/50'} text-xl leading-none`}>&times;</button>
        </div>
    );
});


// --- Global Loading Indicator ---
const GlobalSpinner: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
    if (!isLoading) return null;
    return (
        <div className="fixed top-4 right-4 z-[200] p-2 bg-slate-200/80 dark:bg-slate-700/80 rounded-full shadow-lg" aria-label="Loading content" role="status">
            <svg className="animate-spin h-6 w-6 text-cyan-600 dark:text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        </div>
    );
};


// Define types for user settings
export interface UserSettings {
    grade: string;
    textbook: string; 
    dailyGoal: number;
    username: string;
    theme: 'dark' | 'light';
    speechRate: number;
    autoPlayAudio: boolean;
    xp: number;
    level: number;
}

// Define props for screen components
interface ScreenProps {
    userSettings: UserSettings;
    onNavigate: (screen: AppScreen, params?: any) => void;
    currentScreen?: AppScreen; 
    setGlobalLoading: (loading: boolean) => void; 
    addToast: (message: string, type: ToastMessage['type']) => void;
    openSettingsModal: () => void;
    addXp: (amount: number) => void; // Added for game mode
}

type AppScreen = 'loginSetup' | 'dashboard' | 'learnWords' | 'quiz' | 'allWords' | 'wordsByUnit' | 'stats' | 'manageWords' | 'tutorChat' | 'gameSelection' | 'wordMatchGame' | 'typingPracticeGame' | 'speedQuizGame' | 'gameResult';

export interface Word { 
    id: number | string; 
    term: string; 
    pronunciation?: string; 
    partOfSpeech: string; 
    meaning: string; 
    exampleSentence: string;
    exampleSentenceMeaning?: string; 
    gradeLevel: string; 
    isCustom?: boolean; 
    unit?: string | number; // Optional field for unit/lesson
}

export interface WordStat { 
    id: number | string;
    isMastered: boolean;
    lastReviewed: string | null; 
    quizIncorrectCount: number;
}

// --- Helper Functions ---
const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let preferredVoices: { [lang: string]: SpeechSynthesisVoice | undefined } = {};
let voicesLoadedPromise: Promise<void> | null = null;

const loadVoices = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (!voicesLoadedPromise) {
            voicesLoadedPromise = new Promise((resolve) => {
                const tryLoad = () => {
                    const voices = speechSynthesis.getVoices();
                    if (voices.length > 0) {
                        cachedVoices = voices;
                        preferredVoices = {}; 
                        resolve();
                    }
                };

                if (speechSynthesis.getVoices().length > 0) {
                    tryLoad();
                } else {
                    speechSynthesis.onvoiceschanged = () => {
                        tryLoad();
                        speechSynthesis.onvoiceschanged = null; 
                    };
                }
            });
        }
        return voicesLoadedPromise;
    }
    return Promise.resolve();
};

loadVoices();

const speak = async (text: string, lang = 'en-US', rate?: number) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        if (rate !== undefined) {
            utterance.rate = Math.max(0.1, Math.min(rate, 10)); // Clamp rate to valid range
        }


        await loadVoices(); 

        if (cachedVoices && !preferredVoices[lang]) {
            const targetLangVoices = cachedVoices.filter(voice => voice.lang === lang || voice.lang.startsWith(lang.split('-')[0]));
            preferredVoices[lang] = 
                targetLangVoices.find(voice => voice.name.includes('Google') && voice.lang === lang) ||
                targetLangVoices.find(voice => voice.name.includes('Microsoft') && voice.lang === lang) ||
                targetLangVoices.find(voice => voice.name.includes('Samantha') && voice.lang === lang) || // Common voice name
                targetLangVoices.find(voice => voice.default && voice.lang === lang) ||
                targetLangVoices.find(voice => voice.lang === lang) ||
                targetLangVoices.find(voice => voice.default) || // Fallback to any default system voice
                targetLangVoices[0]; // Fallback to the first available voice for the language
        }

        if (preferredVoices[lang]) {
            utterance.voice = preferredVoices[lang];
        } else if (cachedVoices && cachedVoices.length > 0) {
            const systemDefaultVoice = cachedVoices.find(v => v.default);
            if (systemDefaultVoice) utterance.voice = systemDefaultVoice;
        }
        
        speechSynthesis.speak(utterance);
    } else {
        console.warn("Speech synthesis not supported in this browser.");
    }
};


const getTodayDateString = () => new Date().toISOString().split('T')[0];

const getDefaultWordStat = (wordId: string | number): WordStat => ({
    id: wordId,
    isMastered: false,
    lastReviewed: null,
    quizIncorrectCount: 0,
});


// --- API Client Setup (Gemini) ---
let ai: GoogleGenAI | null = null;
if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} else {
    console.warn("API_KEY environment variable not set. AI features will be disabled.");
}

// --- Gemini API Quota Management ---
let isCurrentlyGeminiQuotaExhausted = false;
let quotaCooldownTimeoutId: number | null = null;
const GEMINI_QUOTA_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

const setGeminiQuotaExhaustedCooldown = (
    addToastForNotification: (message: string, type: ToastMessage['type']) => void,
    featureName?: string 
) => {
    if (!isCurrentlyGeminiQuotaExhausted) {
        const cooldownMinutes = GEMINI_QUOTA_COOLDOWN_MS / 60000;
        console.log(`Gemini API quota exhaustion detected for '${featureName || 'a Gemini API call'}'. Activating ${cooldownMinutes}-minute cooldown.`);
        isCurrentlyGeminiQuotaExhausted = true;
        
        const baseMessage = featureName
            ? `Gemini API 사용량 할당량(quota)을 초과하여 '${featureName}' 기능 사용이 중단됩니다.`
            : `Gemini API 사용량 할당량(quota)을 초과했습니다.`;
        
        addToastForNotification(`${baseMessage} Google AI Studio 또는 Google Cloud Console에서 할당량 및 결제 세부 정보를 확인해주세요. 추가 API 호출이 ${cooldownMinutes}분 동안 중단됩니다.`, "error");
        
        if (quotaCooldownTimeoutId) {
            clearTimeout(quotaCooldownTimeoutId);
        }
        quotaCooldownTimeoutId = window.setTimeout(() => {
            isCurrentlyGeminiQuotaExhausted = false;
            quotaCooldownTimeoutId = null;
            console.log("Gemini API quota cooldown finished. API calls may resume.");
            addToastForNotification(`Gemini API 호출 제한 시간이 종료되었습니다. ${featureName ? `'${featureName}' 기능을 ` : ''}다시 시도할 수 있습니다.`, "info");
        }, GEMINI_QUOTA_COOLDOWN_MS);
    }
};

const parseGeminiError = (error: any): { detailedErrorMessage: string; statusCode?: number; geminiErrorStatus?: string; isQuotaExhaustedError: boolean; isRateLimitErrorForRetry: boolean; displayErrorMsg: string } => {
    let detailedErrorMessage = "";
    let statusCode: number | undefined;
    let geminiErrorStatus: string | undefined;
    let displayErrorMsg = String(error);

    if (error && error.error && typeof error.error.message === 'string') { // Standard Gemini API error object
        detailedErrorMessage = error.error.message.toLowerCase();
        displayErrorMsg = error.error.message; // Keep original case for display
        if (typeof error.error.code === 'number') {
            statusCode = error.error.code;
        }
        if (typeof error.error.status === 'string') {
            geminiErrorStatus = error.error.status.toUpperCase();
        }
    } else if (error && typeof error.message === 'string') { // General JavaScript Error object
        detailedErrorMessage = error.message.toLowerCase();
        displayErrorMsg = error.message;
        if (error.status && typeof error.status === 'number') {
            statusCode = error.status;
        }
    } else { 
        detailedErrorMessage = String(error).toLowerCase();
    }

    const isQuotaExhaustedError = (
        (statusCode === 429 && (detailedErrorMessage.includes('quota') || geminiErrorStatus === 'RESOURCE_EXHAUSTED')) ||
        (!statusCode && detailedErrorMessage.includes('quota') && (detailedErrorMessage.includes('exceeded') || detailedErrorMessage.includes('exhausted'))) ||
        geminiErrorStatus === 'RESOURCE_EXHAUSTED'
    );

    const isRateLimitErrorForRetry = (statusCode === 429 && !isQuotaExhaustedError);
    
    return { detailedErrorMessage, statusCode, geminiErrorStatus, isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg };
};


const generateWordDetailsWithGemini = async (term: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 7000): Promise<Partial<Word> | null> => {
    if (!ai) {
        addToast("AI 기능을 사용하려면 API 키가 필요합니다. 환경 변수를 확인해주세요.", "warning");
        return null;
    }
    if (isCurrentlyGeminiQuotaExhausted) {
        addToast(`Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. '${term}'에 대한 정보 가져오기를 건너뜁니다.`, "warning");
        return null;
    }

    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const featureDescription = `'${term}' 단어 정보 조회`;
    const promptText = `Provide details for the English word "${term}". Your response MUST be a JSON object with the following fields: "pronunciation" (phonetic, optional), "partOfSpeech" (e.g., noun, verb, adjective, in Korean e.g., 명사, 동사), "meaning" (Korean meaning), "exampleSentence" (simple English example), "exampleSentenceMeaning" (Korean translation of example). Ensure exampleSentence is appropriate for language learners. If "${term}" seems like a typo or not a common English word, try to correct it if obvious and return details for the corrected term, including the corrected "term" in the JSON. If correction is not obvious or it's not a word, return null for all fields.

Example JSON:
{
  "term": "person", 
  "pronunciation": "/ˈpɜːrsən/",
  "partOfSpeech": "명사",
  "meaning": "사람",
  "exampleSentence": "This is a person.",
  "exampleSentenceMeaning": "이것은 사람입니다."
}`;

    let currentDelay = initialDelay;

    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for ${featureDescription}, attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                      responseMimeType: "application/json",
                      temperature: 0.5, 
                    }
                });
                
                let jsonStr = response.text.trim();
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }

                const data = JSON.parse(jsonStr) as Partial<Word>;
                
                if (!data.partOfSpeech || !data.meaning || !data.exampleSentence) {
                    console.warn(`Gemini response missing essential fields for ${featureDescription} (attempt ${i + 1}/${retries + 1}):`, data);
                    if (i < retries) { 
                        addToast(`AI가 ${featureDescription} 정보를 일부 누락하여 반환했습니다. 재시도 중...(${i+1}/${retries+1})`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue; 
                    } else { 
                        addToast(`AI가 ${featureDescription}에 대한 충분한 정보를 제공하지 못했습니다. (누락된 필드: 뜻, 품사, 또는 예문) 모든 시도 실패.`, "error");
                        return { term }; 
                    }
                }
                return data;

            } catch (error: any) {
                const { isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);

                if (isQuotaExhaustedError) {
                    console.warn(`Gemini API call for ${featureDescription} failed on attempt ${i + 1}/${retries + 1} due to QUOTA EXHAUSTION (Code: ${statusCode}, Status: ${geminiErrorStatus}). Error: ${displayErrorMsg}. Cooldown will be activated. No further retries for this call.`);
                    setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                    return null; 
                }
                
                console.error(`Error during ${featureDescription} (attempt ${i + 1}/${retries + 1}). Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);

                if (i < retries) { 
                    if (isRateLimitErrorForRetry) { 
                        addToast(`Gemini API 요청 빈도가 높아 ${featureDescription} 가져오기에 실패했습니다. ${currentDelay/1000}초 후 재시도합니다...`, "warning");
                    } else { 
                        addToast(`${featureDescription} 가져오기 중 오류 발생. ${currentDelay/1000}초 후 재시도합니다... (오류: ${displayErrorMsg})`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitErrorForRetry) {
                         addToast(`Gemini API 요청 빈도가 너무 높습니다 (${featureDescription}). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`${featureDescription} 정보를 AI로부터 가져오는 데 최종 실패했습니다. (오류: ${displayErrorMsg})`, "error");
                    }
                    return null; 
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
    console.warn(`generateWordDetailsWithGemini for ${featureDescription} failed after all retries or due to unexpected flow.`);
    addToast(`${featureDescription} 정보를 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};

interface AIExampleSentence {
    newExampleSentence: string;
    newExampleSentenceMeaning: string;
}

const generateDifferentExampleSentenceWithGemini = async (word: Word, grade: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 7000): Promise<AIExampleSentence | null> => {
    if (!ai) {
        addToast("AI 기능을 사용하려면 API 키가 필요합니다.", "warning");
        return null;
    }
     if (isCurrentlyGeminiQuotaExhausted) {
        addToast(`Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. '${word.term}'의 새 예문 생성을 건너뜁니다.`, "warning");
        return null;
    }
    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const featureDescription = `'${word.term}' AI 예문 생성`;
    const promptText = `You are an English vocabulary tutor for Korean students.
The user is learning the word: "${word.term}" (Part of speech: ${word.partOfSpeech}, Korean meaning: ${word.meaning}).
The user's current grade level is: ${grade}.
The user has already seen this example: "${word.exampleSentence}"

Generate ONE NEW, DIFFERENT, and SIMPLE English example sentence for the word "${word.term}" that is appropriate for a ${grade} Korean student.
The new example sentence should clearly illustrate the meaning of "${word.term}".
Your response MUST be a JSON object with the following fields:
"newExampleSentence": "The new English example sentence.",
"newExampleSentenceMeaning": "The Korean translation of the new example sentence."

Example JSON response:
{
  "newExampleSentence": "She showed great courage when she helped the lost child.",
  "newExampleSentenceMeaning": "그녀는 길 잃은 아이를 도왔을 때 대단한 용기를 보여주었다."
}`;

    let currentDelay = initialDelay;
    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for ${featureDescription}, attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                      responseMimeType: "application/json",
                      temperature: 0.7, 
                    }
                });
                
                let jsonStr = response.text.trim();
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }
                const data = JSON.parse(jsonStr) as AIExampleSentence;

                if (!data.newExampleSentence || !data.newExampleSentenceMeaning) {
                     console.warn(`Gemini response missing newExampleSentence or newExampleSentenceMeaning for ${featureDescription} (attempt ${i + 1}/${retries + 1}):`, data);
                     if (i < retries) {
                        addToast(`AI가 ${featureDescription} 정보를 일부 누락하여 반환했습니다. 재시도 중...`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue;
                     } else {
                        addToast(`AI가 ${featureDescription}에 대한 정보를 충분히 제공하지 못했습니다. 모든 시도 실패.`, "error");
                        return null;
                     }
                }
                return data;

            } catch (error: any) {
                const { isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);
                
                if (isQuotaExhaustedError) {
                    console.warn(`Gemini API call for ${featureDescription} failed on attempt ${i + 1}/${retries + 1} due to QUOTA EXHAUSTION (Code: ${statusCode}, Status: ${geminiErrorStatus}). Error: ${displayErrorMsg}. Cooldown will be activated. No further retries for this call.`);
                    setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                    return null; 
                }

                console.error(`Error during ${featureDescription} (attempt ${i + 1}/${retries + 1}). Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);

                if (i < retries) { 
                    if (isRateLimitErrorForRetry) { 
                        addToast(`Gemini API 요청 빈도가 높아 ${featureDescription}에 실패했습니다. ${currentDelay/1000}초 후 재시도합니다...`, "warning");
                    } else { 
                        addToast(`${featureDescription} 중 오류 발생. ${currentDelay/1000}초 후 재시도합니다... (오류: ${displayErrorMsg})`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2; 
                } else { 
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 너무 높습니다 (${featureDescription}). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다: ${displayErrorMsg}`, "error");
                    }
                    return null;
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
    console.warn(`generateDifferentExampleSentenceWithGemini for ${featureDescription} failed after all retries or due to unexpected flow.`);
    addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};

const generateSummaryWithGemini = async (textToSummarize: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 5000): Promise<string | null> => {
    if (!ai) {
        addToast("AI 요약 기능을 사용하려면 API 키가 필요합니다.", "warning");
        return null;
    }
    if (isCurrentlyGeminiQuotaExhausted) {
        addToast("Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. 텍스트 요약을 건너뜁니다.", "warning");
        return null;
    }
    if (!textToSummarize.trim()) {
        addToast("요약할 텍스트가 없습니다.", "info");
        return null;
    }
    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const featureDescription = "텍스트 요약";
    const promptText = `Your response MUST be a JSON object with a "summary" field. Please provide a brief summary of the following text in Korean (around 2-3 sentences), focusing on the main topics or themes. Text: """${textToSummarize.substring(0, 30000)}"""`; 

    let currentDelay = initialDelay;
    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for ${featureDescription}, attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.6,
                    }
                });

                let jsonStr = response.text.trim();
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }
                const data = JSON.parse(jsonStr) as { summary: string };

                if (!data.summary || !data.summary.trim()) {
                    console.warn(`Gemini response missing summary field for ${featureDescription} (attempt ${i + 1}/${retries + 1}).`, data);
                    if (i < retries) {
                        addToast(`AI 요약 생성 중 내용이 누락되었습니다. 재시도 중...`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue;
                    } else {
                        addToast(`AI가 텍스트 요약을 제공하지 못했습니다. 모든 시도 실패.`, "error");
                        return null;
                    }
                }
                return data.summary;

            } catch (error: any) {
                const { isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);

                if (isQuotaExhaustedError) {
                    console.warn(`Gemini API call for ${featureDescription} failed on attempt ${i + 1}/${retries + 1} due to QUOTA EXHAUSTION (Code: ${statusCode}, Status: ${geminiErrorStatus}). Error: ${displayErrorMsg}. Cooldown will be activated. No further retries for this call.`);
                    setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                    return null; 
                }
                
                console.error(`Error during ${featureDescription} (attempt ${i + 1}/${retries + 1}). Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);

                if (i < retries) {
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 높아 ${featureDescription}에 실패했습니다. ${currentDelay / 1000}초 후 재시도합니다...`, "warning");
                    } else {
                        addToast(`${featureDescription} 중 오류 발생. ${currentDelay / 1000}초 후 재시도합니다... (오류: ${displayErrorMsg})`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 너무 높습니다 (${featureDescription}). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다: ${displayErrorMsg}`, "error");
                    }
                    return null;
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
     console.warn(`generateSummaryWithGemini for ${featureDescription} failed after all retries or due to unexpected flow.`);
    addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};

const generateImageForWordWithGemini = async (wordTerm: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 1, initialDelay = 8000): Promise<string | null> => {
    if (!ai) {
        addToast("AI 이미지 생성 기능을 사용하려면 API 키가 필요합니다.", "warning");
        return null;
    }
    if (isCurrentlyGeminiQuotaExhausted) {
        addToast(`Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. '${wordTerm}'의 이미지 생성을 건너뜁니다.`, "warning");
        return null;
    }
    setGlobalLoading(true);
    const modelName = 'imagen-3.0-generate-002';
    const featureDescription = `'${wordTerm}' AI 이미지 생성`;
    const prompt = `A clear, simple, educational, dictionary illustration style image representing the English word: "${wordTerm}". Focus on a single, easily recognizable subject related to the word's most common meaning. Vibrant and kid-friendly.`;

    let currentDelay = initialDelay;
    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for ${featureDescription}, attempt ${i + 1}/${retries + 1}`);
                const response = await ai.models.generateImages({
                    model: modelName,
                    prompt: prompt,
                    config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }, 
                });

                if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
                    addToast(`${featureDescription}이(가) 완료되었습니다.`, "success");
                    return response.generatedImages[0].image.imageBytes;
                } else {
                    console.warn(`Gemini image response missing imageBytes for ${featureDescription} (attempt ${i + 1}/${retries + 1}):`, response);
                    if (i < retries) {
                        addToast(`AI가 '${wordTerm}' 이미지를 반환했지만 데이터가 누락되었습니다. 재시도 중...`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue;
                    } else {
                        addToast(`AI가 '${wordTerm}'에 대한 이미지를 제공하지 못했습니다. 모든 시도 실패.`, "error");
                        return null;
                    }
                }
            } catch (error: any) {
                const { isQuotaExhaustedError, isRateLimitErrorForRetry, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);

                if (isQuotaExhaustedError) {
                    console.warn(`Gemini API call for ${featureDescription} failed on attempt ${i + 1}/${retries + 1} due to QUOTA EXHAUSTION (Code: ${statusCode}, Status: ${geminiErrorStatus}). Error: ${displayErrorMsg}. Cooldown will be activated. No further retries for this call.`);
                    setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                    return null; 
                }

                console.error(`Error during ${featureDescription} (attempt ${i + 1}/${retries + 1}). Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);
                
                if (i < retries) {
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 높아 ${featureDescription}에 실패했습니다. ${currentDelay / 1000}초 후 재시도합니다...`, "warning");
                    } else {
                        addToast(`${featureDescription} 중 오류 발생. ${currentDelay / 1000}초 후 재시도합니다... (오류: ${displayErrorMsg})`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitErrorForRetry) {
                        addToast(`Gemini API 요청 빈도가 너무 높습니다 (${featureDescription}). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다: ${displayErrorMsg}`, "error");
                    }
                    return null;
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
    console.warn(`generateImageForWordWithGemini for ${featureDescription} failed after all retries or due to unexpected flow.`);
    addToast(`${featureDescription}을 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};


// --- UI Components ---

// Confirmation Modal
interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
}
const ConfirmationModal: React.FC<ConfirmationModalProps> = React.memo(({ isOpen, title, message, onConfirm, onCancel, confirmText = "확인", cancelText = "취소", confirmButtonClass = "bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800" }) => {
    if (!isOpen) return null;

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title" className="fixed inset-0 bg-slate-900/75 dark:bg-slate-900/80 flex justify-center items-center p-4 z-[60] animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 id="confirmation-modal-title" className="text-xl font-semibold text-cyan-600 dark:text-cyan-400 mb-4">{title}</h3>
                <p className="text-slate-600 dark:text-slate-300 mb-6">{message}</p>
                <div className="flex justify-end space-x-3">
                    <button onClick={onCancel} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded text-slate-700 dark:text-white transition-colors">
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} className={`px-4 py-2 rounded text-white transition-colors ${confirmButtonClass}`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
});


// Edit Settings Modal
interface EditSettingsModalProps {
    isOpen: boolean;
    currentSettings: UserSettings;
    onSave: (newSettings: UserSettings) => void;
    onCancel: () => void;
    onResetData: () => void;
    addToast: (message: string, type: ToastMessage['type']) => void;
}
const EditSettingsModal: React.FC<EditSettingsModalProps> = React.memo(({ isOpen, currentSettings, onSave, onCancel, onResetData, addToast }) => {
    const [username, setUsername] = useState(currentSettings.username);
    const [grade, setGrade] = useState(currentSettings.grade);
    const [dailyGoal, setDailyGoal] = useState(currentSettings.dailyGoal);
    const [theme, setTheme] = useState(currentSettings.theme);
    const [speechRate, setSpeechRate] = useState(currentSettings.speechRate);
    const [autoPlayAudio, setAutoPlayAudio] = useState(currentSettings.autoPlayAudio);
    const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

    useEffect(() => {
        setUsername(currentSettings.username);
        setGrade(currentSettings.grade);
        setDailyGoal(currentSettings.dailyGoal);
        setTheme(currentSettings.theme);
        setSpeechRate(currentSettings.speechRate);
        setAutoPlayAudio(currentSettings.autoPlayAudio);
    }, [currentSettings, isOpen]); 

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) {
            addToast("사용자 이름은 비워둘 수 없습니다.", "warning");
            return;
        }
        onSave({ ...currentSettings, username: username.trim(), grade, dailyGoal, theme, speechRate, autoPlayAudio });
    };

    const handleResetClick = () => {
        setShowResetConfirmModal(true);
    };

    const confirmResetData = () => {
        onResetData();
        setShowResetConfirmModal(false);
        onCancel(); // Close settings modal after reset initiated
    };

    return (
        <>
        <div role="dialog" aria-modal="true" aria-labelledby="edit-settings-modal-title" className="fixed inset-0 bg-slate-900/75 dark:bg-slate-900/80 flex justify-center items-center p-4 z-[60] animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h3 id="edit-settings-modal-title" className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-6 text-center">설정 변경</h3>
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Username, Grade, Daily Goal */}
                    <div>
                        <label htmlFor="edit-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">사용자 이름</label>
                        <input type="text" id="edit-username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" required />
                    </div>
                    <div>
                        <label htmlFor="edit-grade" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">학년 선택</label>
                        <select id="edit-grade" value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
                            <option value="middle1">중학교 1학년</option>
                            <option value="middle2">중학교 2학년</option>
                            <option value="middle3">중학교 3학년</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="edit-dailyGoal" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">일일 학습 목표 (단어 수)</label>
                        <input type="number" id="edit-dailyGoal" value={dailyGoal} onChange={(e) => setDailyGoal(Math.max(1, parseInt(e.target.value) || 1))} min="1" className="w-full p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                    </div>

                     {/* Theme Selection */}
                    <div>
                        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">테마 선택</span>
                        <div className="flex space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="radio" name="theme" value="light" checked={theme === 'light'} onChange={() => setTheme('light')} className="form-radio text-cyan-500 focus:ring-cyan-500"/>
                                <span className="text-slate-700 dark:text-slate-300">밝은 테마</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="radio" name="theme" value="dark" checked={theme === 'dark'} onChange={() => setTheme('dark')} className="form-radio text-cyan-500 focus:ring-cyan-500"/>
                                <span className="text-slate-700 dark:text-slate-300">어두운 테마</span>
                            </label>
                        </div>
                    </div>

                    {/* Speech Rate */}
                    <div>
                        <label htmlFor="edit-speechRate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">말하기 속도: <span className="font-semibold text-cyan-600 dark:text-cyan-400">{speechRate.toFixed(1)}x</span></label>
                        <input type="range" id="edit-speechRate" min="0.5" max="2" step="0.1" value={speechRate} onChange={(e) => setSpeechRate(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                    </div>

                    {/* Auto-play Audio */}
                    <div className="flex items-center justify-between">
                         <span className="text-sm font-medium text-slate-700 dark:text-slate-300">학습 중 새 단어 자동 재생</span>
                        <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                            <input type="checkbox" name="autoPlayAudio" id="autoPlayAudio-toggle" checked={autoPlayAudio} onChange={() => setAutoPlayAudio(!autoPlayAudio)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer border-slate-300 dark:border-slate-500"/>
                            <label htmlFor="autoPlayAudio-toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-slate-300 dark:bg-slate-500 cursor-pointer"></label>
                        </div>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-5 space-y-3">
                         <button 
                            type="button" 
                            onClick={handleResetClick}
                            className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 rounded text-white text-sm"
                        >
                            학습 데이터 초기화
                        </button>
                        <div className="flex justify-end space-x-3">
                            <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded text-slate-700 dark:text-white">취소</button>
                            <button type="submit" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded text-white">저장</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
        <ConfirmationModal
                isOpen={showResetConfirmModal}
                title="데이터 초기화 확인"
                message="정말로 모든 학습 데이터와 설정을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                onConfirm={confirmResetData}
                onCancel={() => setShowResetConfirmModal(false)}
                confirmText="초기화"
                confirmButtonClass="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            />
        </>
    );
});


// Navigation Bar Component
interface NavBarProps {
    currentScreen: AppScreen;
    onNavigate: (screen: AppScreen) => void;
    userSettings: UserSettings | null; 
    onOpenSettings: () => void;
}

const NavBar: React.FC<NavBarProps> = React.memo(({ currentScreen, onNavigate, userSettings, onOpenSettings }) => {
    const navItems: { screen: AppScreen; label: string; icon: string }[] = [
        { screen: 'dashboard', label: '대시보드', icon: '🏠' },
        { screen: 'learnWords', label: '단어 학습', icon: '📖' },
        { screen: 'quiz', label: '퀴즈', icon: '📝' },
        { screen: 'tutorChat', label: 'AI 튜터', icon: '💬' },
        { screen: 'gameSelection', label: '게임 모드', icon: '🎮' },
        { screen: 'allWords', label: '전체 단어', icon: '📚' },
        { screen: 'wordsByUnit', label: '단원별 단어', icon: '🗂️' },
        { screen: 'manageWords', label: '단어 관리', icon: '➕' },
        { screen: 'stats', label: '통계', icon: '📊' },
    ];

    if (!userSettings) return null; 

    return (
        <nav className="bg-slate-100 dark:bg-slate-700 p-3 shadow-md sticky top-0 z-50 border-b border-slate-200 dark:border-slate-600">
            <ul className="flex flex-wrap justify-center items-center gap-1 sm:gap-2">
                {navItems.map((item) => (
                    <li key={item.screen}>
                        <button
                            onClick={() => onNavigate(item.screen)}
                            aria-current={currentScreen === item.screen ? "page" : undefined}
                            className={`flex flex-col sm:flex-row items-center justify-center p-1.5 sm:px-2.5 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors duration-150 ease-in-out
                                ${currentScreen === item.screen
                                    ? 'bg-cyan-500 text-white shadow-lg ring-2 ring-cyan-300 dark:ring-cyan-600'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-800 dark:hover:text-white'
                                }`}
                        >
                            <span className="text-base sm:text-lg sm:mr-1.5 mb-0.5 sm:mb-0">{item.icon}</span>
                            {item.label}
                        </button>
                    </li>
                ))}
                 <li>
                    <button
                        onClick={onOpenSettings}
                        title="설정 변경"
                        aria-label="설정 변경"
                        className="flex flex-col sm:flex-row items-center justify-center p-1.5 sm:px-2.5 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-800 dark:hover:text-white transition-colors"
                    >
                        <span className="text-base sm:text-lg sm:mr-1.5 mb-0.5 sm:mb-0">⚙️</span>
                        <span className="hidden sm:inline">설정</span>
                        <span className="sm:hidden">설정</span>
                    </button>
                </li>
            </ul>
        </nav>
    );
});


// Login/Setup Screen Component
interface LoginSetupScreenProps extends Omit<ScreenProps, 'userSettings' | 'setGlobalLoading' | 'addToast' | 'openSettingsModal' | 'currentScreen' | 'addXp'> {
    onSetupComplete: (settings: UserSettings) => void;
    addToast: (message: string, type: ToastMessage['type']) => void; 
}

const LoginSetupScreen: React.FC<LoginSetupScreenProps> = ({ onNavigate, onSetupComplete, addToast }) => {
    const [username, setUsername] = useState('');
    const [grade, setGrade] = useState('middle1');
    const [dailyGoal, setDailyGoal] = useState(10);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) {
            addToast("사용자 이름을 입력해주세요.", "warning");
            return;
        }
        onSetupComplete({ 
            username: username.trim(), 
            grade, 
            textbook: '', 
            dailyGoal,
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', 
            speechRate: 1.0, 
            autoPlayAudio: true,
            xp: 0,
            level: 1,
        });
    };

    return (
        <div className="p-6 sm:p-8 bg-slate-100 dark:bg-slate-800 min-h-screen flex flex-col justify-center items-center">
            <div className="w-full max-w-md bg-white dark:bg-slate-700 p-8 rounded-xl shadow-2xl">
                <h1 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-8 text-center">AI 영단어 학습 설정</h1>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">사용자 이름</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 bg-slate-100 dark:bg-slate-600 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="이름을 입력하세요"
                            aria-required="true"
                        />
                    </div>
                    <div>
                        <label htmlFor="grade" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">학년 선택</label>
                        <select
                            id="grade"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            className="w-full p-3 bg-slate-100 dark:bg-slate-600 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            aria-required="true"
                        >
                            <option value="middle1">중학교 1학년</option>
                            <option value="middle2">중학교 2학년</option>
                            <option value="middle3">중학교 3학년</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="dailyGoal" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">일일 학습 목표 (단어 수)</label>
                        <input
                            type="number"
                            id="dailyGoal"
                            value={dailyGoal}
                            onChange={(e) => setDailyGoal(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            className="w-full p-3 bg-slate-100 dark:bg-slate-600 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            aria-required="true"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-75"
                    >
                        학습 시작
                    </button>
                </form>
            </div>
        </div>
    );
};


// Dashboard Screen Component
interface DashboardScreenProps extends ScreenProps {
    allWords: Word[]; 
    wordStats: Record<string, WordStat>;
    learnedWordsToday: number;
    totalWordsLearned: number;
    learningStreak: { currentStreak: number; bestStreak: number };
    averageQuizScore: number;
    quizTakenToday: boolean;
    hasIncorrectWordsToReview: boolean;
}
const DashboardScreen: React.FC<DashboardScreenProps> = React.memo(({ 
    userSettings, 
    onNavigate, 
    learnedWordsToday, 
    totalWordsLearned,
    learningStreak,
    averageQuizScore,
    quizTakenToday,
    hasIncorrectWordsToReview,
    addToast
}) => {
    const dailyGoalAchieved = learnedWordsToday >= userSettings.dailyGoal;
    const xpForNextLevel = (userSettings.level) * 100; // Example: Level 1 needs 100 XP total, Level 2 needs 200 XP total for next level

    const renderChallengeItem = (text: string, isAchieved: boolean, reward: number, actionButton?: {label: string, onClick: () => void}) => (
         <li className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-md shadow-sm">
            <div className="flex items-center">
                <span className={`mr-3 text-xl ${isAchieved ? 'text-green-500' : 'text-slate-400 dark:text-slate-500'}`}>
                    {isAchieved ? '✅' : '⚪'}
                </span>
                <span className={`text-sm sm:text-base ${isAchieved ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    {text}
                </span>
            </div>
            {actionButton && !isAchieved ? (
                 <button 
                    onClick={actionButton.onClick}
                    className="ml-2 px-2 py-1 text-xs bg-cyan-500 hover:bg-cyan-600 text-white rounded-md"
                >
                    {actionButton.label}
                </button>
            ) : (
                <span className={`text-xs font-medium ${isAchieved ? 'text-green-500' : 'text-yellow-500 dark:text-yellow-400'}`}>
                    +{reward} XP
                </span>
            )}
        </li>
    );

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400">
                안녕하세요, {userSettings.username}님! 👋 (Lv. {userSettings.level})
            </h1>

            {/* XP and Level Progress */}
            <div className="bg-slate-100 dark:bg-slate-700 p-4 sm:p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-1">
                    <h2 className="text-md sm:text-lg font-semibold text-cyan-700 dark:text-cyan-300">경험치 (XP)</h2>
                    <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Lv. {userSettings.level}</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
                    {userSettings.xp} / {xpForNextLevel} XP
                </p>
                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2.5 sm:h-3.5 mt-2 overflow-hidden" role="progressbar" aria-valuenow={userSettings.xp} aria-valuemin={0} aria-valuemax={xpForNextLevel}>
                    <div
                        className="bg-yellow-500 h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(100, (userSettings.xp / Math.max(1, xpForNextLevel)) * 100)}%` }}
                    ></div>
                </div>
                 <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right">다음 레벨까지 {Math.max(0, xpForNextLevel - userSettings.xp)} XP</p>
            </div>


            {/* Today's Learning Goal */}
            <div className="bg-slate-100 dark:bg-slate-700 p-4 sm:p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg sm:text-xl font-semibold text-cyan-700 dark:text-cyan-300">오늘의 학습 목표</h2>
                    <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${dailyGoalAchieved ? 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-700 dark:text-yellow-100'}`}>
                        {dailyGoalAchieved ? '목표 달성! 🎉' : '진행 중'}
                    </span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">{learnedWordsToday} / {userSettings.dailyGoal} 단어</p>
                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-3 sm:h-4 mt-3 overflow-hidden" role="progressbar" aria-valuenow={learnedWordsToday} aria-valuemin={0} aria-valuemax={userSettings.dailyGoal}>
                    <div
                        className="bg-green-500 h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(100, (learnedWordsToday / Math.max(1,userSettings.dailyGoal)) * 100)}%` }}
                    ></div>
                </div>
            </div>

            {/* Key Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg text-center sm:text-left">
                    <h3 className="text-md sm:text-lg font-semibold text-cyan-700 dark:text-cyan-300 mb-1">📚 총 학습 단어</h3>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white">{totalWordsLearned} <span className="text-sm">개</span></p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg text-center sm:text-left">
                    <h3 className="text-md sm:text-lg font-semibold text-cyan-700 dark:text-cyan-300 mb-1">🔥 연속 학습</h3>
                    <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">현재: {learningStreak.currentStreak}일</p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">최고: {learningStreak.bestStreak}일</p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg text-center sm:text-left">
                    <h3 className="text-md sm:text-lg font-semibold text-cyan-700 dark:text-cyan-300 mb-1">📊 학습 요약</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">오늘 학습: <span className="font-semibold">{learnedWordsToday}</span> 단어</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">평균 퀴즈 정답률: <span className="font-semibold">{averageQuizScore.toFixed(1)}%</span></p>
                </div>
            </div>
            
            {/* Today's Challenges */}
            <div className="bg-slate-100 dark:bg-slate-700 p-4 sm:p-6 rounded-lg shadow-lg">
                <h2 className="text-lg sm:text-xl font-semibold text-cyan-700 dark:text-cyan-300 mb-3">⭐ 오늘의 도전 과제</h2>
                <ul className="space-y-2">
                    {renderChallengeItem(
                        `오늘 단어 ${userSettings.dailyGoal}개 학습`,
                        dailyGoalAchieved,
                        20
                    )}
                    {renderChallengeItem(
                        "퀴즈 1회 완료",
                        quizTakenToday,
                        15,
                        !quizTakenToday ? { label: "퀴즈 풀기", onClick: () => onNavigate('quiz') } : undefined
                    )}
                     {renderChallengeItem( // New challenge for Game Mode
                        "게임 모드 1회 플레이",
                        false, // This would require tracking game plays, for now always shows as incomplete
                        25,
                        { label: "게임 하러가기", onClick: () => onNavigate('gameSelection') }
                    )}
                    {renderChallengeItem(
                        "오답 단어 복습하기",
                        false, 
                        10,
                        hasIncorrectWordsToReview ? { label: "복습 하러가기", onClick: () => onNavigate('quiz') } : { label: "오답 없음", onClick: () => addToast("복습할 오답 단어가 없습니다!", "info") }
                    )}
                </ul>
            </div>
            
            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                 <button
                    onClick={() => onNavigate('learnWords')}
                    className="py-3 px-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                    <span className="text-xl mr-2" aria-hidden="true">📖</span> 학습
                </button>
                 <button
                    onClick={() => onNavigate('quiz')}
                    className="py-3 px-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                     <span className="text-xl mr-2" aria-hidden="true">📝</span> 퀴즈
                </button>
                 <button // Updated to Game Mode
                    onClick={() => onNavigate('gameSelection')}
                    className="py-3 px-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                     <span className="text-xl mr-2" aria-hidden="true">🎮</span> 게임
                </button>
                 <button
                    onClick={() => onNavigate('tutorChat')}
                    className="py-3 px-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                     <span className="text-xl mr-2" aria-hidden="true">💬</span> AI튜터
                </button>
            </div>

            <footer className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-600 text-center text-xs text-slate-500 dark:text-slate-400">
                <a href="#" onClick={(e)=>{e.preventDefault(); addToast("도움말 기능은 준비 중입니다.", "info")}} className="hover:underline">도움말</a>
                <span className="mx-2">|</span>
                <a href="#" onClick={(e)=>{e.preventDefault(); addToast("앱 설치 안내는 준비 중입니다. 브라우저의 '홈 화면에 추가' 기능을 사용해보세요.", "info")}} className="hover:underline">앱 설치 안내</a>
            </footer>
        </div>
    );
});


// LearnWords Screen Component
interface LearnWordsScreenProps extends ScreenProps {
    words: Word[];
    wordStats: Record<string | number, WordStat>;
    onWordLearned: (wordId: number | string, isQuickReview?: boolean) => void;
}

const SESSION_STORAGE_CURRENT_INDEX_KEY = 'learnWords_currentIndex';
const SESSION_STORAGE_WORD_SET_SIGNATURE_KEY = 'learnWords_wordSetSignature';

const LearnWordsScreen: React.FC<LearnWordsScreenProps> = ({ userSettings, onNavigate, words, wordStats, onWordLearned, addToast, setGlobalLoading }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentWordsSet, setCurrentWordsSet] = useState<Word[]>([]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isDailyGoalFinished, setIsDailyGoalFinished] = useState(false);
    const [isQuickReviewActive, setIsQuickReviewActive] = useState(false);
    const [isQuickReviewFinished, setIsQuickReviewFinished] = useState(false);

    const [aiExample, setAiExample] = useState<AIExampleSentence | null>(null);
    const [isFetchingAiExample, setIsFetchingAiExample] = useState(false);
    
    const [aiGeneratedImage, setAiGeneratedImage] = useState<string | null>(null);
    const [isFetchingAiImage, setIsFetchingAiImage] = useState(false);

    const getWordStat = useCallback((wordId: string | number) => {
        return wordStats[wordId] || getDefaultWordStat(wordId);
    }, [wordStats]);
    
    const selectWords = useCallback((count: number, forQuickReview: boolean) => {
        const today = getTodayDateString();
        let eligibleWords = words.filter(w => {
            const stat = getWordStat(w.id);
            return w.gradeLevel === userSettings.grade && !stat.isMastered;
        });

        if (forQuickReview) {
            eligibleWords = eligibleWords.filter(w => {
                const stat = getWordStat(w.id);
                return stat.lastReviewed && stat.lastReviewed.split('T')[0] !== today;
            });
        } else {
             eligibleWords = eligibleWords.filter(w => {
                const stat = getWordStat(w.id);
                return !stat.lastReviewed || stat.lastReviewed.split('T')[0] !== today;
             });
        }
        
        eligibleWords.sort((a, b) => {
            const statA = getWordStat(a.id);
            const statB = getWordStat(b.id);
            if (statB.quizIncorrectCount !== statA.quizIncorrectCount) return statB.quizIncorrectCount - statA.quizIncorrectCount;
            const dateA = statA.lastReviewed ? new Date(statA.lastReviewed).getTime() : 0;
            const dateB = statB.lastReviewed ? new Date(statB.lastReviewed).getTime() : 0;
            if (dateA !== dateB) return dateA - dateB; // Older words first
            if (a.isCustom && !b.isCustom) return -1; // Custom words first
            if (!a.isCustom && b.isCustom) return 1;
            return 0;
        });
        return shuffleArray(eligibleWords).slice(0, count);
    }, [words, userSettings.grade, getWordStat]);

    const resetWordSpecificStates = useCallback(() => {
        setIsFlipped(false);
        setAiExample(null);
        setIsFetchingAiExample(false);
        setAiGeneratedImage(null);
        setIsFetchingAiImage(false);
    }, []);

    const clearLearningSessionState = useCallback(() => {
        try {
            sessionStorage.removeItem(SESSION_STORAGE_CURRENT_INDEX_KEY);
            sessionStorage.removeItem(SESSION_STORAGE_WORD_SET_SIGNATURE_KEY);
        } catch (error) {
            console.warn("Could not clear learning session state from sessionStorage:", error);
        }
    },[]);

    useEffect(() => {
        const dailyWordsToInitializeWith = selectWords(userSettings.dailyGoal, false);
        const newWordSetSignature = dailyWordsToInitializeWith.map(w => w.id).join(',');
        let initialIndex = 0;
        
        try {
            const storedIndexStr = sessionStorage.getItem(SESSION_STORAGE_CURRENT_INDEX_KEY);
            const storedSignature = sessionStorage.getItem(SESSION_STORAGE_WORD_SET_SIGNATURE_KEY);

            if (storedSignature === newWordSetSignature && storedIndexStr !== null) {
                const storedIndex = parseInt(storedIndexStr, 10);
                if (!isNaN(storedIndex) && storedIndex >= 0 && storedIndex < dailyWordsToInitializeWith.length) {
                    initialIndex = storedIndex;
                } else {
                     clearLearningSessionState(); 
                }
            } else {
                 clearLearningSessionState(); 
                 if (newWordSetSignature && dailyWordsToInitializeWith.length > 0) { 
                    sessionStorage.setItem(SESSION_STORAGE_WORD_SET_SIGNATURE_KEY, newWordSetSignature);
                    sessionStorage.setItem(SESSION_STORAGE_CURRENT_INDEX_KEY, '0');
                 }
            }
        } catch (error) {
            console.warn("Error accessing sessionStorage for learning session:", error);
            clearLearningSessionState();
        }
        
        setCurrentWordsSet(dailyWordsToInitializeWith);
        setCurrentIndex(initialIndex);
        resetWordSpecificStates();
        
        setIsDailyGoalFinished(dailyWordsToInitializeWith.length === 0 || initialIndex >= dailyWordsToInitializeWith.length);
        setIsQuickReviewActive(false);
        setIsQuickReviewFinished(false);
        
        if (dailyWordsToInitializeWith.length > 0 && initialIndex < dailyWordsToInitializeWith.length && userSettings.autoPlayAudio) {
            speak(dailyWordsToInitializeWith[initialIndex].term, undefined, userSettings.speechRate);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps 
    }, [words, userSettings.grade, userSettings.dailyGoal, userSettings.autoPlayAudio, userSettings.speechRate]); 


    const currentWord = currentWordsSet[currentIndex];

    const handleNextWord = () => {
        if (!currentWord) return;
        onWordLearned(currentWord.id, isQuickReviewActive);
        resetWordSpecificStates();

        const nextIndex = currentIndex + 1;
        if (nextIndex < currentWordsSet.length) {
            setCurrentIndex(nextIndex);
            if (!isQuickReviewActive) { 
                 try {
                    sessionStorage.setItem(SESSION_STORAGE_CURRENT_INDEX_KEY, String(nextIndex));
                } catch (error) { console.warn("Error saving currentIndex to sessionStorage:", error); }
            }
            if (userSettings.autoPlayAudio) {
                speak(currentWordsSet[nextIndex].term, undefined, userSettings.speechRate); 
            }
        } else {
            if (isQuickReviewActive) {
                setIsQuickReviewFinished(true);
            } else {
                setIsDailyGoalFinished(true);
                clearLearningSessionState(); 
            }
        }
    };
    
    const startQuickReview = () => {
        clearLearningSessionState(); 
        const reviewWords = selectWords(3, true); 
        if (reviewWords.length > 0) {
            setCurrentWordsSet(reviewWords); 
            setCurrentIndex(0);
            
            resetWordSpecificStates();
            setIsQuickReviewActive(true);
            setIsDailyGoalFinished(false); 
            setIsQuickReviewFinished(false);
            if (userSettings.autoPlayAudio && reviewWords[0]) {
                 speak(reviewWords[0].term, undefined, userSettings.speechRate);
            }
        } else {
            addToast("복습할 이전 학습 단어가 더 이상 없습니다.", "info");
            setIsQuickReviewFinished(true); 
        }
    };
    
    const handleExitLearning = () => {
        if (!isQuickReviewActive) {
            clearLearningSessionState();
        }
        onNavigate('dashboard');
    };

    const handleRetryDailyLearning = useCallback(() => {
        clearLearningSessionState();
        const dailyWords = selectWords(userSettings.dailyGoal, false);
        const newWordSetSignature = dailyWords.map(w => w.id).join(',');

        setCurrentWordsSet(dailyWords);
        setCurrentIndex(0);
        resetWordSpecificStates();
        setIsDailyGoalFinished(dailyWords.length === 0);
        setIsQuickReviewActive(false);
        setIsQuickReviewFinished(false);
        
        if (dailyWords.length > 0) {
            if (newWordSetSignature) {
                 try {
                    sessionStorage.setItem(SESSION_STORAGE_WORD_SET_SIGNATURE_KEY, newWordSetSignature);
                    sessionStorage.setItem(SESSION_STORAGE_CURRENT_INDEX_KEY, '0');
                } catch (error) { console.warn("Error saving new session to sessionStorage:", error); }
            }
            if (userSettings.autoPlayAudio) {
                speak(dailyWords[0].term, undefined, userSettings.speechRate);
            }
            addToast("새로운 학습 세션을 시작합니다!", "info");
        } else {
            addToast("다시 학습할 단어가 없습니다. 모든 단어를 학습했거나 필터 조건에 맞는 단어가 없습니다.", "info");
        }
    }, [clearLearningSessionState, selectWords, userSettings.dailyGoal, userSettings.autoPlayAudio, userSettings.speechRate, resetWordSpecificStates, addToast]);


    const handleGenerateAiExample = async () => {
        if (!currentWord || !process.env.API_KEY) {
            if(!process.env.API_KEY) addToast("AI 예문 생성을 위해 API 키를 설정해주세요.", "warning");
            return;
        }
        setIsFetchingAiExample(true);
        setAiExample(null);
        const example = await generateDifferentExampleSentenceWithGemini(currentWord, userSettings.grade, addToast, setGlobalLoading);
        setAiExample(example);
        setIsFetchingAiExample(false);
    };

    const handleGenerateAiImage = async () => {
        if (!currentWord || !process.env.API_KEY) {
            if(!process.env.API_KEY) addToast("AI 이미지 생성을 위해 API 키를 설정해주세요.", "warning");
            return;
        }
        setIsFetchingAiImage(true);
        setAiGeneratedImage(null);
        const imageData = await generateImageForWordWithGemini(currentWord.term, addToast, setGlobalLoading);
        if(imageData) {
            setAiGeneratedImage(`data:image/jpeg;base64,${imageData}`);
        }
        setIsFetchingAiImage(false);
    };


    if (currentWordsSet.length === 0 && !isDailyGoalFinished && !isQuickReviewActive && !isQuickReviewFinished) { 
         return (
            <div className="p-8 text-center">
                <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-4">{userSettings.grade} 수준에 오늘 학습할 단어가 없습니다.</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6">모든 단어를 마스터했거나, 오늘 이미 모두 복습했습니다. '단어 관리'에서 단어를 추가하거나 다른 학년을 선택해보세요.</p>
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }
    
    if (isDailyGoalFinished && !isQuickReviewActive && !isQuickReviewFinished) {
        const potentialReviewWords = words.filter(w => {
            const stat = getWordStat(w.id);
            return w.gradeLevel === userSettings.grade && !stat.isMastered && stat.lastReviewed && stat.lastReviewed.split('T')[0] !== getTodayDateString();
        }).length;

        return (
            <div className="p-8 text-center">
                <h2 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">오늘의 학습 목표 완료! 🎉</h2>
                <p className="text-lg text-slate-700 dark:text-slate-300 mb-8">수고하셨습니다, {userSettings.username}님!</p>
                
                <button
                    onClick={handleRetryDailyLearning}
                    className="py-3 px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg shadow-md mb-4"
                >
                    🔁 다시 학습하기
                </button>

                {potentialReviewWords > 0 ? (
                    <button
                        onClick={startQuickReview}
                        className="py-3 px-6 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg shadow-md mb-4"
                    >
                        💡 빠른 복습 시작하기 ({Math.min(3, potentialReviewWords)} 단어)
                    </button>
                ) : (
                    <p className="text-slate-500 dark:text-slate-400 mb-4">복습할 이전 학습 단어가 없습니다.</p>
                )}
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }
    
    if (isQuickReviewFinished) {
        return (
             <div className="p-8 text-center">
                <h2 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">빠른 복습 완료! 👍</h2>
                <p className="text-lg text-slate-700 dark:text-slate-300 mb-8">모든 학습 활동을 마쳤습니다!</p>
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }

    if (!currentWord && (currentWordsSet.length > 0 || isDailyGoalFinished || isQuickReviewFinished)) { 
        return <div className="p-8 text-center text-xl text-slate-600 dark:text-slate-300">단어 로딩 상태 오류... 잠시만 기다려주세요.</div>;
    }
    
    if (!currentWord && !isDailyGoalFinished && !isQuickReviewFinished && currentWordsSet.length === 0) { 
         return (
            <div className="p-8 text-center">
                 <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-4">학습할 단어를 불러오는 중...</h2>
                 <p className="text-slate-500 dark:text-slate-400">문제가 지속되면 대시보드로 돌아가 다시 시도해주세요.</p>
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="mt-4 py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }
    
    if (!currentWord) { 
         return <div className="p-8 text-center text-xl text-slate-600 dark:text-slate-300">다음 단어 준비 중...</div>;
    }


    return (
        <div className="p-4 sm:p-8 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6 sm:mb-8">
                {isQuickReviewActive ? "빠른 복습" : "단어 학습"} ({currentWordsSet.length > 0 ? currentIndex + 1 : 0} / {currentWordsSet.length})
            </h1>

            <div className="w-full max-w-lg perspective">
                <div 
                    className={`card-inner ${isFlipped ? 'is-flipped' : ''} bg-slate-100 dark:bg-slate-700 rounded-xl shadow-2xl`}
                    onClick={() => { if (!isFlipped) setIsFlipped(true); }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isFlipped}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isFlipped) setIsFlipped(true); }}
                >
                    {/* Card Front */}
                    <div className="card-face card-front p-6 sm:p-8 text-center flex flex-col justify-center items-center">
                        <div className="mb-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); speak(currentWord.term, undefined, userSettings.speechRate); }} 
                                className="text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 text-2xl" 
                                aria-label="단어 발음 듣기"
                            >
                                🔊
                            </button>
                        </div>
                        <h2 className="text-4xl sm:text-5xl font-bold text-slate-800 dark:text-white mb-3">{currentWord.term}</h2>
                        {currentWord.pronunciation && <p className="text-slate-500 dark:text-slate-400 text-lg mb-4">[{currentWord.pronunciation}]</p>}
                        <p className="text-sm text-cyan-600 dark:text-cyan-300 italic">카드를 클릭하여 뜻을 확인하세요</p>
                    </div>

                    {/* Card Back */}
                    <div className="card-face card-back p-6 sm:p-8 text-left overflow-y-auto custom-scrollbar">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-3 text-center">{currentWord.term}</h3>
                        
                        <div className="animate-fadeIn">
                            <p className="text-xl text-cyan-600 dark:text-cyan-300 font-semibold mb-1">{currentWord.partOfSpeech}: {currentWord.meaning}</p>
                            <hr className="border-slate-300 dark:border-slate-500 my-3"/>
                            <p className="text-slate-700 dark:text-slate-200 mb-1"><span className="font-semibold">예문:</span> {currentWord.exampleSentence}</p>
                            {currentWord.exampleSentenceMeaning && <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold">해석:</span> {currentWord.exampleSentenceMeaning}</p>}
                        
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleGenerateAiExample(); }}
                                    disabled={isFetchingAiExample || !process.env.API_KEY || isCurrentlyGeminiQuotaExhausted}
                                    className="w-full py-2 px-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                                >
                                    <span role="img" aria-label="ai" className="mr-2">✨</span>
                                    {isFetchingAiExample ? 'AI 예문 생성 중...' : 'AI: 다른 예문'}
                                    {(!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!process.env.API_KEY ? "Key 필요" : "Quota 소진"})</span>}
                                </button>
                                 <button
                                    onClick={(e) => { e.stopPropagation(); handleGenerateAiImage(); }}
                                    disabled={isFetchingAiImage || !process.env.API_KEY || isCurrentlyGeminiQuotaExhausted}
                                    className="w-full py-2 px-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                                >
                                    <span role="img" aria-label="ai image" className="mr-2">🎨</span>
                                    {isFetchingAiImage ? 'AI 이미지 생성 중...' : 'AI: 이미지 생성'}
                                    {(!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!process.env.API_KEY ? "Key 필요" : "Quota 소진"})</span>}
                                </button>
                            </div>
                            {aiExample && (
                                <div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-500 animate-fadeIn">
                                    <p className="text-teal-600 dark:text-teal-300 font-semibold mb-1">✨ AI 추가 예문:</p>
                                    <button onClick={(e) => { e.stopPropagation(); speak(aiExample.newExampleSentence, undefined, userSettings.speechRate); }} className="text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 text-lg mr-1" aria-label="AI 예문 발음 듣기">🔊</button>
                                    <span className="text-slate-700 dark:text-slate-200">{aiExample.newExampleSentence}</span>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5"><span className="font-semibold">해석:</span> {aiExample.newExampleSentenceMeaning}</p>
                                </div>
                            )}
                            {isFetchingAiImage && <p className="text-purple-600 dark:text-purple-400 text-center mt-3">AI 이미지 로딩 중...</p>}
                            {aiGeneratedImage && (
                                <div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-500 animate-fadeIn">
                                    <p className="text-purple-600 dark:text-purple-300 font-semibold mb-1">🎨 AI 생성 이미지:</p>
                                    <img src={aiGeneratedImage} alt={`AI generated image for ${currentWord.term}`} className="w-full max-w-xs mx-auto rounded-md shadow-lg" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            <button
                onClick={handleNextWord}
                className="mt-6 w-full max-w-lg py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-md shadow-lg transition-transform transform hover:scale-105"
            >
                {currentIndex === currentWordsSet.length - 1 ? (isQuickReviewActive ? '복습 완료' : '학습 완료') : '다음 단어'}
            </button>
            <button 
                onClick={handleExitLearning} 
                className="mt-8 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300"
            >
                {isQuickReviewActive ? "복습" : "학습"} 중단하고 대시보드로
            </button>
        </div>
    );
};

// Quiz Screen Component
interface QuizScreenProps extends ScreenProps {
    words: Word[];
    wordStats: Record<string | number, WordStat>;
    onQuizComplete: (score: number, totalQuestions: number, incorrectWords: Word[]) => void; 
    updateWordStat: (wordId: string | number, newStat: Partial<Omit<WordStat, 'id'>>) => void;
}

const QuizScreen: React.FC<QuizScreenProps> = ({ userSettings, onNavigate, words, wordStats, onQuizComplete, updateWordStat, addToast, setGlobalLoading }) => {
    const [quizWords, setQuizWords] = useState<Word[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [score, setScore] = useState(0);
    const [showResult, setShowResult] = useState(false);
    const [options, setOptions] = useState<string[]>([]);
    const [isFinished, setIsFinished] = useState(false);
    const [incorrectlyAnsweredWordsDetails, setIncorrectlyAnsweredWordsDetails] = useState<Word[]>([]);
    
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewWord, setReviewWord] = useState<Word | null>(null);
    const [aiReviewExample, setAiReviewExample] = useState<AIExampleSentence | null>(null);
    const [isFetchingAiReviewExample, setIsFetchingAiReviewExample] = useState(false);

    const getWordStat = useCallback((wordId: string | number) => {
        return wordStats[wordId] || getDefaultWordStat(wordId);
    }, [wordStats]);

    const generateMultipleChoiceOptions = useCallback((correctWord: Word) => {
        const gradeWords = words.filter(w => w.gradeLevel === userSettings.grade);
        let incorrectMeaningPool = shuffleArray(
            gradeWords
                .filter(w => w.id !== correctWord.id) 
                .map(w => w.meaning)
                .filter(meaning => meaning !== correctWord.meaning) 
        );
        const uniqueIncorrectOptions = Array.from(new Set(incorrectMeaningPool)).slice(0, 3);
        
        while (uniqueIncorrectOptions.length < 3 && gradeWords.length > uniqueIncorrectOptions.length + 1) {
            const fallbackOption = shuffleArray(gradeWords.filter(w => w.id !== correctWord.id && !uniqueIncorrectOptions.includes(w.meaning) && w.meaning !== correctWord.meaning))[0]?.meaning;
            if (fallbackOption && !uniqueIncorrectOptions.includes(fallbackOption)) {
                uniqueIncorrectOptions.push(fallbackOption);
            } else { 
                break;
            }
        }
        
        const placeholders = ["관련 없음", "다른 뜻", "오답 예시"];
        let placeholderIndex = 0;
        while (uniqueIncorrectOptions.length < 3) {
            const placeholder = placeholders[placeholderIndex++];
            if(!uniqueIncorrectOptions.includes(placeholder) && placeholder !== correctWord.meaning) {
                 uniqueIncorrectOptions.push(placeholder);
            }
            if (placeholderIndex >= placeholders.length) break; 
        }

        const finalGeneratedOptions = shuffleArray([correctWord.meaning, ...uniqueIncorrectOptions.slice(0,3)]);
        setOptions(finalGeneratedOptions);
    }, [words, userSettings.grade]);

    const setupQuestion = useCallback((word: Word) => {
        setSelectedAnswer(null);
        setShowResult(false);
        generateMultipleChoiceOptions(word);
        if(userSettings.autoPlayAudio) speak(word.term, undefined, userSettings.speechRate);
    }, [generateMultipleChoiceOptions, userSettings.speechRate, userSettings.autoPlayAudio]);

    const initializeQuiz = useCallback(() => {
        const gradeFilteredWords = words.filter(w => w.gradeLevel === userSettings.grade);
        
        if (gradeFilteredWords.length < 1) {
            setQuizWords([]);
            setIsFinished(true);
            setCurrentQuestionIndex(0); 
            setScore(0);
            if (gradeFilteredWords.length === 0) {
                 addToast(`현재 학년에 퀴즈를 위한 단어가 부족합니다. (최소 1개 필요)`, "warning");
            }
            return;
        }
        
        const actualNumQuizQuestions = Math.min(10, gradeFilteredWords.length);
        const selectedQuizWords = shuffleArray(gradeFilteredWords).slice(0, actualNumQuizQuestions);
        
        setQuizWords(selectedQuizWords);
        setCurrentQuestionIndex(0);
        setScore(0);
        setIsFinished(false);
        setIncorrectlyAnsweredWordsDetails([]);

        if (selectedQuizWords.length > 0 && selectedQuizWords[0]) { 
            setupQuestion(selectedQuizWords[0]);
        } else { 
            setIsFinished(true);
            addToast(`퀴즈를 시작할 단어가 없습니다.`, "info");
        }
    }, [words, userSettings.grade, setupQuestion, addToast]); 


    useEffect(() => {
        initializeQuiz();
    }, [initializeQuiz]); 


     const handleOpenReviewModal = async (word: Word) => {
        setReviewWord(word);
        setShowReviewModal(true);
        setAiReviewExample(null);
        if (process.env.API_KEY) {
            setIsFetchingAiReviewExample(true);
            const example = await generateDifferentExampleSentenceWithGemini(word, userSettings.grade, addToast, setGlobalLoading);
            setAiReviewExample(example);
            setIsFetchingAiReviewExample(false);
        }
    };

    if (quizWords.length === 0 && !isFinished) { 
        return <div className="p-8 text-center text-xl text-slate-600 dark:text-slate-300">퀴즈를 위한 단어를 준비 중이거나, 현재 학년에 단어가 부족합니다. (최소 1개 필요)</div>;
    }
    
    if (isFinished) { 
        return (
            <div className="p-8 text-center">
                <h2 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">퀴즈 완료! 🏆</h2>
                {quizWords.length > 0 ? (
                    <p className="text-xl text-slate-700 dark:text-slate-200 mb-6">총 {quizWords.length}문제 중 <span className="text-green-500 font-bold">{score}</span>문제를 맞혔습니다.</p>
                ) : (
                    <p className="text-xl text-slate-700 dark:text-slate-200 mb-6">퀴즈를 진행할 단어가 없습니다. '단어 관리'에서 단어를 추가하거나 다른 학년을 선택해보세요. (최소 1개 필요)</p>
                )}
                {incorrectlyAnsweredWordsDetails.length > 0 && (
                    <div className="mb-6 bg-slate-100 dark:bg-slate-700 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-red-500 dark:text-red-400 mb-2">틀린 단어들:</h3>
                        <ul className="space-y-2 text-left max-h-48 overflow-y-auto custom-scrollbar">
                            {incorrectlyAnsweredWordsDetails.map(word => (
                                <li key={word.id} className="flex justify-between items-center p-1.5 bg-slate-200 dark:bg-slate-600 rounded-md">
                                    <span className="text-slate-700 dark:text-slate-300">{word.term} - {word.meaning}</span>
                                    <button 
                                        onClick={() => handleOpenReviewModal(word)}
                                        className="text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 text-sm flex items-center px-2 py-1 rounded hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-50"
                                        aria-label={`${word.term} AI 복습`}
                                        disabled={!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted || isFetchingAiReviewExample}
                                    >
                                        ✨ AI 복습 {(!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!process.env.API_KEY ? "Key 필요" : "Quota 소진"})</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <div className="space-x-4">
                    <button
                        onClick={initializeQuiz} 
                        className="py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md disabled:opacity-60"
                        disabled={words.filter(w => w.gradeLevel === userSettings.grade).length < 1}
                    >
                        다시 풀기
                    </button>
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className="py-3 px-6 bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg shadow-md"
                    >
                        대시보드로
                    </button>
                </div>
                 {showReviewModal && reviewWord && (
                    <div role="dialog" aria-modal="true" aria-labelledby="ai-review-modal-title" className="fixed inset-0 bg-slate-900/75 dark:bg-slate-900/80 flex justify-center items-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-left">
                            <h3 id="ai-review-modal-title" className="text-xl font-semibold text-cyan-600 dark:text-cyan-400 mb-3">✨ AI 단어 복습: {reviewWord.term}</h3>
                            <p className="text-slate-700 dark:text-slate-300"><span className="font-semibold">뜻:</span> {reviewWord.meaning} ({reviewWord.partOfSpeech})</p>
                            {reviewWord.pronunciation && <p className="text-slate-500 dark:text-slate-400 text-sm">[{reviewWord.pronunciation}]</p>}
                            <hr className="my-3 border-slate-200 dark:border-slate-700"/>
                            <p className="text-slate-700 dark:text-slate-300 mb-1"><span className="font-semibold">기존 예문:</span> {reviewWord.exampleSentence}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{reviewWord.exampleSentenceMeaning}</p>
                            
                            {isFetchingAiReviewExample && <p className="text-teal-500 dark:text-teal-400">AI 추가 예문 생성 중...</p>}
                            {aiReviewExample && (
                                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 animate-fadeIn">
                                    <p className="text-teal-600 dark:text-teal-300 font-semibold mb-1">✨ AI 추가 예문:</p>
                                     <button onClick={() => speak(aiReviewExample.newExampleSentence, undefined, userSettings.speechRate)} className="text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 text-lg mr-1" aria-label="AI 예문 발음 듣기">🔊</button>
                                    <span className="text-slate-700 dark:text-slate-200">{aiReviewExample.newExampleSentence}</span>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{aiReviewExample.newExampleSentenceMeaning}</p>
                                </div>
                            )}
                            {!isFetchingAiReviewExample && !aiReviewExample && process.env.API_KEY && !isCurrentlyGeminiQuotaExhausted &&
                                <p className="text-red-500 text-sm">AI 추가 예문 생성에 실패했습니다.</p>
                            }
                             {!process.env.API_KEY && <p className="text-yellow-500 text-sm">AI 예문 생성은 API 키가 필요합니다.</p>}
                             {isCurrentlyGeminiQuotaExhausted && <p className="text-yellow-500 text-sm">Gemini API 할당량이 소진되어 AI 예문 생성을 할 수 없습니다.</p>}
                            <button onClick={() => setShowReviewModal(false)} className="mt-4 w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded">닫기</button>
                        </div>
                    </div>
                )}
            </div>
        );
    }
    
    const currentWord = quizWords[currentQuestionIndex];
    if (!currentWord) { 
        return <div className="p-8 text-center text-slate-600 dark:text-slate-300">퀴즈 단어 로딩 중... 또는 더 이상 문제가 없습니다. 대시보드로 돌아가세요.</div>;
    }

    const handleOptionClick = (option: string) => {
        if (showResult) return; 

        setSelectedAnswer(option);
        setShowResult(true); 

        const isCorrect = option === currentWord.meaning;

        if (isCorrect) {
            setScore(prevScore => prevScore + 1);
        } else {
            setIncorrectlyAnsweredWordsDetails(prev => [...prev, currentWord]);
            const currentStat = getWordStat(currentWord.id);
            updateWordStat(currentWord.id, { quizIncorrectCount: currentStat.quizIncorrectCount + 1 });
        }
    };
    

    const handleNextQuestion = () => {
        if (currentQuestionIndex < quizWords.length - 1) {
            const nextIdx = currentQuestionIndex + 1;
            setCurrentQuestionIndex(nextIdx);
            if(quizWords[nextIdx]) { 
                setupQuestion(quizWords[nextIdx]);
            } else { 
                onQuizComplete(score, quizWords.length, incorrectlyAnsweredWordsDetails);
                setIsFinished(true);
            }
        } else {
            onQuizComplete(score, quizWords.length, incorrectlyAnsweredWordsDetails);
            setIsFinished(true);
        }
    };
    
    return (
        <div className="p-4 sm:p-8 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">퀴즈 ({quizWords.length > 0 ? currentQuestionIndex + 1 : 0} / {quizWords.length})</h1>
            <div className="w-full max-w-xl bg-slate-100 dark:bg-slate-700 rounded-xl shadow-2xl p-6 sm:p-8">
                <>
                    <div className="text-center mb-6">
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">다음 단어의 뜻은 무엇일까요?</p>
                        <div className="flex items-center justify-center">
                            <h2 className="text-4xl sm:text-5xl font-bold text-slate-800 dark:text-white mr-2">{currentWord.term}</h2>
                            <button onClick={() => speak(currentWord.term, undefined, userSettings.speechRate)} className="text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 text-2xl" aria-label="단어 발음 듣기">
                                🔊
                            </button>
                        </div>
                        {currentWord.pronunciation && <p className="text-slate-500 dark:text-slate-400 text-lg">[{currentWord.pronunciation}]</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
                        {options.map((option, index) => (
                            <button
                                key={option + '-' + index} 
                                onClick={() => handleOptionClick(option)}
                                disabled={showResult}
                                className={`w-full p-3 sm:p-4 text-left rounded-lg shadow-md transition-all duration-150 ease-in-out
                                    ${showResult
                                        ? option === currentWord.meaning
                                            ? 'bg-green-500 text-white ring-2 ring-green-300 scale-105'
                                            : option === selectedAnswer
                                                ? 'bg-red-500 text-white ring-2 ring-red-300' 
                                                : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 opacity-70'
                                        : 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white hover:bg-cyan-600 dark:hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:focus:ring-cyan-500 hover:text-white dark:hover:text-white'
                                    }`}
                                aria-pressed={selectedAnswer === option}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </>
                
                {showResult && (
                    <div className={`text-center p-3 mb-4 rounded-md text-white ${ selectedAnswer === currentWord.meaning ? 'bg-green-600' : 'bg-red-600'} animate-fadeIn`}>
                        {selectedAnswer === currentWord.meaning 
                            ? '정답입니다! 🎉' 
                            : `오답입니다. 정답은 '${currentWord.meaning}' 입니다.`}
                    </div>
                )}

                <button
                    onClick={handleNextQuestion}
                    disabled={!showResult}
                    className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-md shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {currentQuestionIndex === quizWords.length - 1 ? '결과 보기' : '다음 문제'}
                </button>
            </div>
             <button 
                onClick={() => onNavigate('dashboard')} 
                className="mt-8 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300"
            >
                퀴즈 중단하고 대시보드로
            </button>
        </div>
    );
};


// Shared EditWordModal Component (Memoized)
const EditWordModal = React.memo(({ 
    word, 
    onSave, 
    onCancel, 
    userGrade, 
    isCustomWordOnly, 
    addToast, 
    setGlobalLoading 
}: { 
    word: Word, 
    onSave: (updatedWord: Word) => Promise<void>, 
    onCancel: () => void, 
    userGrade: string, 
    isCustomWordOnly?: boolean, 
    addToast: (message: string, type: ToastMessage['type']) => void, 
    setGlobalLoading: (loading: boolean) => void 
}) => {
    const [editableWord, setEditableWord] = useState<Word>(JSON.parse(JSON.stringify(word))); 
    const [isFetchingModalAIDetails, setIsFetchingModalAIDetails] = useState(false);
    const [isFetchingModalAIImage, setIsFetchingModalAIImage] = useState(false);
    const [modalAiImage, setModalAiImage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setEditableWord(JSON.parse(JSON.stringify(word)));
        setModalAiImage(null); 
    }, [word]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEditableWord(prev => ({ ...prev, [name]: value }));
    };
    
    const handleAIFillDetails = async () => {
        if (!editableWord.term?.trim()) {
             addToast("AI로 정보를 가져올 단어를 입력해주세요.", "warning");
            return;
        }
        setIsFetchingModalAIDetails(true);
        const details = await generateWordDetailsWithGemini(editableWord.term.trim(), addToast, setGlobalLoading);
        if (details) {
            setEditableWord(prev => ({
                ...prev,
                term: details.term || prev.term,
                pronunciation: details.pronunciation || prev.pronunciation,
                meaning: details.meaning || prev.meaning,
                partOfSpeech: details.partOfSpeech || prev.partOfSpeech,
                exampleSentence: details.exampleSentence || prev.exampleSentence,
                exampleSentenceMeaning: details.exampleSentenceMeaning || prev.exampleSentenceMeaning,
            }));
        }
        setIsFetchingModalAIDetails(false);
    };

    const handleGenerateModalAiImage = async () => {
         if (!editableWord.term?.trim()) {
            addToast("AI 이미지를 생성할 단어를 입력해주세요.", "warning");
            return;
        }
        setIsFetchingModalAIImage(true);
        setModalAiImage(null);
        const imageData = await generateImageForWordWithGemini(editableWord.term.trim(), addToast, setGlobalLoading);
        if(imageData) {
            setModalAiImage(`data:image/jpeg;base64,${imageData}`);
        }
        setIsFetchingModalAIImage(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        await onSave(editableWord);
        setIsSubmitting(false); 
    };
    
    const canEditFields = word.isCustom || !isCustomWordOnly;
    const missingApiKey = !process.env.API_KEY;
    const aiOperationsDisabledByKeyOrQuota = missingApiKey || isCurrentlyGeminiQuotaExhausted;
    const isAnyAIFetchingInProgress = isFetchingModalAIDetails || isFetchingModalAIImage;
    const isModalBusyWithActivity = isAnyAIFetchingInProgress || isSubmitting;

    const getAIOperationDisabledReasonText = (isForFillDetailsButton: boolean): string | null => {
        if (isForFillDetailsButton && !canEditFields) return "사용자 단어만 가능";
        if (missingApiKey) return "API Key 필요";
        if (isCurrentlyGeminiQuotaExhausted) return "Quota 소진";
        return null;
    };
    
    const fillDetailsActionDisabledReason = getAIOperationDisabledReasonText(true);
    const imageGenerationActionDisabledReason = getAIOperationDisabledReasonText(false);

    return (
        <div role="dialog" aria-modal="true" aria-labelledby={`edit-word-modal-title-${word.id}`} className="fixed inset-0 bg-slate-900/75 dark:bg-slate-900/80 flex justify-center items-center p-4 z-50 overflow-y-auto animate-fadeIn">
            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg space-y-3 my-4 custom-scrollbar max-h-[90vh]">
                <h3 id={`edit-word-modal-title-${word.id}`} className="text-xl font-semibold text-cyan-600 dark:text-cyan-400">단어 {canEditFields ? '수정' : '세부정보'}: {word.term}</h3>
                <div>
                    <label htmlFor={`term-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">단어 (필수)</label>
                    <input type="text" name="term" id={`term-modal-${word.id}`} value={editableWord.term} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" required disabled={!canEditFields}/>
                </div>
                 <button
                    type="button"
                    onClick={handleAIFillDetails}
                    disabled={isModalBusyWithActivity || aiOperationsDisabledByKeyOrQuota || !canEditFields}
                    className="w-full my-1 py-2 px-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                >
                    <span role="img" aria-label="ai" className="mr-2">✨</span>
                    {isFetchingModalAIDetails ? 'AI 정보 가져오는 중...' : 'AI로 나머지 정보 채우기'}
                    {fillDetailsActionDisabledReason && <span className="text-xs ml-1">({fillDetailsActionDisabledReason})</span>}
                </button>
                <div>
                    <label htmlFor={`meaning-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">뜻 (필수)</label>
                    <input type="text" name="meaning" id={`meaning-modal-${word.id}`} value={editableWord.meaning} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`partOfSpeech-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">품사 (필수)</label>
                    <input type="text" name="partOfSpeech" id={`partOfSpeech-modal-${word.id}`} value={editableWord.partOfSpeech} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`pronunciation-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">발음기호 (선택)</label>
                    <input type="text" name="pronunciation" id={`pronunciation-modal-${word.id}`} value={editableWord.pronunciation || ''} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`exampleSentence-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">예문 (필수)</label>
                    <textarea name="exampleSentence" id={`exampleSentence-modal-${word.id}`} value={editableWord.exampleSentence} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" rows={2} required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`exampleSentenceMeaning-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">예문 뜻 (선택)</label>
                    <textarea name="exampleSentenceMeaning" id={`exampleSentenceMeaning-modal-${word.id}`} value={editableWord.exampleSentenceMeaning || ''} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" rows={2} disabled={!canEditFields}/>
                </div>
                 <div>
                    <label htmlFor={`gradeLevel-modal-${word.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">학년 (필수)</label>
                    <select name="gradeLevel" id={`gradeLevel-modal-${word.id}`} value={editableWord.gradeLevel} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded border border-slate-300 dark:border-slate-600" disabled={!canEditFields}>
                        <option value="middle1">중1</option>
                        <option value="middle2">중2</option>
                        <option value="middle3">중3</option>
                    </select>
                </div>

                <button
                    type="button"
                    onClick={handleGenerateModalAiImage}
                    disabled={isModalBusyWithActivity || aiOperationsDisabledByKeyOrQuota}
                    className="w-full my-1 py-2 px-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                >
                    <span role="img" aria-label="ai image" className="mr-2">🎨</span>
                    {isFetchingModalAIImage ? 'AI 이미지 생성 중...' : 'AI 이미지 생성 보기'}
                    {imageGenerationActionDisabledReason && <span className="text-xs ml-1">({imageGenerationActionDisabledReason})</span>}
                </button>
                {isFetchingModalAIImage && <p className="text-purple-600 dark:text-purple-400 text-center text-sm">AI 이미지 로딩 중...</p>}
                {modalAiImage && (
                    <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-700 rounded-md animate-fadeIn">
                        <img src={modalAiImage} alt={`AI generated for ${editableWord.term}`} className="w-full max-w-xs mx-auto rounded shadow"/>
                    </div>
                )}

                <div className="flex justify-end space-x-3 pt-2">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded text-slate-700 dark:text-white">취소</button>
                    {canEditFields && <button type="submit" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded text-white" disabled={isModalBusyWithActivity}>
                      {isSubmitting ? '저장 중...' : '저장'}
                    </button>}
                </div>
            </form>
        </div>
    );
});

// AllWordsScreen WordRow component (Memoized)
interface WordRowProps {
  wordData: Word & { stat: WordStat };
  userSettings: UserSettings;
  speak: (text: string, lang: string | undefined, rate: number | undefined) => void;
  toggleMastered: (word: Word) => void;
  handleEditWord: (word: Word) => void;
  handleDeleteClick: (word: Word) => void;
}
const WordRow: React.FC<WordRowProps> = React.memo(({ wordData, userSettings, speak, toggleMastered, handleEditWord, handleDeleteClick }) => {
    const word = wordData; 
    return (
        <li className={`p-4 rounded-lg shadow transition-colors ${word.stat.isMastered ? 'bg-slate-200/70 dark:bg-slate-700/70 hover:bg-slate-300/70 dark:hover:bg-slate-600/70' : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className={`text-xl font-semibold ${word.stat.isMastered ? 'text-green-600 dark:text-green-400' : 'text-cyan-700 dark:text-cyan-300'}`}>
                        {word.term} 
                        {word.stat.isMastered && <span className="text-xs bg-green-500 text-white dark:text-slate-900 px-1.5 py-0.5 rounded-full ml-2">완료</span>}
                        {word.isCustom && !word.stat.isMastered && <span className="text-xs bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded-full ml-2">나의 단어</span>}
                        {word.isCustom && word.stat.isMastered && <span className="text-xs bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded-full ml-2">나의 단어</span>}
                        {word.unit && <span className="text-xs bg-blue-500 text-white dark:text-slate-900 px-1.5 py-0.5 rounded-full ml-2">Unit {word.unit}</span>}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{word.partOfSpeech} - {word.meaning}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">학년: {word.gradeLevel} | 복습: {word.stat.lastReviewed ? new Date(word.stat.lastReviewed).toLocaleDateString() : '안함'} | 오답: {word.stat.quizIncorrectCount}</p>
                </div>
                <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-1 flex-shrink-0 ml-2 items-end">
                    <button onClick={() => speak(word.term, undefined, userSettings.speechRate)} className="text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 text-xl p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500" aria-label={`${word.term} 발음 듣기`}>
                        🔊
                    </button>
                    <button 
                        onClick={() => toggleMastered(word)}
                        className={`p-1.5 rounded-md text-sm whitespace-nowrap ${word.stat.isMastered ? 'bg-slate-400 hover:bg-slate-500 text-slate-800 dark:text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                        aria-label={word.stat.isMastered ? `${word.term} 학습 필요로 표시` : `${word.term} 마스터함으로 표시`}
                    >
                        {word.stat.isMastered ? '🔄 학습 필요' : '✅ 완료'}
                    </button>
                    {word.isCustom ? (
                        <>
                            <button 
                                onClick={() => handleEditWord(word)} 
                                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500 text-sm whitespace-nowrap"
                                aria-label={`${word.term} 수정`}
                            >✏️ 수정</button>
                            <button 
                                onClick={() => handleDeleteClick(word)} 
                                className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500 text-sm whitespace-nowrap"
                                aria-label={`${word.term} 삭제`}
                            >🗑️ 삭제</button>
                        </>
                    ) : (
                        <button 
                            onClick={() => handleEditWord(word)} 
                            className="text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500 text-sm whitespace-nowrap"
                            aria-label={`${word.term} 세부 정보 보기`}
                        >ℹ️ 정보</button>
                    )}
                </div>
            </div>
            {word.exampleSentence && (
                <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">예문 보기</summary>
                    <div className="mt-1 p-2 bg-slate-200 dark:bg-slate-600 rounded">
                        <p className="text-slate-700 dark:text-slate-200">{word.exampleSentence}</p>
                        {word.exampleSentenceMeaning && <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{word.exampleSentenceMeaning}</p>}
                    </div>
                </details>
            )}
        </li>
    );
});


// AllWords Screen Component
interface AllWordsScreenProps extends ScreenProps {
    allWords: Word[]; 
    wordStats: Record<string | number, WordStat>;
    onDeleteCustomWord: (wordId: number | string) => void;
    onSaveCustomWord: (wordData: Partial<Word>, gradeLevelForNew?: string, unitNumber?: number) => Promise<boolean>;
    updateWordStat: (wordId: string | number, newStat: Partial<Omit<WordStat, 'id'>>) => void;
}

const AllWordsScreen: React.FC<AllWordsScreenProps> = ({ userSettings, onNavigate, allWords, wordStats, onDeleteCustomWord, onSaveCustomWord, updateWordStat, addToast, setGlobalLoading }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGrade, setFilterGrade] = useState<string>(userSettings.grade || 'all');
    const [filterUnit, setFilterUnit] = useState<string>('all');
    const [editingWord, setEditingWord] = useState<Word | null>(null);
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    const [wordToDelete, setWordToDelete] = useState<Word | null>(null);
    
    const getWordStat = useCallback((wordId: string | number) => {
        return wordStats[wordId] || getDefaultWordStat(wordId);
    }, [wordStats]);

    const uniqueUnits = useMemo(() => {
        const units = new Set<string>();
        allWords.forEach(word => {
            if (word.unit) units.add(String(word.unit));
        });
        return Array.from(units).sort((a,b) => parseInt(a) - parseInt(b));
    }, [allWords]);

    const wordsToDisplay = useMemo(() => {
        return allWords
        .filter(word => filterGrade === 'all' || word.gradeLevel === filterGrade)
        .filter(word => filterUnit === 'all' || String(word.unit) === filterUnit)
        .filter(word => word.term.toLowerCase().includes(searchTerm.toLowerCase()) || word.meaning.toLowerCase().includes(searchTerm.toLowerCase()))
        .map(word => ({ ...word, stat: getWordStat(word.id) })) 
        .sort((a,b) => a.term.localeCompare(b.term));
    }, [allWords, filterGrade, filterUnit, searchTerm, getWordStat]);


    const handleEditWord = useCallback((word: Word) => {
        setEditingWord(JSON.parse(JSON.stringify(word))); 
    }, []);
    
    const handleSaveEdit = useCallback(async (updatedWord: Word) => {
        if (updatedWord.isCustom) { 
            const success = await onSaveCustomWord(updatedWord, updatedWord.gradeLevel, updatedWord.unit ? Number(updatedWord.unit) : undefined);
            if (success) {
                setEditingWord(null);
            }
        } else {
            addToast("기본 제공 단어는 이 화면에서 직접 수정할 수 없습니다. '나의 단어'만 수정 가능합니다.", "info");
            setEditingWord(null); 
        }
    }, [onSaveCustomWord, addToast]);

    const handleDeleteClick = useCallback((word: Word) => {
        setWordToDelete(word);
        setShowConfirmDeleteModal(true);
    }, []);

    const confirmDelete = useCallback(() => {
        if(wordToDelete) {
            onDeleteCustomWord(wordToDelete.id);
        }
        setShowConfirmDeleteModal(false);
        setWordToDelete(null);
    }, [wordToDelete, onDeleteCustomWord]);

    const toggleMastered = useCallback((word: Word) => {
        const currentStat = getWordStat(word.id);
        updateWordStat(word.id, { isMastered: !currentStat.isMastered });
        addToast(
            `'${word.term}' 단어를 ${!currentStat.isMastered ? '완료' : '학습 필요'} 상태로 변경했습니다.`,
            !currentStat.isMastered ? "success" : "info"
        );
    }, [getWordStat, updateWordStat, addToast]);
    

    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">전체 단어 목록 ({wordsToDisplay.length}개)</h1>
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <input
                    type="text"
                    placeholder="단어 또는 뜻 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="sm:col-span-1 p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500"
                    aria-label="단어 검색"
                />
                <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                    className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500"
                    aria-label="학년 필터"
                >
                    <option value="all">모든 학년</option>
                    <option value="middle1">중학교 1학년</option>
                    <option value="middle2">중학교 2학년</option>
                    <option value="middle3">중학교 3학년</option>
                </select>
                <select
                    value={filterUnit}
                    onChange={(e) => setFilterUnit(e.target.value)}
                    className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-cyan-500"
                    aria-label="단원 필터"
                >
                    <option value="all">모든 단원</option>
                    {uniqueUnits.map(unit => <option key={unit} value={unit}>Unit {unit}</option>)}
                </select>
            </div>

            {wordsToDisplay.length > 0 ? (
                <ul className="space-y-3">
                    {wordsToDisplay.map((word) => (
                       <WordRow
                            key={word.id}
                            wordData={word}
                            userSettings={userSettings}
                            speak={speak}
                            toggleMastered={toggleMastered}
                            handleEditWord={handleEditWord}
                            handleDeleteClick={handleDeleteClick}
                        />
                    ))}
                </ul>
            ) : (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8">해당 조건에 맞는 단어가 없습니다.</p>
            )}
            {editingWord && <EditWordModal word={editingWord} onSave={handleSaveEdit} onCancel={() => setEditingWord(null)} userGrade={userSettings.grade} isCustomWordOnly={!editingWord.isCustom} addToast={addToast} setGlobalLoading={setGlobalLoading}/>}
            {wordToDelete && (
                <ConfirmationModal
                    isOpen={showConfirmDeleteModal}
                    title="단어 삭제 확인"
                    message={`'${wordToDelete.term}' 단어를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
                    onConfirm={confirmDelete}
                    onCancel={() => { setShowConfirmDeleteModal(false); setWordToDelete(null); }}
                />
            )}
        </div>
    );
};

// WordsByUnit Screen Component
interface WordsByUnitScreenProps extends ScreenProps {
    allWords: Word[];
    onSaveCustomWord: (wordData: Partial<Word>, gradeLevelForNew?: string, unitNumber?: number) => Promise<boolean>;
}

interface ExtractedWordItem {
  text: string;
  selected: boolean;
}

interface UnitProcessingStatus {
  isExtracting: boolean;
  isSaving: boolean;
  log: string[];
  extractedWords: ExtractedWordItem[];
  selectAllExtracted: boolean;
  fileName: string | null;
}

const initialUnitProcessingStatus = (): UnitProcessingStatus => ({
  isExtracting: false,
  isSaving: false,
  log: [],
  extractedWords: [],
  selectAllExtracted: true,
  fileName: null,
});

const WordsByUnitScreen: React.FC<WordsByUnitScreenProps> = ({ userSettings, onNavigate, addToast, setGlobalLoading, allWords, onSaveCustomWord }) => {
    const [unitDetails, setUnitDetails] = useState<Record<number, UnitProcessingStatus>>(
        () => Array.from({ length: 30 }, (_, i) => i + 1).reduce((acc, unitNum) => {
            acc[unitNum] = initialUnitProcessingStatus();
            return acc;
        }, {} as Record<number, UnitProcessingStatus>)
    );
     const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});


    const updateUnitState = (unitNumber: number, updates: Partial<UnitProcessingStatus>) => {
        setUnitDetails(prev => ({
            ...prev,
            [unitNumber]: { ...prev[unitNumber], ...updates }
        }));
    };
    
    const addUnitLog = (unitNumber: number, message: string) => {
        setUnitDetails(prev => ({
            ...prev,
            [unitNumber]: { 
                ...prev[unitNumber], 
                log: [...prev[unitNumber].log.slice(-4), `[${new Date().toLocaleTimeString()}] ${message}`] 
            }
        }));
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, unitNumber: number) => {
        const file = event.target.files?.[0];
        if (file) {
            updateUnitState(unitNumber, { 
                fileName: file.name, 
                extractedWords: [], 
                log: [], // Reset log for new file
                isExtracting: false, 
                isSaving: false 
            });
            addUnitLog(unitNumber, `'${file.name}' 선택됨.`);
            addToast(`${unitNumber}단원에 '${file.name}' 파일이 선택되었습니다. '단어 추출'을 진행하세요.`, "info");
        } else {
            updateUnitState(unitNumber, { fileName: null, extractedWords: [], log: [], isExtracting: false, isSaving: false });
            addUnitLog(unitNumber, "파일 선택 취소됨.");
        }
    };
    
    const handleExtractWords = async (unitNumber: number) => {
        const currentUnit = unitDetails[unitNumber];
        const fileInput = fileInputRefs.current[unitNumber];
        const file = fileInput?.files?.[0];

        if (!file) {
            addToast(`먼저 ${unitNumber}단원 파일을 선택해주세요.`, "warning");
            return;
        }

        updateUnitState(unitNumber, { isExtracting: true, extractedWords: [], log:[] });
        addUnitLog(unitNumber, `'${currentUnit.fileName || file.name}'에서 단어 추출 시작...`);
        setGlobalLoading(true);

        try {
            let textContentFromFile = "";
            if (file.type === "application/pdf") {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    textContentFromFile += textContent.items.map(item => ('str' in item ? item.str : '')).join(" ") + "\n";
                }
            } else if (file.type === "text/plain" || file.name.endsWith('.txt')) {
                textContentFromFile = await file.text();
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
                 const data = await file.arrayBuffer();
                 const workbook = XLSX.read(data);
                 const sheetName = workbook.SheetNames[0];
                 const worksheet = workbook.Sheets[sheetName];
                 const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
                 jsonData.forEach(row => {
                     if (Array.isArray(row)) textContentFromFile += row.join(" ") + "\n";
                 });
            } else {
                addToast("지원하지 않는 파일 형식입니다. PDF, TXT, XLSX, CSV 파일만 지원됩니다.", "error");
                addUnitLog(unitNumber, "오류: 지원하지 않는 파일 형식");
                updateUnitState(unitNumber, { isExtracting: false });
                setGlobalLoading(false);
                return;
            }
            
            const existingTerms = new Set(allWords.map(w => w.term.toLowerCase()));
            const wordRegex = /\b[a-zA-Z]{3,20}\b/g; // Words with 3-20 letters
            const extractedRawWords = textContentFromFile.toLowerCase().match(wordRegex) || [];
            const uniqueNewWords = Array.from(new Set(extractedRawWords.filter(word => !existingTerms.has(word)))).sort();

            if (uniqueNewWords.length > 0) {
                const newExtractedItems: ExtractedWordItem[] = uniqueNewWords.map(text => ({ text, selected: true }));
                updateUnitState(unitNumber, { extractedWords: newExtractedItems, selectAllExtracted: true });
                addUnitLog(unitNumber, `완료: ${uniqueNewWords.length}개의 새로운 단어 추출됨.`);
                addToast(`${unitNumber}단원에서 ${uniqueNewWords.length}개의 새로운 단어를 추출했습니다. 확인 후 저장하세요.`, "success");
            } else {
                addUnitLog(unitNumber, "완료: 새로운 단어 없음 (이미 존재하거나 파일 내용 부족).");
                addToast(`${unitNumber}단원에서 새로운 단어를 찾지 못했습니다. (이미 추가되었거나 파일에 없음)`, "info");
                 updateUnitState(unitNumber, { extractedWords: [] });
            }

        } catch (error) {
            console.error(`Error extracting words for unit ${unitNumber}:`, error);
            const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
            addUnitLog(unitNumber, `추출 오류: ${errorMsg}`);
            addToast(`${unitNumber}단원 단어 추출 중 오류: ${errorMsg}`, "error");
        } finally {
            updateUnitState(unitNumber, { isExtracting: false });
            setGlobalLoading(false);
        }
    };

    const handleSaveWords = async (unitNumber: number) => {
        if (!process.env.API_KEY) {
            addToast("단어 저장을 위해 API 키를 설정해주세요.", "error");
            addUnitLog(unitNumber, "오류: API 키 필요");
            return;
        }
        if (isCurrentlyGeminiQuotaExhausted) {
             addToast("Gemini API 할당량이 소진되어 단어 저장을 할 수 없습니다. 잠시 후 다시 시도해주세요.", "error");
             addUnitLog(unitNumber, "오류: Gemini API 할당량 소진");
             return;
        }

        const currentUnit = unitDetails[unitNumber];
        const wordsToSave = currentUnit.extractedWords.filter(w => w.selected);

        if (wordsToSave.length === 0) {
            addToast(`${unitNumber}단원: 저장할 단어를 선택해주세요.`, "warning");
            addUnitLog(unitNumber, "저장 시도: 선택된 단어 없음.");
            return;
        }

        updateUnitState(unitNumber, { isSaving: true });
        setGlobalLoading(true);
        addUnitLog(unitNumber, `${wordsToSave.length}개 단어 저장 시작...`);

        let newlySavedCount = 0;
        let geminiLookupFailedCount = 0;
        const wordsSuccessfullyProcessedTerms: string[] = [];


        for (const wordItem of wordsToSave) {
            addUnitLog(unitNumber, `'${wordItem.text}' AI 정보 조회 시도...`);
            // Pass setGlobalLoading as false to generateWordDetailsWithGemini to avoid multiple global spinner flashes during loop.
            // The outer setGlobalLoading(true) is already active.
            const details = await generateWordDetailsWithGemini(wordItem.text, addToast, () => {}); 

            if (details && details.meaning && details.partOfSpeech && details.exampleSentence) {
                addUnitLog(unitNumber, `'${wordItem.text}' AI 정보 조회 성공. 저장 시도...`);
                const wasNewlyAdded = await onSaveCustomWord(
                    { ...details, term: wordItem.text, gradeLevel: userSettings.grade, isCustom: true },
                    userSettings.grade,
                    unitNumber
                ); 

                if (wasNewlyAdded) {
                    newlySavedCount++;
                    addUnitLog(unitNumber, `'${wordItem.text}' 새 단어로 저장 성공.`);
                } else {
                    addUnitLog(unitNumber, `'${wordItem.text}'은(는) 이미 시스템에 존재하거나 다른 이유로 새로 추가되지 않았습니다.`);
                }
                wordsSuccessfullyProcessedTerms.push(wordItem.text);
            } else {
                geminiLookupFailedCount++;
                addUnitLog(unitNumber, `'${wordItem.text}' AI 정보 조회 실패. 저장 건너뜀.`);
            }
            await new Promise(resolve => setTimeout(resolve, 300)); 
        }

        const newExtractedWordsList = currentUnit.extractedWords.filter(
            ew => !wordsSuccessfullyProcessedTerms.includes(ew.text)
        );

        let summaryMessage = `${unitNumber}단원 처리: ${wordsSuccessfullyProcessedTerms.length}개 단어 AI 정보 조회 및 처리 완료.`;
        if (newlySavedCount > 0) summaryMessage += ` 그 중 ${newlySavedCount}개가 새 단어로 저장됨.`;
        if (geminiLookupFailedCount > 0) summaryMessage += ` ${geminiLookupFailedCount}개 단어는 AI 정보 조회 실패.`;
        
        if (wordsToSave.length > 0 && wordsSuccessfullyProcessedTerms.length === 0 && geminiLookupFailedCount === wordsToSave.length) {
             summaryMessage = `${unitNumber}단원: 선택된 모든 단어의 AI 정보 조회에 실패했습니다.`;
        } else if (wordsToSave.length > 0 && newlySavedCount === 0 && geminiLookupFailedCount === 0 && wordsSuccessfullyProcessedTerms.length > 0) {
            summaryMessage = `${unitNumber}단원: 선택된 단어 처리 완료. 새로 저장된 단어 없음 (대부분 이미 존재).`;
        }


        addToast(summaryMessage, newlySavedCount > 0 ? "success" : (geminiLookupFailedCount > 0 || (wordsToSave.length > 0 && newlySavedCount === 0) ? "warning" : "info"));
        addUnitLog(unitNumber, `저장 작업 요약: ${summaryMessage}`);

        updateUnitState(unitNumber, {
            isSaving: false,
            extractedWords: newExtractedWordsList,
            selectAllExtracted: newExtractedWordsList.every(w => w.selected) || newExtractedWordsList.length === 0,
        });

        if (newExtractedWordsList.length === 0 && fileInputRefs.current[unitNumber]?.files?.length && currentUnit.fileName) {
            addUnitLog(unitNumber, `모든 추출된 단어 처리 완료. '${currentUnit.fileName}' 파일 선택 해제됨.`);
            if (fileInputRefs.current[unitNumber]) {
                fileInputRefs.current[unitNumber]!.value = ''; 
            }
            updateUnitState(unitNumber, { fileName: null });
        }
        setGlobalLoading(false);
    };


    const handleToggleExtractedWord = (unitNumber: number, wordText: string) => {
        const currentUnit = unitDetails[unitNumber];
        const updatedWords = currentUnit.extractedWords.map(w =>
            w.text === wordText ? { ...w, selected: !w.selected } : w
        );
        updateUnitState(unitNumber, {
            extractedWords: updatedWords,
            selectAllExtracted: updatedWords.every(w => w.selected)
        });
    };

    const handleToggleSelectAllExtracted = (unitNumber: number) => {
        const currentUnit = unitDetails[unitNumber];
        const newSelectAllState = !currentUnit.selectAllExtracted;
        const updatedWords = currentUnit.extractedWords.map(w => ({ ...w, selected: newSelectAllState }));
        updateUnitState(unitNumber, {
            extractedWords: updatedWords,
            selectAllExtracted: newSelectAllState
        });
    };
    

    const renderUnitCard = (unitNumber: number) => {
        const unitData = unitDetails[unitNumber];
        if (!unitData) return null;
        const canExtract = !!unitData.fileName && !unitData.isExtracting && !unitData.isSaving;
        const canSave = unitData.extractedWords.length > 0 && unitData.extractedWords.some(w => w.selected) && !unitData.isSaving && !unitData.isExtracting;

        return (
            <div key={unitNumber} className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold text-cyan-600 dark:text-cyan-400 mb-3">{unitNumber}단원</h3>
                
                <label htmlFor={`file-upload-${unitNumber}`} className={`w-full mb-2 cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-cyan-500 hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 ${unitData.isExtracting || unitData.isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    📄 파일 선택
                </label>
                <input 
                    id={`file-upload-${unitNumber}`} 
                    type="file" 
                    accept=".pdf,.txt,.xlsx,.xls,.csv" 
                    onChange={(e) => handleFileChange(e, unitNumber)} 
                    className="hidden" 
                    ref={el => { if (el) fileInputRefs.current[unitNumber] = el; }}
                    disabled={unitData.isExtracting || unitData.isSaving}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 truncate" title={unitData.fileName || "파일 없음"}>
                    {unitData.fileName ? `선택됨: ${unitData.fileName}` : "파일 없음"}
                </p>

                <div className="grid grid-cols-2 gap-2 mb-3">
                    <button 
                        onClick={() => handleExtractWords(unitNumber)} 
                        disabled={!canExtract}
                        className="w-full px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                         <span role="img" aria-label="extract" className="mr-1.5">🔎</span>
                        {unitData.isExtracting ? '추출 중...' : '단어 추출'}
                    </button>
                    <button 
                        onClick={() => handleSaveWords(unitNumber)} 
                        disabled={!canSave}
                        className="w-full px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                         <span role="img" aria-label="save" className="mr-1.5">💾</span>
                         {unitData.isSaving ? '저장 중...' : '단어 저장'}
                    </button>
                </div>

                {unitData.extractedWords.length > 0 && (
                    <div className="mt-3 border-t border-slate-300 dark:border-slate-600 pt-3">
                        <div className="flex justify-between items-center mb-1">
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">추출된 단어 ({unitData.extractedWords.filter(w=>w.selected).length}/{unitData.extractedWords.length} 선택됨)</h4>
                            <button 
                                onClick={() => handleToggleSelectAllExtracted(unitNumber)}
                                className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                            >
                                {unitData.selectAllExtracted ? '모두 선택 해제' : '모두 선택'}
                            </button>
                        </div>
                        <ul className="max-h-32 overflow-y-auto space-y-1 bg-slate-200 dark:bg-slate-600 p-2 rounded custom-scrollbar text-xs">
                            {unitData.extractedWords.map(word => (
                                <li key={word.text} className="flex items-center">
                                    <input 
                                        type="checkbox" 
                                        id={`word-${unitNumber}-${word.text}`} 
                                        checked={word.selected} 
                                        onChange={() => handleToggleExtractedWord(unitNumber, word.text)}
                                        className="mr-2 h-3 w-3 rounded border-slate-400 dark:border-slate-500 text-cyan-600 focus:ring-cyan-500"
                                    />
                                    <label htmlFor={`word-${unitNumber}-${word.text}`} className="text-slate-700 dark:text-slate-200">{word.text}</label>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                
                {unitData.log.length > 0 && (
                    <div className="mt-3 border-t border-slate-300 dark:border-slate-600 pt-2">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">최근 활동:</p>
                        <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5 max-h-20 overflow-y-auto custom-scrollbar">
                            {unitData.log.map((entry, index) => <li key={index}>{entry}</li>)}
                        </ul>
                    </div>
                )}
            </div>
        );
    };
    
    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">단원별 단어 학습</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(unitDetails).map(unitNumStr => renderUnitCard(Number(unitNumStr)))}
            </div>
        </div>
    );
};


// Stats Screen Component
interface StatsScreenProps extends ScreenProps {
    allWords: Word[];
    wordStats: Record<string | number, WordStat>;
    learnedWordsTodayCount: number;
    learningStreak: { currentStreak: number; bestStreak: number };
    averageQuizScore: number;
}
const StatsScreen: React.FC<StatsScreenProps> = ({ userSettings, onNavigate, allWords, wordStats, learnedWordsTodayCount, learningStreak, averageQuizScore, addToast }) => {
    
    const totalWords = allWords.length;
    const customWordsCount = allWords.filter(w => w.isCustom).length;
    const masteredWordsCount = Object.values(wordStats).filter(stat => stat.isMastered).length;
    
    const wordsByGrade = useMemo(() => {
        const counts: Record<string, number> = { middle1: 0, middle2: 0, middle3: 0 };
        allWords.forEach(word => {
            if (counts[word.gradeLevel] !== undefined) {
                counts[word.gradeLevel]++;
            }
        });
        return counts;
    }, [allWords]);

    const wordsByUnit = useMemo(() => {
        const units: Record<string, number> = {};
        allWords.forEach(word => {
            if(word.unit){
                const unitKey = `Unit ${word.unit}`;
                units[unitKey] = (units[unitKey] || 0) + 1;
            }
        });
        return Object.entries(units).sort((a,b) => parseInt(a[0].replace("Unit ","")) - parseInt(b[0].replace("Unit ","")));
    }, [allWords]);


    const renderStatCard = (title: string, value: string | number, subtext?: string, icon?: string) => (
        <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg text-center">
            {icon && <div className="text-3xl mb-2">{icon}</div>}
            <h3 className="text-lg font-semibold text-cyan-600 dark:text-cyan-400">{title}</h3>
            <p className="text-3xl font-bold text-slate-800 dark:text-white">{value}</p>
            {subtext && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtext}</p>}
        </div>
    );
    
    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400">학습 통계</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {renderStatCard("총 단어 수", totalWords, `(나의 단어: ${customWordsCount}개)`, "📚")}
                {renderStatCard("마스터한 단어", masteredWordsCount, `${totalWords > 0 ? ((masteredWordsCount/totalWords)*100).toFixed(1) : 0}% 완료`, "🏆")}
                {renderStatCard("오늘 학습한 단어", learnedWordsTodayCount, `일일 목표: ${userSettings.dailyGoal}개`, "📈")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderStatCard("연속 학습일", `${learningStreak.currentStreak}일`, `최고 기록: ${learningStreak.bestStreak}일`, "🔥")}
                {renderStatCard("평균 퀴즈 점수", `${averageQuizScore.toFixed(1)}%`, undefined, "🎯")}
            </div>

            <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold text-cyan-600 dark:text-cyan-400 mb-3">학년별 단어 분포</h3>
                 <div className="flex justify-around items-end h-32 bg-slate-200 dark:bg-slate-600 p-2 rounded">
                    {Object.entries(wordsByGrade).map(([grade, count]) => {
                        const maxCount = Math.max(...Object.values(wordsByGrade), 1);
                        const heightPercentage = (count / maxCount) * 100;
                        return (
                            <div key={grade} className="flex flex-col items-center w-1/4">
                                <div 
                                    className="w-10 bg-cyan-500 rounded-t-sm" 
                                    style={{ height: `${heightPercentage}%` }}
                                    title={`${grade}: ${count}개`}
                                ></div>
                                <p className="text-xs mt-1 text-slate-700 dark:text-slate-300">{grade.replace('middle', '중')}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {wordsByUnit.length > 0 && (
                <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg shadow-lg">
                    <h3 className="text-lg font-semibold text-cyan-600 dark:text-cyan-400 mb-3">단원별 단어 수</h3>
                    <ul className="max-h-48 overflow-y-auto custom-scrollbar space-y-1 text-sm">
                        {wordsByUnit.map(([unit, count]) => (
                            <li key={unit} className="flex justify-between p-1.5 bg-slate-200 dark:bg-slate-600 rounded-md">
                                <span className="text-slate-700 dark:text-slate-300">{unit}</span>
                                <span className="font-semibold text-cyan-700 dark:text-cyan-300">{count}개</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
             <button
                onClick={() => addToast("데이터 내보내기 기능은 준비 중입니다.", "info")}
                className="w-full mt-4 py-2 px-4 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-md shadow-md"
            >
                학습 데이터 내보내기 (준비 중)
            </button>
        </div>
    );
};


// ManageWords Screen Component
interface ManageWordsScreenProps extends ScreenProps {
    allWords: Word[]; 
    onSaveCustomWord: (wordData: Partial<Word>, gradeLevelForNew?: string, unitNumber?: number) => Promise<boolean>;
    onDeleteCustomWord: (wordId: number | string) => void;
}
const ManageWordsScreen: React.FC<ManageWordsScreenProps> = ({ userSettings, onNavigate, allWords, onSaveCustomWord, onDeleteCustomWord, addToast, setGlobalLoading }) => {
    const [newWord, setNewWord] = useState<Partial<Word>>({ term: '', meaning: '', partOfSpeech: '', exampleSentence: '', gradeLevel: userSettings.grade, isCustom: true, unit: undefined });
    const [isAddingViaAI, setIsAddingViaAI] = useState(false);
    const [isSubmittingManual, setIsSubmittingManual] = useState(false);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === "unit") {
            setNewWord(prev => ({ ...prev, [name]: value === "" ? undefined : Number(value) }));
        } else {
            setNewWord(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAIFill = async () => {
        if (!newWord.term?.trim()) {
            addToast("AI로 정보를 가져올 단어를 입력해주세요.", "warning");
            return;
        }
        setIsAddingViaAI(true);
        const details = await generateWordDetailsWithGemini(newWord.term.trim(), addToast, setGlobalLoading);
        if (details) {
            setNewWord(prev => ({
                ...prev,
                term: details.term || prev.term, // Use corrected term if AI provides one
                pronunciation: details.pronunciation || '',
                meaning: details.meaning || '',
                partOfSpeech: details.partOfSpeech || '',
                exampleSentence: details.exampleSentence || '',
                exampleSentenceMeaning: details.exampleSentenceMeaning || '',
            }));
        }
        setIsAddingViaAI(false);
    };

    const handleAddWord = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newWord.term || !newWord.meaning || !newWord.partOfSpeech || !newWord.exampleSentence) {
            addToast("필수 필드(단어, 뜻, 품사, 예문)를 모두 입력해주세요.", "error");
            return;
        }
        setIsSubmittingManual(true);
        const unitNumber = newWord.unit ? Number(newWord.unit) : undefined;
        const success = await onSaveCustomWord(newWord, newWord.gradeLevel, unitNumber);
        if (success) {
            setNewWord({ term: '', meaning: '', partOfSpeech: '', exampleSentence: '', gradeLevel: userSettings.grade, isCustom: true, unit: undefined }); 
            addToast(`'${newWord.term}' 단어가 성공적으로 추가되었습니다.`, "success");
        }
        setIsSubmittingManual(false);
    };
    
    const canUseAI = process.env.API_KEY && !isCurrentlyGeminiQuotaExhausted;
    const aiButtonDisabledReason = !process.env.API_KEY ? "(API Key 필요)" : isCurrentlyGeminiQuotaExhausted ? "(Quota 소진)" : "";

    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6">나의 단어 추가/관리</h1>
            
            <form onSubmit={handleAddWord} className="bg-slate-100 dark:bg-slate-700 p-6 rounded-lg shadow-lg space-y-4 mb-8">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white">새 단어 추가</h2>
                <div>
                    <label htmlFor="term" className="block text-sm font-medium text-slate-700 dark:text-slate-300">단어 (필수)</label>
                    <input type="text" name="term" id="term" value={newWord.term || ''} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" required />
                </div>
                <button 
                    type="button" 
                    onClick={handleAIFill} 
                    disabled={!canUseAI || isAddingViaAI || isSubmittingManual || !newWord.term?.trim()}
                    className="w-full py-2 px-4 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center"
                >
                    <span role="img" aria-label="ai" className="mr-2">✨</span> 
                    {isAddingViaAI ? 'AI 정보 가져오는 중...' : `AI로 나머지 정보 채우기 ${aiButtonDisabledReason}`}
                </button>
                <div>
                    <label htmlFor="meaning" className="block text-sm font-medium text-slate-700 dark:text-slate-300">뜻 (필수)</label>
                    <input type="text" name="meaning" id="meaning" value={newWord.meaning || ''} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" required />
                </div>
                 <div>
                    <label htmlFor="partOfSpeech" className="block text-sm font-medium text-slate-700 dark:text-slate-300">품사 (필수)</label>
                    <input type="text" name="partOfSpeech" id="partOfSpeech" value={newWord.partOfSpeech || ''} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" required />
                </div>
                <div>
                    <label htmlFor="pronunciation" className="block text-sm font-medium text-slate-700 dark:text-slate-300">발음기호 (선택)</label>
                    <input type="text" name="pronunciation" id="pronunciation" value={newWord.pronunciation || ''} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" />
                </div>
                <div>
                    <label htmlFor="exampleSentence" className="block text-sm font-medium text-slate-700 dark:text-slate-300">예문 (필수)</label>
                    <textarea name="exampleSentence" id="exampleSentence" value={newWord.exampleSentence || ''} onChange={handleInputChange} rows={2} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" required></textarea>
                </div>
                 <div>
                    <label htmlFor="exampleSentenceMeaning" className="block text-sm font-medium text-slate-700 dark:text-slate-300">예문 뜻 (선택)</label>
                    <textarea name="exampleSentenceMeaning" id="exampleSentenceMeaning" value={newWord.exampleSentenceMeaning || ''} onChange={handleInputChange} rows={2} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm"></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="gradeLevel" className="block text-sm font-medium text-slate-700 dark:text-slate-300">학년 (필수)</label>
                        <select name="gradeLevel" id="gradeLevel" value={newWord.gradeLevel} onChange={handleInputChange} className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm">
                            <option value="middle1">중1</option>
                            <option value="middle2">중2</option>
                            <option value="middle3">중3</option>
                        </select>
                    </div>
                     <div>
                        <label htmlFor="unit" className="block text-sm font-medium text-slate-700 dark:text-slate-300">단원 번호 (선택)</label>
                        <input type="number" name="unit" id="unit" value={newWord.unit === undefined ? '' : newWord.unit} onChange={handleInputChange} min="1" step="1" placeholder="예: 1" className="w-full mt-1 p-2 bg-white dark:bg-slate-600 rounded-md border-slate-300 dark:border-slate-500 shadow-sm" />
                    </div>
                </div>
                <button 
                    type="submit" 
                    disabled={isAddingViaAI || isSubmittingManual}
                    className="w-full py-2 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50"
                >
                    {isSubmittingManual ? '추가 중...' : '수동으로 단어 추가'}
                </button>
            </form>

            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                '전체 단어' 목록에서 사용자 추가 단어(나의 단어)를 수정하거나 삭제할 수 있습니다.
                <button onClick={() => onNavigate('allWords')} className="ml-2 text-cyan-600 dark:text-cyan-400 hover:underline">전체 단어 목록으로 이동</button>
            </p>
        </div>
    );
};

// --- Game Mode Screens ---
// GameSelectionScreen
const GameSelectionScreen: React.FC<ScreenProps> = ({ onNavigate, addToast }) => {
    const games = [
        { id: 'wordMatchGame', name: '짝맞추기 게임', description: '단어와 뜻을 빠르게 연결하세요!', icon: '🔗', screen: 'wordMatchGame' as AppScreen},
        { id: 'typingPracticeGame', name: '타자 연습 게임', description: '단어를 정확하고 빠르게 입력해보세요.', icon: '⌨️', screen: 'typingPracticeGame' as AppScreen },
        { id: 'speedQuizGame', name: '스피드 퀴즈', description: '제한 시간 내에 많은 문제를 풀어보세요!', icon: '⏱️', screen: 'speedQuizGame' as AppScreen },
    ];

    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-6 text-center">🎮 게임 모드 선택</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {games.map(game => (
                    <button
                        key={game.id}
                        onClick={() => {
                            if (game.id === 'typingPracticeGame' || game.id === 'speedQuizGame' ) {
                                addToast(`${game.name}은 준비 중입니다.`, "info");
                            } else {
                                onNavigate(game.screen);
                            }
                        }}
                        className={`bg-slate-100 dark:bg-slate-700 p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 text-center
                                     ${(game.id === 'typingPracticeGame' || game.id === 'speedQuizGame') ? 'opacity-60 cursor-not-allowed' : 'hover:ring-2 hover:ring-cyan-500 dark:hover:ring-cyan-400'}`}
                        aria-label={game.name}
                        disabled={game.id === 'typingPracticeGame' || game.id === 'speedQuizGame'}
                    >
                        <div className="text-4xl mb-3">{game.icon}</div>
                        <h2 className="text-xl font-semibold text-cyan-700 dark:text-cyan-300 mb-2">{game.name}</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{game.description}</p>
                        {(game.id === 'typingPracticeGame' || game.id === 'speedQuizGame') && <span className="mt-2 inline-block text-xs bg-yellow-400 text-slate-800 px-2 py-0.5 rounded-full">준비 중</span>}
                    </button>
                ))}
            </div>
        </div>
    );
};


// WordMatchGame
interface WordMatchGameProps extends ScreenProps {
    words: Word[];
    onGameComplete: (score: number, correct: number, incorrect: number, timeTaken: number) => void;
}

// Define specific types for options in the game
type TermOption = Word & { id: string; type: 'term' }; // id will be 'term-originalId'
type MeaningOption = { meaning: string; id: string; originalWordId: string | number; type: 'meaning' }; // id will be 'meaning-originalId'
type GameOption = TermOption | MeaningOption;


const WordMatchGame: React.FC<WordMatchGameProps> = ({ userSettings, words, onNavigate, onGameComplete, addToast }) => {
    const [gameWords, setGameWords] = useState<Word[]>([]);
    const [options, setOptions] = useState<GameOption[]>([]);
    const [selectedTerm, setSelectedTerm] = useState<TermOption | null>(null);
    const [selectedMeaning, setSelectedMeaning] = useState<MeaningOption | null>(null);
    const [matchedPairs, setMatchedPairs] = useState<string[]>([]); // Stores string IDs of matched options
    const [incorrectAttempts, setIncorrectAttempts] = useState(0);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [isFinished, setIsFinished] = useState(false);
    
    const NUM_PAIRS = 5; // Number of word-meaning pairs in one game

    const initializeGame = useCallback(() => {
        const gradeWords = words.filter(w => w.gradeLevel === userSettings.grade);
        if (gradeWords.length < NUM_PAIRS) {
            addToast(`짝맞추기 게임을 시작하기에 단어가 부족합니다. (최소 ${NUM_PAIRS}개 필요)`, "warning");
            onNavigate('gameSelection');
            return;
        }

        const selectedGameWords = shuffleArray(gradeWords).slice(0, NUM_PAIRS);
        setGameWords(selectedGameWords);
        
        const termsForOptions: TermOption[] = selectedGameWords.map(w => ({
            ...w, 
            id: `term-${w.id}`, 
            type: 'term'
        }));
        const meaningsForOptions: MeaningOption[] = selectedGameWords.map(w => ({ 
            meaning: w.meaning, 
            id: `meaning-${w.id}`,
            originalWordId: w.id,
            type: 'meaning'
        }));
        
        setOptions(shuffleArray([...termsForOptions, ...meaningsForOptions]));
        setSelectedTerm(null);
        setSelectedMeaning(null);
        setMatchedPairs([]);
        setIncorrectAttempts(0);
        setStartTime(Date.now());
        setIsFinished(false);
    }, [words, userSettings.grade, onNavigate, addToast]);

    useEffect(() => {
        initializeGame();
    }, [initializeGame]);

    useEffect(() => {
        if (selectedTerm && selectedMeaning) {
            const originalIdFromTerm = selectedTerm.id.replace('term-', '');
            const originalIdFromMeaningOption = String(selectedMeaning.originalWordId);

            if (originalIdFromTerm === originalIdFromMeaningOption) { // Correct match
                setMatchedPairs(prev => [...prev, selectedTerm.id, selectedMeaning.id]);
                setSelectedTerm(null);
                setSelectedMeaning(null);
                if (matchedPairs.length + 2 === NUM_PAIRS * 2) {
                    setIsFinished(true);
                    const endTime = Date.now();
                    const timeTaken = Math.round((endTime - (startTime || endTime)) / 1000);
                    const score = Math.max(0, (NUM_PAIRS * 10) - (incorrectAttempts * 2) - Math.floor(timeTaken / 10)); // Example scoring
                    onGameComplete(score, NUM_PAIRS, incorrectAttempts, timeTaken);
                    onNavigate('gameResult', { score, correct: NUM_PAIRS, incorrect: incorrectAttempts, timeTaken, gameName: '짝맞추기 게임' });
                }
            } else { // Incorrect match
                addToast("땡! 다시 시도하세요.", "error");
                setIncorrectAttempts(prev => prev + 1);
                
                const termElement = document.getElementById(selectedTerm.id);
                const meaningElement = document.getElementById(selectedMeaning.id);
                termElement?.classList.add('animate-pulse', 'bg-red-300', 'dark:bg-red-700');
                meaningElement?.classList.add('animate-pulse', 'bg-red-300', 'dark:bg-red-700');
                setTimeout(() => {
                    termElement?.classList.remove('animate-pulse', 'bg-red-300', 'dark:bg-red-700');
                    meaningElement?.classList.remove('animate-pulse', 'bg-red-300', 'dark:bg-red-700');
                    setSelectedTerm(null);
                    setSelectedMeaning(null);
                }, 700);
            }
        }
    }, [selectedTerm, selectedMeaning, gameWords, matchedPairs, incorrectAttempts, startTime, onGameComplete, onNavigate, addToast]);

    const handleOptionClick = (option: GameOption) => {
        if (matchedPairs.includes(option.id) || isFinished) return;

        if (option.type === 'term') {
            setSelectedTerm(selectedTerm?.id === option.id ? null : option);
        } else { // option.type === 'meaning'
            setSelectedMeaning(selectedMeaning?.id === option.id ? null : option);
        }
    };
    
    if (gameWords.length === 0 && !isFinished) {
        return <div className="p-8 text-center text-slate-600 dark:text-slate-300">게임 데이터 로딩 중...</div>;
    }

    return (
        <div className="p-4 sm:p-6 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">🔗 짝맞추기 게임</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">단어와 뜻을 연결하세요!</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">남은 짝: {NUM_PAIRS - matchedPairs.length/2} | 틀린 횟수: {incorrectAttempts}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 w-full max-w-2xl">
                {options.map(opt => (
                    <button
                        key={opt.id}
                        id={opt.id} // opt.id is now always a string
                        onClick={() => handleOptionClick(opt)}
                        disabled={matchedPairs.includes(opt.id) || isFinished}
                        className={`p-3 sm:p-4 rounded-lg shadow-md text-sm sm:text-base text-center break-all min-h-[60px] flex items-center justify-center
                            ${matchedPairs.includes(opt.id)
                                ? 'bg-green-500 text-white cursor-default opacity-70'
                                : (selectedTerm?.id === opt.id || selectedMeaning?.id === opt.id)
                                    ? 'bg-yellow-400 dark:bg-yellow-600 text-slate-900 dark:text-white ring-2 ring-yellow-500'
                                    : 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white hover:bg-cyan-500 dark:hover:bg-cyan-400 hover:text-white'
                            }
                            transition-all duration-150 ease-in-out
                        `}
                    >
                        {opt.type === 'term' ? opt.term : opt.meaning}
                    </button>
                ))}
            </div>
             <button onClick={() => onNavigate('gameSelection')} className="mt-8 text-sm text-cyan-600 dark:text-cyan-400 hover:underline">다른 게임 선택</button>
        </div>
    );
};


// GameResultScreen
interface GameResultScreenProps extends ScreenProps {
    routeParams?: { score: number; correct: number; incorrect: number; timeTaken: number; gameName: string };
}
const GameResultScreen: React.FC<GameResultScreenProps> = ({ onNavigate, routeParams, userSettings, addXp }) => {
    const { score = 0, correct = 0, incorrect = 0, timeTaken = 0, gameName = "게임" } = routeParams || {};

    useEffect(() => {
        if(score > 0) {
            addXp(score); // Add score as XP
        }
    }, [score, addXp]);


    return (
        <div className="p-4 sm:p-8 text-center flex flex-col items-center justify-center min-h-[calc(100vh-150px)] sm:min-h-0">
            <h1 className="text-3xl sm:text-4xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">🎉 {gameName} 완료! 🎉</h1>
            <div className="bg-slate-100 dark:bg-slate-700 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md space-y-3">
                <p className="text-5xl font-bold text-yellow-500 dark:text-yellow-400">{score}점</p>
                <p className="text-lg text-slate-700 dark:text-slate-200">맞춘 개수: <span className="font-semibold text-green-500">{correct}</span></p>
                <p className="text-lg text-slate-700 dark:text-slate-200">틀린 횟수: <span className="font-semibold text-red-500">{incorrect}</span></p>
                <p className="text-lg text-slate-700 dark:text-slate-200">걸린 시간: <span className="font-semibold">{timeTaken}초</span></p>
                {score > 0 && <p className="text-md text-yellow-600 dark:text-yellow-300">✨ XP +{score} ✨</p>}
            </div>
            <div className="mt-8 space-x-4">
                <button
                    onClick={() => onNavigate('gameSelection')}
                    className="py-2 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    다른 게임하기
                </button>
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="py-2 px-6 bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로
                </button>
            </div>
        </div>
    );
};


// TypingPracticeGame and SpeedQuizGame - Placeholder
const TypingPracticeGame: React.FC<ScreenProps> = ({ onNavigate }) => (
    <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-cyan-500 mb-4">⌨️ 타자 연습 게임 (준비 중)</h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">이 게임은 현재 개발 중입니다. 곧 만나보실 수 있습니다!</p>
        <button onClick={() => onNavigate('gameSelection')} className="px-6 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600">게임 선택으로 돌아가기</button>
    </div>
);

const SpeedQuizGame: React.FC<ScreenProps> = ({ onNavigate }) => (
     <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-cyan-500 mb-4">⏱️ 스피드 퀴즈 (준비 중)</h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">이 게임은 현재 개발 중입니다. 곧 만나보실 수 있습니다!</p>
        <button onClick={() => onNavigate('gameSelection')} className="px-6 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600">게임 선택으로 돌아가기</button>
    </div>
);

// --- AI Tutor Chat Screen ---
interface TutorChatScreenProps extends ScreenProps {
    words: Word[];
}

interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    timestamp: number;
    relatedWord?: Word;
    isLoading?: boolean;
}

let chatInstance: Chat | null = null;

const TutorChatScreen: React.FC<TutorChatScreenProps> = ({ userSettings, addToast, setGlobalLoading, words }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isChatLoading, setIsChatLoading] = useState(false); // Used for initial AI greeting

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);
    
    // Initialize or re-initialize chat instance if user settings change (especially grade)
    useEffect(() => {
        if (ai) {
            setIsChatLoading(true);
            setGlobalLoading(true); // For initial setup

            const systemInstruction = `You are a friendly and helpful AI English vocabulary tutor for a ${userSettings.grade} Korean student named ${userSettings.username}.
Your main goal is to help the student understand and practice English words.
Be encouraging and patient. Keep your responses concise and easy to understand for the student's level.
You can ask questions to check understanding, provide simpler explanations, or offer different example sentences for words if the student is confused.
If the student asks about a specific word you know from their word list, try to use its details (meaning, part of speech, example) in your explanation.
If the student mentions a word you don't know, you can ask them to provide its meaning or use it in a sentence, then you can discuss it.
You can also suggest simple vocabulary practice activities or quiz the student on a word.
Start the conversation by greeting the student and asking how you can help them with English vocabulary today.
Respond in Korean, but use English words when discussing vocabulary terms. Example: "안녕하세요, ${userSettings.username}님! 'apple'이라는 단어에 대해 더 알고 싶으신가요?"
Do not use markdown formatting like **bold** or *italics* in your responses. Keep it plain text.`;
            
            chatInstance = ai.chats.create({
                model: 'gemini-2.5-flash-preview-04-17',
                config: { systemInstruction }
            });

            // Send an initial (empty or greeting) message to get the AI's first response.
            // This is a common pattern to "prime" the chat.
            chatInstance.sendMessage({ message: "Hello" }) // Could be an empty string, or a specific priming message
                .then(response => {
                    const aiGreeting: ChatMessage = {
                        id: `ai-${Date.now()}`,
                        text: response.text.trim() || `안녕하세요, ${userSettings.username}님! 오늘 영어 단어 학습에 대해 무엇을 도와드릴까요?`,
                        sender: 'ai',
                        timestamp: Date.now()
                    };
                    setMessages([aiGreeting]);
                })
                .catch(error => {
                    console.error("Error initializing AI Tutor chat:", error);
                    const { displayErrorMsg } = parseGeminiError(error);
                    addToast(`AI 튜터 초기화 중 오류 발생: ${displayErrorMsg}`, "error");
                    setMessages([{
                        id: `ai-error-${Date.now()}`,
                        text: "AI 튜터와 연결 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.",
                        sender: 'ai',
                        timestamp: Date.now()
                    }]);
                })
                .finally(() => {
                    setIsChatLoading(false);
                    setGlobalLoading(false);
                });
        } else {
             setMessages([{
                id: `ai-error-noapikey-${Date.now()}`,
                text: "AI 튜터 기능을 사용하려면 API 키가 필요합니다. 설정을 확인해주세요.",
                sender: 'ai',
                timestamp: Date.now()
            }]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userSettings.grade, userSettings.username]); // Re-initialize if grade/username changes. `addToast` and `setGlobalLoading` are stable.


    const handleSendMessage = async () => {
        const trimmedInput = inputText.trim();
        if (!trimmedInput || isSending || !chatInstance) {
            if (!chatInstance && process.env.API_KEY) addToast("AI 튜터가 아직 준비되지 않았습니다. 잠시만 기다려주세요.", "warning");
            else if (!process.env.API_KEY) addToast("AI 튜터 기능을 사용하려면 API 키가 필요합니다.", "error");
            return;
        }
         if (isCurrentlyGeminiQuotaExhausted) {
            addToast("Gemini API 할당량이 소진되어 메시지를 보낼 수 없습니다.", "error");
            return;
        }

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            text: trimmedInput,
            sender: 'user',
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setIsSending(true);
        setGlobalLoading(true);

        const aiLoadingMessageId = `ai-loading-${Date.now()}`;
        setMessages(prev => [...prev, { id: aiLoadingMessageId, text: "AI가 응답을 생각 중이에요...", sender: 'ai', timestamp: Date.now(), isLoading: true }]);

        try {
            const response = await chatInstance.sendMessage({ message: trimmedInput });
            const aiResponse: ChatMessage = {
                id: `ai-${Date.now()}`,
                text: response.text.trim(),
                sender: 'ai',
                timestamp: Date.now()
            };
            setMessages(prev => prev.filter(m => m.id !== aiLoadingMessageId)); // Remove loading
            setMessages(prev => [...prev, aiResponse]); // Add actual response

        } catch (error: any) {
            console.error("Error sending message to AI Tutor:", error);
            const { isQuotaExhaustedError, displayErrorMsg, statusCode, geminiErrorStatus } = parseGeminiError(error);
            const featureDescription = "AI 튜터 채팅";

            if (isQuotaExhaustedError) {
                setGeminiQuotaExhaustedCooldown(addToast, featureDescription);
                 setMessages(prev => prev.filter(m => m.id !== aiLoadingMessageId));
                 setMessages(prev => [...prev, { id: `ai-error-${Date.now()}`, text: `Gemini API 할당량 초과로 응답을 받을 수 없습니다. (에러: ${displayErrorMsg})`, sender: 'ai', timestamp: Date.now() }]);
            } else {
                 addToast(`AI 튜터 응답 중 오류: ${displayErrorMsg}`, "error");
                 setMessages(prev => prev.filter(m => m.id !== aiLoadingMessageId));
                 setMessages(prev => [...prev, { id: `ai-error-${Date.now()}`, text: `죄송해요, 답변 중 오류가 발생했어요. (에러: ${displayErrorMsg})`, sender: 'ai', timestamp: Date.now() }]);
            }
             console.error(`Error during ${featureDescription}. Status Code: ${statusCode}, Gemini Status: ${geminiErrorStatus}. Error: ${displayErrorMsg}`, error);
        } finally {
            setIsSending(false);
            setGlobalLoading(false);
        }
    };
    
    return (
        <div className="flex flex-col h-[calc(100vh-120px)] sm:h-[calc(85vh-80px)] max-h-[700px]"> {/* Adjusted height */}
            <h1 className="text-xl sm:text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-4 p-4 border-b border-slate-200 dark:border-slate-700 text-center">
                💬 AI 영어 학습 튜터
            </h1>
            <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50 dark:bg-slate-800/50">
                {isChatLoading && messages.length === 0 && (
                     <div className="flex justify-center items-center h-full">
                        <p className="text-slate-500 dark:text-slate-400">AI 튜터를 불러오는 중입니다...</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] p-3 rounded-xl shadow ${msg.sender === 'user' 
                            ? 'bg-cyan-500 text-white rounded-br-none' 
                            : `bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white rounded-bl-none ${msg.isLoading ? 'opacity-70 animate-pulse' : ''}`
                        }`}>
                            <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                            <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-cyan-100/80 text-right' : 'text-slate-400 dark:text-slate-500 text-left'}`}>
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/50">
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !isSending && handleSendMessage()}
                        placeholder={isSending || !chatInstance || isChatLoading ? "잠시 기다려주세요..." : "메시지를 입력하세요..."}
                        className="flex-grow p-3 bg-white dark:bg-slate-600 text-slate-900 dark:text-white rounded-lg border border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        disabled={isSending || !chatInstance || isChatLoading || isCurrentlyGeminiQuotaExhausted}
                        aria-label="채팅 메시지 입력"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={isSending || !chatInstance || !inputText.trim() || isChatLoading || isCurrentlyGeminiQuotaExhausted}
                        className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        전송
                    </button>
                </div>
                 {isCurrentlyGeminiQuotaExhausted && <p className="text-xs text-red-500 dark:text-red-400 text-center mt-1">Gemini API 할당량 초과로 메시지를 보낼 수 없습니다.</p>}
            </div>
        </div>
    );
};


// --- Main App Component ---
const App: React.FC = () => {
    const { addToast } = useToasts();
    const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
    const [currentScreen, setCurrentScreen] = useState<AppScreen>('loginSetup');
    const [allWords, setAllWords] = useState<Word[]>([]); 
    const [wordStats, setWordStats] = useState<Record<string | number, WordStat>>({});
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [globalLoading, setGlobalLoading] = useState(false);
    const [routeParams, setRouteParams] = useState<any>(null); // For passing params between screens

    // Learning Stats
    const [learnedWordsTodayCount, setLearnedWordsTodayCount] = useState(0);
    const [totalWordsLearnedOverall, setTotalWordsLearnedOverall] = useState(0);
    const [learningStreak, setLearningStreak] = useState({ currentStreak: 0, bestStreak: 0, lastLearnedDate: '' });
    const [quizHistory, setQuizHistory] = useState<{ score: number, total: number, date: string }[]>([]);
    const [quizTakenToday, setQuizTakenToday] = useState(false);


    const calculateXPLevel = (xp: number) => {
        let level = 1;
        let xpForNext = 100;
        let cumulativeXpForLevel = 0;
        while (xp >= cumulativeXpForLevel + xpForNext) {
            cumulativeXpForLevel += xpForNext;
            level++;
            xpForNext = level * 100; 
        }
        return { level, currentLevelXp: xp - cumulativeXpForLevel, xpForNextLevel: xpForNext };
    };
    
    const addXp = useCallback((amount: number) => {
        setUserSettings(prevSettings => {
            if (!prevSettings) return null;
            const newXp = (prevSettings.xp || 0) + amount;
            const { level: newLevel } = calculateXPLevel(newXp);
            
            if (newLevel > prevSettings.level) {
                 addToast(`레벨 업! ${newLevel}레벨 달성! 🎉`, "success");
            }
            return { ...prevSettings, xp: newXp, level: newLevel };
        });
    }, [addToast]);


    // Load data from localStorage on mount
    useEffect(() => {
        const storedSettings = localStorage.getItem('userSettings');
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings) as UserSettings;
            // Ensure level and xp are initialized if not present
            if (parsedSettings.xp === undefined) parsedSettings.xp = 0;
            if (parsedSettings.level === undefined) parsedSettings.level = calculateXPLevel(parsedSettings.xp).level;
            
            setUserSettings(parsedSettings);
            setCurrentScreen('dashboard'); 
            if (parsedSettings.theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }

        const storedAllWords = localStorage.getItem('allWords');
        setAllWords(storedAllWords ? JSON.parse(storedAllWords) : [...sampleWords]);

        const storedWordStats = localStorage.getItem('wordStats');
        setWordStats(storedWordStats ? JSON.parse(storedWordStats) : {});
        
        // Load learning stats
        const storedLearnedToday = localStorage.getItem('learnedWordsTodayCount');
        const storedTotalLearned = localStorage.getItem('totalWordsLearnedOverall');
        const storedStreak = localStorage.getItem('learningStreak');
        const storedQuizHistory = localStorage.getItem('quizHistory');
        const storedQuizTakenToday = localStorage.getItem('quizTakenToday');

        const today = getTodayDateString();
        
        if (storedLearnedToday && JSON.parse(storedLearnedToday).date === today) {
            setLearnedWordsTodayCount(JSON.parse(storedLearnedToday).count);
        } else {
            localStorage.setItem('learnedWordsTodayCount', JSON.stringify({ count: 0, date: today }));
        }

        setTotalWordsLearnedOverall(storedTotalLearned ? parseInt(storedTotalLearned, 10) : 0);

        if (storedStreak) {
            const parsedStreak = JSON.parse(storedStreak);
            if (parsedStreak.lastLearnedDate !== today) { // Check if streak needs reset or update
                 const yesterday = new Date();
                 yesterday.setDate(yesterday.getDate() - 1);
                 if (parsedStreak.lastLearnedDate !== yesterday.toISOString().split('T')[0]) {
                    // Not learned yesterday, reset current streak
                    setLearningStreak({ ...parsedStreak, currentStreak: 0 }); 
                 } else {
                    setLearningStreak(parsedStreak); // Streak continues from yesterday
                 }
            } else {
                 setLearningStreak(parsedStreak); // Learned today already, keep current streak
            }
        } else {
            setLearningStreak({ currentStreak: 0, bestStreak: 0, lastLearnedDate: '' });
        }
        
        setQuizHistory(storedQuizHistory ? JSON.parse(storedQuizHistory) : []);
        if (storedQuizTakenToday && JSON.parse(storedQuizTakenToday).date === today) {
            setQuizTakenToday(JSON.parse(storedQuizTakenToday).taken);
        } else {
             localStorage.setItem('quizTakenToday', JSON.stringify({ taken: false, date: today }));
        }


    }, []);

    // Save data to localStorage whenever it changes
    useEffect(() => {
        if (userSettings) localStorage.setItem('userSettings', JSON.stringify(userSettings));
    }, [userSettings]);

    useEffect(() => {
        localStorage.setItem('allWords', JSON.stringify(allWords));
    }, [allWords]);

    useEffect(() => {
        localStorage.setItem('wordStats', JSON.stringify(wordStats));
    }, [wordStats]);

    // Save learning stats
    useEffect(() => {
        localStorage.setItem('learnedWordsTodayCount', JSON.stringify({ count: learnedWordsTodayCount, date: getTodayDateString() }));
    }, [learnedWordsTodayCount]);
    useEffect(() => {
        localStorage.setItem('totalWordsLearnedOverall', String(totalWordsLearnedOverall));
    }, [totalWordsLearnedOverall]);
    useEffect(() => {
        localStorage.setItem('learningStreak', JSON.stringify(learningStreak));
    }, [learningStreak]);
    useEffect(() => {
        localStorage.setItem('quizHistory', JSON.stringify(quizHistory));
    }, [quizHistory]);
    useEffect(() => {
        localStorage.setItem('quizTakenToday', JSON.stringify({ taken: quizTakenToday, date: getTodayDateString() }));
    }, [quizTakenToday]);


    const handleSetupComplete = (settings: UserSettings) => {
        setUserSettings(settings);
        setAllWords([...sampleWords]); // Initialize with sample words on first setup
        setWordStats({});
        // Reset learning stats on new setup
        setLearnedWordsTodayCount(0);
        setTotalWordsLearnedOverall(0);
        setLearningStreak({ currentStreak: 0, bestStreak: 0, lastLearnedDate: ''});
        setQuizHistory([]);
        setQuizTakenToday(false);
        setCurrentScreen('dashboard');
        addToast(`환영합니다, ${settings.username}님! 설정이 완료되었습니다.`, "success");
         if (settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };
    
    const handleNavigate = (screen: AppScreen, params?: any) => {
        setCurrentScreen(screen);
        setRouteParams(params);
        window.scrollTo(0, 0); // Scroll to top on navigation
    };

    const handleSaveSettings = (newSettings: UserSettings) => {
        const oldTheme = userSettings?.theme;
        setUserSettings(newSettings);
        setIsSettingsModalOpen(false);
        addToast("설정이 성공적으로 저장되었습니다.", "success");

        if (newSettings.theme !== oldTheme) {
            if (newSettings.theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    };
    
    const handleResetAllData = () => {
        if (window.confirm("정말로 모든 학습 데이터와 설정을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
            localStorage.clear();
            setUserSettings(null);
            setAllWords([...sampleWords]);
            setWordStats({});
            setLearnedWordsTodayCount(0);
            setTotalWordsLearnedOverall(0);
            setLearningStreak({ currentStreak: 0, bestStreak: 0, lastLearnedDate: '' });
            setQuizHistory([]);
            setQuizTakenToday(false);
            if (quotaCooldownTimeoutId) clearTimeout(quotaCooldownTimeoutId);
            isCurrentlyGeminiQuotaExhausted = false;
            quotaCooldownTimeoutId = null;
            document.documentElement.classList.remove('dark'); // Default to light on reset or ensure it matches default
            setCurrentScreen('loginSetup');
            addToast("모든 데이터가 초기화되었습니다.", "info");
        }
    };


    const onWordLearned = (wordId: string | number, isQuickReview: boolean = false) => {
        const today = getTodayDateString();
        const stat = wordStats[wordId] || getDefaultWordStat(wordId);
        
        const wasLearnedTodayForTheFirstTime = !stat.lastReviewed || stat.lastReviewed.split('T')[0] !== today;

        updateWordStat(wordId, { lastReviewed: new Date().toISOString() });

        if (wasLearnedTodayForTheFirstTime && !isQuickReview) {
            setLearnedWordsTodayCount(prev => prev + 1);
            setTotalWordsLearnedOverall(prev => prev + 1);
            addXp(5); // XP for learning a new word

            setLearningStreak(prevStreak => {
                const newCurrentStreak = prevStreak.lastLearnedDate === today 
                    ? prevStreak.currentStreak // Already learned a word today, streak continues
                    : (prevStreak.lastLearnedDate === new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0]
                        ? prevStreak.currentStreak + 1 // Learned yesterday, increment streak
                        : 1); // Didn't learn yesterday, reset to 1
                
                return {
                    currentStreak: newCurrentStreak,
                    bestStreak: Math.max(prevStreak.bestStreak, newCurrentStreak),
                    lastLearnedDate: today
                };
            });
        } else if (isQuickReview) {
             addXp(1); // Small XP for quick review
        }
    };
    
    const onQuizComplete = (finalScore: number, totalQuestions: number, incorrectWords: Word[]) => {
        const today = getTodayDateString();
        setQuizHistory(prev => [...prev, { score: finalScore, total: totalQuestions, date: today }]);
        setQuizTakenToday(true);
        addToast(`퀴즈 완료! ${totalQuestions}문제 중 ${finalScore}문제 정답!`, "success");
        addXp(Math.round(finalScore * 1.5)); // XP based on quiz score (e.g., 1.5 XP per correct answer)
    };
    
    const updateWordStat = (wordId: string | number, newStatData: Partial<Omit<WordStat, 'id'>>) => {
        setWordStats(prevStats => ({
            ...prevStats,
            [wordId]: {
                ...(prevStats[wordId] || getDefaultWordStat(wordId)),
                ...newStatData,
                id: wordId 
            }
        }));
    };
    
    const onSaveCustomWord = async (wordData: Partial<Word>, gradeLevelForNew = userSettings?.grade, unitNumber?: number): Promise<boolean> => {
        if (!wordData.term?.trim() || !wordData.meaning?.trim() || !wordData.partOfSpeech?.trim() || !wordData.exampleSentence?.trim()) {
            addToast("단어, 뜻, 품사, 예문은 필수 항목입니다.", "error");
            return false;
        }

        const termToSave = wordData.term.trim();

        if (wordData.id) { // Editing existing custom word
            const wordIndex = allWords.findIndex(w => w.id === wordData.id && w.isCustom);
            if (wordIndex > -1) {
                const updatedWord = { ...allWords[wordIndex], ...wordData, term: termToSave, unit: unitNumber !== undefined ? String(unitNumber) : allWords[wordIndex].unit };
                const newAllWords = [...allWords];
                newAllWords[wordIndex] = updatedWord;
                setAllWords(newAllWords);

                // If it's a "my word", update it in myWords as well (though myWords is derived, this ensures consistency if it's directly manipulated elsewhere)
                // This part is more conceptual as myWords is not a separate state but words from allWords with isCustom=true
                addToast(`'${updatedWord.term}' 단어가 수정되었습니다.`, "success");
                return true;
            }
            addToast("수정할 단어를 찾지 못했습니다.", "error");
            return false;
        } else { // Adding new word
            const existingWordGlobal = allWords.find(w => w.term.toLowerCase() === termToSave.toLowerCase());
            if (existingWordGlobal) {
                if (!existingWordGlobal.isCustom) {
                    addToast(`'${termToSave}'은(는) 이미 기본 단어 목록에 존재합니다. 단원 ${unitNumber ? unitNumber + '에 ' : ''}새로 추가되지 않습니다.`, "info");
                } else {
                    addToast(`'${termToSave}'은(는) 이미 나의 단어 목록에 존재합니다. 단원 ${unitNumber ? unitNumber + '에 ' : ''}새로 추가되지 않습니다.`, "info");
                }
                return false; 
            }

            const newWord: Word = {
                id: Date.now().toString(), 
                term: termToSave,
                pronunciation: wordData.pronunciation || '',
                partOfSpeech: wordData.partOfSpeech,
                meaning: wordData.meaning,
                exampleSentence: wordData.exampleSentence,
                exampleSentenceMeaning: wordData.exampleSentenceMeaning || '',
                gradeLevel: gradeLevelForNew || userSettings?.grade || 'middle1',
                isCustom: true,
                unit: unitNumber !== undefined ? String(unitNumber) : undefined
            };
            setAllWords(prevWords => [...prevWords, newWord]);
            if (!wordStats[newWord.id]) { // Initialize stats for the new word
                updateWordStat(newWord.id, getDefaultWordStat(newWord.id));
            }
            addXp(2); // XP for adding a new custom word
            return true;
        }
    };
    
    const onDeleteCustomWord = (wordId: number | string) => {
        const wordToDelete = allWords.find(w => w.id === wordId);
        if (wordToDelete && wordToDelete.isCustom) {
            setAllWords(prevWords => prevWords.filter(w => w.id !== wordId));
            // Remove its stats as well
            setWordStats(prevStats => {
                const newStats = { ...prevStats };
                delete newStats[wordId];
                return newStats;
            });
            addToast(`'${wordToDelete.term}' 단어가 삭제되었습니다.`, "success");
        } else if (wordToDelete && !wordToDelete.isCustom) {
             addToast("기본 제공 단어는 삭제할 수 없습니다.", "warning");
        } else {
            addToast("삭제할 단어를 찾지 못했습니다.", "error");
        }
    };
    
    const averageQuizScore = quizHistory.length > 0 
        ? quizHistory.reduce((acc, curr) => acc + (curr.score / Math.max(1, curr.total)), 0) / quizHistory.length * 100 
        : 0;

    const hasIncorrectWordsToReview = Object.values(wordStats).some(stat => stat.quizIncorrectCount > 0 && !stat.isMastered);


    const screenProps: ScreenProps = { 
        userSettings: userSettings!, 
        onNavigate: handleNavigate, 
        currentScreen, 
        setGlobalLoading, 
        addToast,
        openSettingsModal: () => setIsSettingsModalOpen(true),
        addXp,
    };

    if (!userSettings) {
        return <LoginSetupScreen onSetupComplete={handleSetupComplete} onNavigate={handleNavigate} addToast={addToast} />;
    }
    
    let CurrentScreenComponent;
    switch (currentScreen) {
        case 'dashboard': CurrentScreenComponent = <DashboardScreen {...screenProps} allWords={allWords} wordStats={wordStats} learnedWordsToday={learnedWordsTodayCount} totalWordsLearned={totalWordsLearnedOverall} learningStreak={learningStreak} averageQuizScore={averageQuizScore} quizTakenToday={quizTakenToday} hasIncorrectWordsToReview={hasIncorrectWordsToReview}/>; break;
        case 'learnWords': CurrentScreenComponent = <LearnWordsScreen {...screenProps} words={allWords} wordStats={wordStats} onWordLearned={onWordLearned} />; break;
        case 'quiz': CurrentScreenComponent = <QuizScreen {...screenProps} words={allWords} wordStats={wordStats} onQuizComplete={onQuizComplete} updateWordStat={updateWordStat} />; break;
        case 'allWords': CurrentScreenComponent = <AllWordsScreen {...screenProps} allWords={allWords} wordStats={wordStats} onDeleteCustomWord={onDeleteCustomWord} onSaveCustomWord={onSaveCustomWord} updateWordStat={updateWordStat}/>; break;
        case 'wordsByUnit': CurrentScreenComponent = <WordsByUnitScreen {...screenProps} allWords={allWords} onSaveCustomWord={onSaveCustomWord} />; break;
        case 'stats': CurrentScreenComponent = <StatsScreen {...screenProps} allWords={allWords} wordStats={wordStats} learnedWordsTodayCount={learnedWordsTodayCount} learningStreak={learningStreak} averageQuizScore={averageQuizScore} />; break;
        case 'manageWords': CurrentScreenComponent = <ManageWordsScreen {...screenProps} allWords={allWords} onSaveCustomWord={onSaveCustomWord} onDeleteCustomWord={onDeleteCustomWord} />; break;
        case 'tutorChat': CurrentScreenComponent = <TutorChatScreen {...screenProps} words={allWords} />; break;
        case 'gameSelection': CurrentScreenComponent = <GameSelectionScreen {...screenProps} />; break;
        case 'wordMatchGame': CurrentScreenComponent = <WordMatchGame {...screenProps} words={allWords} onGameComplete={(score, correct, incorrect, timeTaken) => addXp(score)} />; break;
        case 'typingPracticeGame': CurrentScreenComponent = <TypingPracticeGame {...screenProps} />; break;
        case 'speedQuizGame': CurrentScreenComponent = <SpeedQuizGame {...screenProps} />; break;
        case 'gameResult': CurrentScreenComponent = <GameResultScreen {...screenProps} routeParams={routeParams} />; break;
        default: CurrentScreenComponent = <DashboardScreen {...screenProps} allWords={allWords} wordStats={wordStats} learnedWordsToday={learnedWordsTodayCount} totalWordsLearned={totalWordsLearnedOverall} learningStreak={learningStreak} averageQuizScore={averageQuizScore} quizTakenToday={quizTakenToday} hasIncorrectWordsToReview={hasIncorrectWordsToReview} />;
    }

    return (
        <>
            <NavBar currentScreen={currentScreen} onNavigate={handleNavigate} userSettings={userSettings} onOpenSettings={() => setIsSettingsModalOpen(true)} />
            <main className="flex-grow overflow-y-auto custom-scrollbar bg-white dark:bg-slate-800">
                {CurrentScreenComponent}
            </main>
            {isSettingsModalOpen && userSettings && (
                <EditSettingsModal 
                    isOpen={isSettingsModalOpen} 
                    currentSettings={userSettings} 
                    onSave={handleSaveSettings} 
                    onCancel={() => setIsSettingsModalOpen(false)}
                    onResetData={handleResetAllData}
                    addToast={addToast}
                />
            )}
            <GlobalSpinner isLoading={globalLoading} />
        </>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <ToastProvider>
                <App />
            </ToastProvider>
        </React.StrictMode>
    );
}
