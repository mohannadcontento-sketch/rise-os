/*
  Design reminder — “حكاية الورق الملوّن”: a warm editorial children's workbook.
  Keep every interaction simple, tactile, encouraging, and anchored by Emerald Leaf #147D6D.
*/
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Flame,
  Gamepad2,
  Headphones,
  Leaf,
  ListChecks,
  Menu,
  Mic,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getEmbeddedAudioCue, type AudioCue } from "@/lib/embeddedAudio";

type Mode = "letters" | "sentences";
type SentenceCategory = "الكل" | "التحية" | "اللباقة" | "البيت" | "المشاعر" | "اللعب" | "التعلّم";
type GameMode = "listen" | "match" | "sentence";
type PronunciationPhase = "ready" | "listening" | "retry" | "success" | "unavailable";
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type LetterLesson = {
  letter: string;
  lower: string;
  sound: string;
  ipa: string;
  word: string;
  wordAr: string;
  hint: string;
};

type SentenceLesson = {
  id: number;
  english: string;
  arabic: string;
  category: Exclude<SentenceCategory, "الكل">;
};

const letters: LetterLesson[] = [
  { letter: "A", lower: "a", sound: "ay", ipa: "/eɪ/", word: "apple", wordAr: "تفاحة", hint: "إي" },
  { letter: "B", lower: "b", sound: "bee", ipa: "/biː/", word: "ball", wordAr: "كرة", hint: "بي" },
  { letter: "C", lower: "c", sound: "see", ipa: "/siː/", word: "cat", wordAr: "قطة", hint: "سي" },
  { letter: "D", lower: "d", sound: "dee", ipa: "/diː/", word: "dog", wordAr: "كلب", hint: "دي" },
  { letter: "E", lower: "e", sound: "ee", ipa: "/iː/", word: "egg", wordAr: "بيضة", hint: "إي طويلة" },
  { letter: "F", lower: "f", sound: "ef", ipa: "/ɛf/", word: "fish", wordAr: "سمكة", hint: "إف" },
  { letter: "G", lower: "g", sound: "gee", ipa: "/dʒiː/", word: "goat", wordAr: "ماعز", hint: "جي" },
  { letter: "H", lower: "h", sound: "aitch", ipa: "/eɪtʃ/", word: "hat", wordAr: "قبعة", hint: "إيتش" },
  { letter: "I", lower: "i", sound: "eye", ipa: "/aɪ/", word: "ice", wordAr: "ثلج", hint: "آي" },
  { letter: "J", lower: "j", sound: "jay", ipa: "/dʒeɪ/", word: "juice", wordAr: "عصير", hint: "جاي" },
  { letter: "K", lower: "k", sound: "kay", ipa: "/keɪ/", word: "kite", wordAr: "طائرة ورقية", hint: "كاي" },
  { letter: "L", lower: "l", sound: "el", ipa: "/ɛl/", word: "lion", wordAr: "أسد", hint: "إل" },
  { letter: "M", lower: "m", sound: "em", ipa: "/ɛm/", word: "moon", wordAr: "قمر", hint: "إم" },
  { letter: "N", lower: "n", sound: "en", ipa: "/ɛn/", word: "nose", wordAr: "أنف", hint: "إن" },
  { letter: "O", lower: "o", sound: "oh", ipa: "/oʊ/", word: "orange", wordAr: "برتقالة", hint: "أو" },
  { letter: "P", lower: "p", sound: "pee", ipa: "/piː/", word: "pig", wordAr: "خنزير", hint: "بي" },
  { letter: "Q", lower: "q", sound: "cue", ipa: "/kjuː/", word: "queen", wordAr: "ملكة", hint: "كيو" },
  { letter: "R", lower: "r", sound: "ar", ipa: "/ɑːr/", word: "rabbit", wordAr: "أرنب", hint: "آر" },
  { letter: "S", lower: "s", sound: "ess", ipa: "/ɛs/", word: "sun", wordAr: "شمس", hint: "إس" },
  { letter: "T", lower: "t", sound: "tee", ipa: "/tiː/", word: "tree", wordAr: "شجرة", hint: "تي" },
  { letter: "U", lower: "u", sound: "you", ipa: "/juː/", word: "umbrella", wordAr: "مظلة", hint: "يو" },
  { letter: "V", lower: "v", sound: "vee", ipa: "/viː/", word: "van", wordAr: "شاحنة", hint: "في" },
  { letter: "W", lower: "w", sound: "double-u", ipa: "/ˈdʌbəljuː/", word: "water", wordAr: "ماء", hint: "دَبْل يو" },
  { letter: "X", lower: "x", sound: "ex", ipa: "/ɛks/", word: "box", wordAr: "صندوق", hint: "إكس" },
  { letter: "Y", lower: "y", sound: "why", ipa: "/waɪ/", word: "yellow", wordAr: "أصفر", hint: "واي" },
  { letter: "Z", lower: "z", sound: "zee", ipa: "/ziː/", word: "zebra", wordAr: "حمار وحشي", hint: "زي" },
];

const sentences: SentenceLesson[] = [
  { id: 1, english: "Hello!", arabic: "مرحبًا!", category: "التحية" },
  { id: 2, english: "Good morning.", arabic: "صباح الخير.", category: "التحية" },
  { id: 3, english: "Good night.", arabic: "تصبح على خير.", category: "التحية" },
  { id: 4, english: "How are you?", arabic: "كيف حالك؟", category: "التحية" },
  { id: 5, english: "I'm fine, thank you.", arabic: "أنا بخير، شكرًا لك.", category: "التحية" },
  { id: 6, english: "What's your name?", arabic: "ما اسمك؟", category: "التحية" },
  { id: 7, english: "My name is ...", arabic: "اسمي ...", category: "التحية" },
  { id: 8, english: "Nice to meet you.", arabic: "سعيد بلقائك.", category: "التحية" },
  { id: 9, english: "Please.", arabic: "من فضلك.", category: "اللباقة" },
  { id: 10, english: "Thank you.", arabic: "شكرًا لك.", category: "اللباقة" },
  { id: 11, english: "You're welcome.", arabic: "على الرحب والسعة.", category: "اللباقة" },
  { id: 12, english: "Excuse me.", arabic: "عذرًا.", category: "اللباقة" },
  { id: 13, english: "I'm sorry.", arabic: "أنا آسف.", category: "اللباقة" },
  { id: 14, english: "Yes, please.", arabic: "نعم، من فضلك.", category: "اللباقة" },
  { id: 15, english: "No, thank you.", arabic: "لا، شكرًا.", category: "اللباقة" },
  { id: 16, english: "Can you help me?", arabic: "هل يمكنك مساعدتي؟", category: "التعلّم" },
  { id: 17, english: "I don't understand.", arabic: "أنا لا أفهم.", category: "التعلّم" },
  { id: 18, english: "Please say it again.", arabic: "من فضلك قلها مرة أخرى.", category: "التعلّم" },
  { id: 19, english: "Speak slowly, please.", arabic: "تكلّم ببطء، من فضلك.", category: "التعلّم" },
  { id: 20, english: "What is this?", arabic: "ما هذا؟", category: "التعلّم" },
  { id: 21, english: "This is my book.", arabic: "هذا كتابي.", category: "التعلّم" },
  { id: 22, english: "I like apples.", arabic: "أنا أحب التفاح.", category: "المشاعر" },
  { id: 23, english: "I don't like milk.", arabic: "أنا لا أحب الحليب.", category: "المشاعر" },
  { id: 24, english: "I am hungry.", arabic: "أنا جائع.", category: "المشاعر" },
  { id: 25, english: "I am thirsty.", arabic: "أنا عطشان.", category: "المشاعر" },
  { id: 26, english: "Let's play!", arabic: "هيا نلعب!", category: "اللعب" },
  { id: 27, english: "Come with me.", arabic: "تعال معي.", category: "اللعب" },
  { id: 28, english: "Wait a minute.", arabic: "انتظر دقيقة.", category: "اللعب" },
  { id: 29, english: "Look at this!", arabic: "انظر إلى هذا!", category: "اللعب" },
  { id: 30, english: "Listen carefully.", arabic: "استمع بعناية.", category: "التعلّم" },
  { id: 31, english: "Open the door.", arabic: "افتح الباب.", category: "البيت" },
  { id: 32, english: "Close the window.", arabic: "أغلق النافذة.", category: "البيت" },
  { id: 33, english: "Sit down, please.", arabic: "اجلس، من فضلك.", category: "التعلّم" },
  { id: 34, english: "Stand up, please.", arabic: "قف، من فضلك.", category: "التعلّم" },
  { id: 35, english: "Wash your hands.", arabic: "اغسل يديك.", category: "البيت" },
  { id: 36, english: "Brush your teeth.", arabic: "نظّف أسنانك.", category: "البيت" },
  { id: 37, english: "I am ready.", arabic: "أنا مستعد.", category: "المشاعر" },
  { id: 38, english: "Let's go!", arabic: "هيا بنا!", category: "اللعب" },
  { id: 39, english: "See you soon.", arabic: "أراك قريبًا.", category: "التحية" },
  { id: 40, english: "See you tomorrow.", arabic: "أراك غدًا.", category: "التحية" },
  { id: 41, english: "Have a nice day.", arabic: "أتمنى لك يومًا سعيدًا.", category: "التحية" },
  { id: 42, english: "What time is it?", arabic: "كم الساعة؟", category: "التعلّم" },
  { id: 43, english: "It's my turn.", arabic: "حان دوري.", category: "اللعب" },
  { id: 44, english: "Your turn!", arabic: "دورك!", category: "اللعب" },
  { id: 45, english: "I can do it.", arabic: "أستطيع فعلها.", category: "المشاعر" },
  { id: 46, english: "Try again.", arabic: "حاول مرة أخرى.", category: "التعلّم" },
  { id: 47, english: "Great job!", arabic: "عمل رائع!", category: "التعلّم" },
  { id: 48, english: "Well done!", arabic: "أحسنت!", category: "التعلّم" },
  { id: 49, english: "I love learning English.", arabic: "أحب تعلّم الإنجليزية.", category: "التعلّم" },
  { id: 50, english: "English is fun!", arabic: "الإنجليزية ممتعة!", category: "التعلّم" },
];

const categories: SentenceCategory[] = ["الكل", "التحية", "اللباقة", "البيت", "المشاعر", "اللعب", "التعلّم"];
const heroImage = "/media/ekq-hero-paper.jpg";
const lettersImage = "/media/ekq-letters-paper.jpg";
const sentencesImage = "/media/ekq-sentences-paper.jpg";
const mascotImage = "/media/ekq-logo-paper.png";
const logoImage = "/media/ekq-logo-paper.png";
const sentencePuzzles = [
  { arabic: "صباح الخير.", words: ["Good", "morning."], sentenceIndex: 1 },
  { arabic: "كيف حالك؟", words: ["How", "are", "you?"], sentenceIndex: 3 },
  { arabic: "شكرًا لك.", words: ["Thank", "you."], sentenceIndex: 9 },
  { arabic: "هيا نلعب!", words: ["Let's", "play!"], sentenceIndex: 25 },
  { arabic: "أنا مستعد.", words: ["I", "am", "ready."], sentenceIndex: 36 },
];

function shuffleChoices<T>(choices: T[]): T[] {
  const shuffled = [...choices];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function normalizeSpokenEnglish(value: string) {
  return value.toLowerCase().replace(/[^a-z\s']/g, "").replace(/\s+/g, " ").trim();
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("letters");
  const [activeLetterIndex, setActiveLetterIndex] = useState(0);
  const [completedLetters, setCompletedLetters] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("ekq-letters") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [completedSentences, setCompletedSentences] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("ekq-sentences") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechNotice, setSpeechNotice] = useState("");
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);
  const [quizRound, setQuizRound] = useState(0);
  const [sentenceCategory, setSentenceCategory] = useState<SentenceCategory>("الكل");
  const [sentenceSearch, setSentenceSearch] = useState("");
  const [sentencePage, setSentencePage] = useState(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeGame, setActiveGame] = useState<GameMode>("listen");
  const [gameStars, setGameStars] = useState(() => {
    try {
      return Number(localStorage.getItem("ekq-game-stars") ?? "0");
    } catch {
      return 0;
    }
  });
  const [gameWins, setGameWins] = useState(() => {
    try {
      return Number(localStorage.getItem("ekq-game-wins") ?? "0");
    } catch {
      return 0;
    }
  });
  const [listenTargetIndex, setListenTargetIndex] = useState(0);
  const [listenSelected, setListenSelected] = useState<number | null>(null);
  const [listenSolved, setListenSolved] = useState(false);
  const [listenRound, setListenRound] = useState(0);
  const [matchTargetIndex, setMatchTargetIndex] = useState(3);
  const [matchSelected, setMatchSelected] = useState<number | null>(null);
  const [matchSolved, setMatchSolved] = useState(false);
  const [matchRound, setMatchRound] = useState(0);
  const [sentencePuzzleIndex, setSentencePuzzleIndex] = useState(0);
  const [placedSentenceWords, setPlacedSentenceWords] = useState<string[]>([]);
  const [sentenceSolved, setSentenceSolved] = useState(false);
  const [sentenceRound, setSentenceRound] = useState(0);
  const [gameFeedback, setGameFeedback] = useState("");
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [celebrationAmount, setCelebrationAmount] = useState(0);
  const [wrongPulse, setWrongPulse] = useState(0);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState<boolean | null>(null);
  const [isChildSpeaking, setIsChildSpeaking] = useState(false);
  const [pronunciationFeedback, setPronunciationFeedback] = useState("");
  const [pronunciationHeard, setPronunciationHeard] = useState("");
  const [pronunciationPhase, setPronunciationPhase] = useState<PronunciationPhase>("ready");
  const [pronunciationAttempts, setPronunciationAttempts] = useState(0);
  const [hasHeardModel, setHasHeardModel] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const activeLetter = letters[activeLetterIndex];
  const filteredSentences = useMemo(() => {
    const query = sentenceSearch.trim().toLowerCase();
    return sentences.filter((sentence) => {
      const matchesCategory = sentenceCategory === "الكل" || sentence.category === sentenceCategory;
      const matchesQuery = !query || `${sentence.english} ${sentence.arabic}`.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [sentenceCategory, sentenceSearch]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredSentences.length / pageSize));
  const visibleSentences = filteredSentences.slice((sentencePage - 1) * pageSize, sentencePage * pageSize);
  const progressCount = completedLetters.size + completedSentences.size;
  const progress = Math.round((progressCount / (letters.length + sentences.length)) * 100);
  const stars = Math.min(99, completedLetters.size + completedSentences.size * 2 + gameStars);
  const quizOptions = useMemo(() => {
    const options = [activeLetter.word, letters[(activeLetterIndex + 3) % letters.length].word, letters[(activeLetterIndex + 8) % letters.length].word];
    return shuffleChoices(options);
  }, [activeLetter, activeLetterIndex, quizRound]);
  const listenOptions = useMemo(() => shuffleChoices([listenTargetIndex, (listenTargetIndex + 5) % letters.length, (listenTargetIndex + 11) % letters.length]), [listenTargetIndex, listenRound]);
  const matchOptions = useMemo(() => shuffleChoices([matchTargetIndex, (matchTargetIndex + 7) % letters.length, (matchTargetIndex + 14) % letters.length]), [matchTargetIndex, matchRound]);
  const activeSentencePuzzle = sentencePuzzles[sentencePuzzleIndex];
  const sentenceWordBank = useMemo(() => shuffleChoices(activeSentencePuzzle.words), [activeSentencePuzzle, sentenceRound]);

  useEffect(() => {
    localStorage.setItem("ekq-letters", JSON.stringify(Array.from(completedLetters)));
  }, [completedLetters]);

  useEffect(() => {
    localStorage.setItem("ekq-sentences", JSON.stringify(Array.from(completedSentences)));
  }, [completedSentences]);

  useEffect(() => {
    localStorage.setItem("ekq-game-stars", String(gameStars));
    localStorage.setItem("ekq-game-wins", String(gameWins));
  }, [gameStars, gameWins]);

  useEffect(() => {
    if (sentencePage > totalPages) setSentencePage(totalPages);
  }, [sentencePage, totalPages]);

  useEffect(() => () => {
    audioRef.current?.pause();
    recognitionRef.current?.abort();
    if (audioFrameRef.current !== null) window.cancelAnimationFrame(audioFrameRef.current);
  }, []);

  useEffect(() => {
    const browserWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    setSpeechRecognitionSupported(Boolean(browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition));
  }, []);

  const setModeAndScroll = (nextMode: Mode) => {
    setMode(nextMode);
    setMobileMenuOpen(false);
    window.setTimeout(() => document.getElementById("lesson")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };

  const playEmbeddedAudio = (cue: AudioCue | null) => {
    setSpeechNotice("");
    audioRef.current?.pause();
    if (audioFrameRef.current !== null) window.cancelAnimationFrame(audioFrameRef.current);
    if (navigator.vibrate) navigator.vibrate(8);
    if (!cue) {
      setSpeechNotice("ملف الصوت لهذا الدرس غير متاح حاليًا.");
      return;
    }

    const audio = new Audio(cue.src);
    audio.preload = "auto";
    audio.volume = 1;
    audioRef.current = audio;
    const stop = () => {
      if (audioFrameRef.current !== null) window.cancelAnimationFrame(audioFrameRef.current);
      audio.pause();
      setIsSpeaking(false);
      setSpeechNotice("");
    };
    const monitor = () => {
      if (audio.currentTime >= cue.end || audio.ended) {
        stop();
        return;
      }
      audioFrameRef.current = window.requestAnimationFrame(monitor);
    };
    audio.onplay = () => {
      setIsSpeaking(true);
      setSpeechNotice("جاري النطق بالإنجليزية...");
      audioFrameRef.current = window.requestAnimationFrame(monitor);
    };
    audio.onended = stop;
    audio.onerror = () => {
      setIsSpeaking(false);
      setSpeechNotice("تعذر تشغيل ملف الصوت. أعد تحميل الصفحة ثم حاول مرة أخرى.");
    };
    audio.currentTime = cue.start;
    audio.play().catch(() => {
      setIsSpeaking(false);
      setSpeechNotice("تعذر بدء الصوت. اضغط زر الاستماع مرة أخرى.");
    });
  };

  const toggleLetterComplete = (letter: string) => {
    setCompletedLetters((current) => {
      const next = new Set(current);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  };

  const toggleSentenceComplete = (id: number) => {
    setCompletedSentences((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectCategory = (category: SentenceCategory) => {
    setSentenceCategory(category);
    setSentencePage(1);
  };

  const selectLetter = (index: number) => {
    setActiveLetterIndex(index);
    setQuizAnswer(null);
    setQuizRound((current) => current + 1);
    setPronunciationFeedback("");
    setPronunciationHeard("");
    setPronunciationPhase("ready");
    setPronunciationAttempts(0);
    setHasHeardModel(false);
  };

  const playSuccessChime = () => {
    try {
      const context = new window.AudioContext();
      const now = context.currentTime;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.1);
        gain.gain.setValueAtTime(0.0001, now + index * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.13, now + index * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.34);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now + index * 0.1);
        oscillator.stop(now + index * 0.1 + 0.36);
      });
      window.setTimeout(() => context.close(), 720);
    } catch {
      // Audio is an optional enhancement; rewards remain fully usable if a browser blocks it.
    }
  };

  const giveReward = (amount: number, message: string) => {
    setGameStars((current) => current + amount);
    setGameWins((current) => current + 1);
    setGameFeedback(message);
    setCelebrationAmount(amount);
    setCelebrationKey(Date.now());
    playSuccessChime();
    if (navigator.vibrate) navigator.vibrate([18, 24, 42]);
  };

  const playPracticeModel = () => {
    setHasHeardModel(true);
    if (pronunciationPhase === "retry") setPronunciationFeedback("اسمع الكلمة مرة أخرى، ثم جرّبها ببطء.");
    playEmbeddedAudio(getEmbeddedAudioCue("word", activeLetterIndex));
  };

  const showPronunciationRetry = (message: string) => {
    const nextAttempt = pronunciationAttempts + 1;
    setPronunciationAttempts(nextAttempt);
    setPronunciationPhase("retry");
    setPronunciationFeedback(nextAttempt >= 2 ? `${message} لا بأس. اسمع الكلمة مرة أخرى ثم قلها بهدوء.` : `${message} اضغط «اسمع الكلمة» ثم حاول مرة أخرى.`);
  };

  const startPronunciationCheck = () => {
    const browserWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setPronunciationPhase("unavailable");
      setPronunciationFeedback("هذا التدريب يعمل في Chrome أو Edge على جهاز يدعم الميكروفون.");
      return;
    }
    audioRef.current?.pause();
    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onstart = () => {
      setIsChildSpeaking(true);
      setPronunciationPhase("listening");
      setPronunciationFeedback("قل الكلمة الآن بهدوء… نحن نستمع.");
      setPronunciationHeard("");
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      const heard = normalizeSpokenEnglish(transcript);
      const expected = normalizeSpokenEnglish(activeLetter.word);
      setPronunciationHeard(transcript);
      if (heard.includes(expected)) {
        giveReward(1, `أحسنت! سمعنا كلمة ${activeLetter.word} بوضوح.`);
        setPronunciationPhase("success");
        setPronunciationFeedback(`صح! أحسنت، قلت كلمة ${activeLetter.word} بشكل صحيح.`);
      } else {
        setWrongPulse(Date.now());
        showPronunciationRetry("حاول مرة أخرى.");
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setPronunciationPhase("unavailable");
        setPronunciationFeedback("اسمح للميكروفون من إعدادات المتصفح ثم جرّب.");
      } else if (event.error === "no-speech") {
        showPronunciationRetry("لم نسمع كلمة.");
      } else {
        showPronunciationRetry("تعذر التقاط الكلمة الآن.");
      }
    };
    recognition.onend = () => setIsChildSpeaking(false);
    try {
      recognition.start();
    } catch {
      setIsChildSpeaking(false);
      setPronunciationFeedback("أغلق التدريب السابق ثم حاول مرة أخرى.");
    }
  };

  const chooseListenLetter = (index: number) => {
    if (listenSolved) return;
    setListenSelected(index);
    if (index === listenTargetIndex) {
      setListenSolved(true);
      giveReward(2, "أحسنت! اصطدت الصوت الصحيح. حصلت على نجمتين.");
    } else {
      setWrongPulse(Date.now());
      setGameFeedback("قريب جدًا. اسمع الصوت مرة أخرى ثم جرّب.");
    }
  };

  const nextListenRound = () => {
    setListenTargetIndex((current) => (current + 3) % letters.length);
    setListenRound((current) => current + 1);
    setListenSelected(null);
    setListenSolved(false);
    setGameFeedback("");
  };

  const chooseMatchLetter = (index: number) => {
    if (matchSolved) return;
    setMatchSelected(index);
    if (index === matchTargetIndex) {
      setMatchSolved(true);
      giveReward(2, "ممتاز! وصلت الكلمة إلى بيت حرفها. نجمتان جديدتان لك.");
    } else {
      setWrongPulse(Date.now());
      setGameFeedback("هذه الكلمة لا تبدأ بهذا الحرف. انظر للكلمة مرة أخرى.");
    }
  };

  const nextMatchRound = () => {
    setMatchTargetIndex((current) => (current + 4) % letters.length);
    setMatchRound((current) => current + 1);
    setMatchSelected(null);
    setMatchSolved(false);
    setGameFeedback("");
  };

  const chooseSentenceWord = (word: string) => {
    if (sentenceSolved || placedSentenceWords.includes(word)) return;
    const next = [...placedSentenceWords, word];
    setPlacedSentenceWords(next);
    if (next.length === activeSentencePuzzle.words.length) {
      if (next.join(" ") === activeSentencePuzzle.words.join(" ")) {
        setSentenceSolved(true);
        giveReward(3, "ترتيب رائع! كوّنت الجملة الصحيحة وحصلت على 3 نجوم.");
      } else {
        setWrongPulse(Date.now());
        setGameFeedback("ترتيب لطيف، لكن لنبدّل أماكن الكلمات ونجرّب مجددًا.");
      }
    }
  };

  const resetSentenceRound = () => {
    setPlacedSentenceWords([]);
    setGameFeedback("");
  };

  const nextSentenceRound = () => {
    setSentencePuzzleIndex((current) => (current + 1) % sentencePuzzles.length);
    setSentenceRound((current) => current + 1);
    setPlacedSentenceWords([]);
    setSentenceSolved(false);
    setGameFeedback("");
  };

  return (
    <div className="quest-app" dir="rtl">
      <div className="paper-speckle" aria-hidden="true" />
      {celebrationKey > 0 && <div className="celebration-burst" key={celebrationKey} aria-hidden="true"><span className="reward-pop">+{celebrationAmount} ★</span>{Array.from({ length: 18 }).map((_, index) => <i key={index} />)}</div>}
      <header className="topbar container">
        <a className="brand" href="#top" aria-label="English Kids Quest">
          <span className="brand-mark"><img src={logoImage} alt="" /><span className="brand-soundlines" aria-hidden="true"><i /><i /><i /></span></span>
          <span className="brand-copy">
            <strong>English Kids Quest</strong>
            <small>نتعلّمها باللعب</small>
          </span>
        </a>

        <nav className={cn("topnav", mobileMenuOpen && "is-open")} aria-label="التنقل الرئيسي">
          <button className={cn(mode === "letters" && "active")} onClick={() => setModeAndScroll("letters")}>
            <BookOpen size={16} /> الحروف
          </button>
          <button className={cn(mode === "sentences" && "active")} onClick={() => setModeAndScroll("sentences")}>
            <ListChecks size={16} /> الجمل الأساسية
          </button>
          <button onClick={() => { setMobileMenuOpen(false); document.getElementById("games")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            <Gamepad2 size={16} /> الألعاب
          </button>
        </nav>

        <div className="topbar-actions">
          <div className="mini-stat streak" title="أيام التعلّم المتتالية">
            <Flame size={17} />
            <span><b>3</b><small>أيام</small></span>
          </div>
          <div className={cn("mini-stat stars", celebrationKey > 0 && "rewarding")} title="النجوم المكتسبة">
            <Star size={17} fill="currentColor" />
            <span><b key={celebrationKey}>{stars}</b><small>نجمة</small></span>
          </div>
          <button className="mobile-menu" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="فتح القائمة">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero container">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> مغامرة نطق صغيرة كل يوم</p>
            <h1>كل حرف له صوت.<br /><em>اكتشفه باللعب.</em></h1>
            <p className="hero-description">تعلّم الحروف الإنجليزية و50 جملة نستخدمها كل يوم، خطوة صغيرة بصوت واضح وتشجيع كبير.</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => setModeAndScroll("letters")}>
                ابدأ من هنا <ArrowLeft size={18} />
              </button>
              <span className="hero-note"><Sparkles size={16} /> مناسبة لعمر 5–9 سنوات</span>
            </div>
            <div className="hero-proof">
              <div className="proof-avatars">
                <span className="avatar avatar-one">A</span>
                <span className="avatar avatar-two">ب</span>
                <span className="avatar avatar-three">★</span>
              </div>
              <span>تعلم قصير. أثر كبير.</span>
            </div>
          </div>
          <div className="hero-art" aria-label="رسم توضيحي لدفتر الحروف">
            <div className="hero-art-tag"><span>مهمّة اليوم</span><strong>حرف {letters[activeLetterIndex].letter}</strong></div>
            <img src={heroImage} alt="دفتر ملوّن مع حروف إنجليزية وشخصية ورقة لطيفة" />
            <div className="hero-sticker sticker-one">اسمع<br />وكرّر</div>
            <div className="hero-sticker sticker-two"><Star size={14} fill="currentColor" /> +1</div>
          </div>
        </section>

        <section className="workspace container" id="lesson">
          <aside className="journey-rail">
            <div className="rail-heading">
              <span className="rail-kicker">مساري اليوم</span>
              <h2>خريطة الرحلة</h2>
            </div>
            <div className="journey-steps">
              <div className={cn("journey-step", mode === "letters" && "current", completedLetters.size > 0 && "done")}>
                <span className="step-icon"><span>01</span></span>
                <div><b>صوت الحرف</b><small>اسمع وكرّر</small></div>
                {completedLetters.size > 0 && <Check size={16} className="step-check" />}
              </div>
              <div className="journey-connector" />
              <div className={cn("journey-step", mode === "sentences" && "current", completedSentences.size > 0 && "done")}>
                <span className="step-icon"><span>02</span></span>
                <div><b>جملة اليوم</b><small>استخدمها بثقة</small></div>
                {completedSentences.size > 0 && <Check size={16} className="step-check" />}
              </div>
              <div className="journey-connector" />
              <button className="journey-step game-ready" onClick={() => document.getElementById("games")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <span className="step-icon"><Gamepad2 size={15} /></span>
                <span className="journey-step-copy"><b>ألعاب المكافآت</b><small>{gameWins} جولات مكتملة</small></span>
                <Star size={15} className="step-check" fill="currentColor" />
              </button>
            </div>
            <div className="progress-card">
              <div className="progress-card-top"><span>تقدّمك الكلّي</span><b>{progress}%</b></div>
              <div className="progress-track"><span style={{ width: `${Math.max(progress, 3)}%` }} /></div>
              <p>{progressCount} من {letters.length + sentences.length} درسًا مكتملًا</p>
            </div>
            <div className="rail-tip">
              <img src={mascotImage} alt="" />
              <div><b>نصيحة علوز</b><p>اسمع الكلمة مرتين، ثم قلها بصوتك.</p></div>
            </div>
          </aside>

          <div className="lesson-space">
            <div className="lesson-heading">
              <div>
                <span className="section-number">01 / 02</span>
                <h2>{mode === "letters" ? "حديقة الحروف" : "دفتر الجمل"}</h2>
                <p>{mode === "letters" ? "اختَر حرفًا، استمع لاسمه، ثم جرّب كلمة تبدأ به." : "50 جملة صغيرة تساعدك على الكلام في البيت واللعب والمدرسة."}</p>
              </div>
              <div className="mode-switcher" role="tablist" aria-label="اختيار نوع الدرس">
                <button className={cn(mode === "letters" && "selected")} onClick={() => setMode("letters")} role="tab" aria-selected={mode === "letters"}><BookOpen size={16} /> الحروف <span>26</span></button>
                <button className={cn(mode === "sentences" && "selected")} onClick={() => setMode("sentences")} role="tab" aria-selected={mode === "sentences"}><ListChecks size={16} /> الجمل <span>50</span></button>
              </div>
            </div>

            <div className="speech-status" aria-live="polite">{speechNotice}</div>

            {mode === "letters" ? (
              <>
                <div className="letter-map" aria-label="اختيار حرف للتعلّم">
                  {letters.map((item, index) => (
                    <button key={item.letter} className={cn("letter-tile", `tile-${(index % 6) + 1}`, activeLetterIndex === index && "selected", completedLetters.has(item.letter) && "completed")} onClick={() => selectLetter(index)} aria-label={`حرف ${item.letter}`}>
                      <span className="tile-letter">{item.letter}</span>
                      <span className="tile-lower">{item.lower}</span>
                      {completedLetters.has(item.letter) && <span className="tile-check"><Check size={11} /></span>}
                    </button>
                  ))}
                </div>

                <div className="letter-lesson-card">
                  <div className="letter-visual">
                    <div className="letter-cutout"><span>{activeLetter.letter}</span><small>{activeLetter.lower}</small></div>
                    <div className="letter-scribble">{activeLetter.ipa}</div>
                    <div className="paper-star star-a"><Star size={16} fill="currentColor" /></div>
                    <div className="paper-star star-b"><Star size={11} fill="currentColor" /></div>
                  </div>
                  <div className="letter-detail">
                    <div className="detail-label"><span>اسم الحرف</span><span className="ipa-chip">{activeLetter.ipa}</span></div>
                    <h3>{activeLetter.letter} <span>مثل</span> <strong>{activeLetter.word}</strong></h3>
                    <p className="word-translation">{activeLetter.wordAr} <span>·</span> النطق التقريبي: <b>{activeLetter.hint}</b></p>
                    <div className="sound-actions">
                      <button className={cn("sound-button", isSpeaking && "speaking")} onClick={() => playEmbeddedAudio(getEmbeddedAudioCue("letter", activeLetterIndex))}><Volume2 size={19} /> اسمع الحرف <span>{activeLetter.sound}</span></button>
                      <button className="word-sound" onClick={() => playEmbeddedAudio(getEmbeddedAudioCue("word", activeLetterIndex))}><Headphones size={17} /> اسمع الكلمة</button>
                    </div>
                    <div className="repeat-line"><span className="repeat-dots"><i /><i /><i /></span><span>جرّب أن تقولها: <b>{activeLetter.letter} — {activeLetter.word}</b></span></div>
                    <div className={cn("pronunciation-card", `phase-${pronunciationPhase}`)}>
                      <div className="pronunciation-copy"><span className="mic-sticker"><Mic size={15} /></span><div><b>قلها وخلّيني أصحح لك</b><small>اسمع كلمة <em lang="en">{activeLetter.word}</em>، ثم قلها في الميكروفون</small></div></div>
                      <div className="direct-pronunciation-flow"><span className={cn(hasHeardModel && "done")}><i>1</i><Volume2 size={13} /> اسمع الكلمة</span><span className={cn(isChildSpeaking && "current")}><i>2</i><Mic size={13} /> قلها</span></div>
                      {speechRecognitionSupported ? <div className="pronunciation-actions"><button className="hear-model-button" onClick={playPracticeModel}><Volume2 size={15} /> اسمع الكلمة</button><button className={cn("pronunciation-button", isChildSpeaking && "listening")} onClick={startPronunciationCheck} disabled={isChildSpeaking}><Mic size={16} /> {isChildSpeaking ? "نستمع…" : "قلها الآن"}</button></div> : <span className="speech-support-note">{speechRecognitionSupported === null ? "تجهيز الميكروفون…" : "متاح في Chrome وEdge"}</span>}
                      {pronunciationPhase === "success" && <div className="pronunciation-result correct"><Check size={18} /><div><b>صح! أحسنت</b><span>نطقت <em lang="en">{activeLetter.word}</em> بشكل صحيح</span></div></div>}
                      {pronunciationPhase === "retry" && <div className="pronunciation-result retry"><X size={18} /><div><b>حاول مرة أخرى</b><span>اسمع الكلمة ثم قلها ببطء</span></div></div>}
                      {pronunciationPhase === "retry" && <div className="pronunciation-hint"><span className="hint-letter" lang="en">{activeLetter.letter}</span><div><b>تلميح</b><p>الكلمة هي: <strong lang="en">{activeLetter.word}</strong></p><small>ابدأ بصوت <em>{activeLetter.hint}</em>.</small></div></div>}
                      {pronunciationFeedback && pronunciationPhase === "unavailable" && <p className="pronunciation-feedback">{pronunciationFeedback}</p>}
                      {pronunciationAttempts > 0 && pronunciationPhase === "retry" && <span className="attempt-badge">محاولة {pronunciationAttempts} · أنت تتعلم بشكل ممتاز</span>}
                      <p className="mic-privacy">اطلب مساعدة ولي الأمر. اللعبة لا تحفظ تسجيلًا صوتيًا.</p>
                    </div>
                    <button className={cn("complete-button", completedLetters.has(activeLetter.letter) && "is-done")} onClick={() => toggleLetterComplete(activeLetter.letter)}>
                      {completedLetters.has(activeLetter.letter) ? <><Check size={17} /> تمّت المراجعة</> : <>حفظت هذا الحرف <Bookmark size={17} /></>}
                    </button>
                  </div>
                </div>

                <div className="practice-row">
                  <div className="practice-card quiz-card">
                    <div className="card-heading"><span className="tiny-icon coral"><CircleHelp size={17} /></span><div><span className="card-eyebrow">اختبر أذنك</span><h3>أي كلمة تبدأ بحرف {activeLetter.letter}؟</h3></div></div>
                    <p className="quiz-prompt">استمع للحرف أولًا، ثم اختر الإجابة.</p>
                    <button className="small-listen" onClick={() => playEmbeddedAudio(getEmbeddedAudioCue("letter", activeLetterIndex))}><Play size={13} fill="currentColor" /> استمع</button>
                    <div className="quiz-options">
                      {quizOptions.map((option) => {
                        const isSelected = quizAnswer === option;
                        const isCorrect = isSelected && option === activeLetter.word;
                        const isWrong = isSelected && option !== activeLetter.word;
                        return <button key={option} className={cn("quiz-option", isCorrect && "correct", isWrong && "wrong")} onClick={() => setQuizAnswer(option)}>{option}<span>{isCorrect ? <Check size={14} /> : isWrong ? <X size={14} /> : <ArrowLeft size={13} />}</span></button>;
                      })}
                    </div>
                    <div className="quiz-feedback" aria-live="polite">{quizAnswer === activeLetter.word ? "أحسنت! أذنك التقطت الصوت." : quizAnswer ? "قريب جدًا، اسمع مرة أخرى وجرّب." : ""}</div>
                  </div>
                  <div className="practice-card scene-card">
                    <img src={lettersImage} alt="قصاصات ورقية ملوّنة للحروف" />
                    <div className="scene-overlay"><span>مشهد الحرف</span><b>{activeLetter.word}</b></div>
                  </div>
                </div>
              </>
            ) : (
              <div className="sentences-section">
                <div className="sentences-intro">
                  <div className="sentences-art"><img src={sentencesImage} alt="شخصيات ورقية تتحدث" /><span className="art-label">اسمع، افهم، تكلّم</span></div>
                  <div className="sentences-copy"><span className="paper-label">50 جملة في جيبك</span><h3>جملة صغيرة، <em>محادثة أكبر.</em></h3><p>اضغط على السماعة لسماع النطق، ثم اضغط على الإشارة المرجعية لتتذكر أنك تدربت عليها.</p></div>
                  <div className="sentence-counter"><b>{completedSentences.size}</b><span>من 50<br />مكتملة</span></div>
                </div>
                <div className="sentence-toolbar">
                  <div className="category-tabs" role="tablist" aria-label="تصنيف الجمل">
                    {categories.map((category) => <button key={category} className={cn(sentenceCategory === category && "active")} onClick={() => selectCategory(category)}>{category}</button>)}
                  </div>
                  <label className="sentence-search"><Search size={16} /><input value={sentenceSearch} onChange={(event) => { setSentenceSearch(event.target.value); setSentencePage(1); }} placeholder="ابحث عن جملة..." aria-label="البحث في الجمل" /></label>
                </div>
                <div className="sentences-grid">
                  {visibleSentences.map((sentence) => {
                    const isDone = completedSentences.has(sentence.id);
                    return <article className={cn("sentence-card", isDone && "is-done")} key={sentence.id}>
                      <div className="sentence-top"><span className="sentence-number">{String(sentence.id).padStart(2, "0")}</span><span className="sentence-category">{sentence.category}</span></div>
                      <p className="sentence-english" lang="en">{sentence.english}</p>
                      <p className="sentence-arabic">{sentence.arabic}</p>
                      <div className="sentence-actions"><button className={cn("sentence-play", isSpeaking && "speaking")} onClick={() => playEmbeddedAudio(getEmbeddedAudioCue("sentence", sentence.id - 1))} aria-label={`استمع إلى ${sentence.english}`}><Volume2 size={17} /> اسمع</button><button className={cn("bookmark-button", isDone && "saved")} onClick={() => toggleSentenceComplete(sentence.id)} aria-label={isDone ? "إلغاء حفظ الجملة" : "حفظ الجملة"}>{isDone ? <Check size={17} /> : <Bookmark size={17} />}</button></div>
                    </article>;
                  })}
                </div>
                {visibleSentences.length === 0 && <div className="empty-state"><Leaf size={26} /><h3>لم نجد هذه الجملة</h3><p>جرّب كلمة أخرى، أو اختر تصنيف «الكل».</p></div>}
                <div className="pagination">
                  <span>صفحة {sentencePage} من {totalPages}</span>
                  <div><button onClick={() => setSentencePage((page) => Math.max(1, page - 1))} disabled={sentencePage === 1} aria-label="الصفحة السابقة"><ChevronRight size={17} /></button><button onClick={() => setSentencePage((page) => Math.min(totalPages, page + 1))} disabled={sentencePage === totalPages} aria-label="الصفحة التالية"><ChevronLeft size={17} /></button></div>
                </div>
              </div>
            )}

            <section className="game-zone" id="games">
              <div className="game-zone-heading">
                <div><span className="section-number">03 / ألعاب قصيرة</span><h2>ساحة علوز للعب</h2><p>3 ألعاب صغيرة تجعل الحرف والكلمة والجملة جزءًا من مغامرة سريعة.</p></div>
                <div className={cn("game-score", celebrationKey > 0 && "rewarding")}><Trophy size={18} /><span><b key={celebrationKey}>{gameStars}</b><small>نجمة من الألعاب</small></span></div>
              </div>
              <div className="game-tabs" role="tablist" aria-label="اختيار لعبة">
                <button className={cn(activeGame === "listen" && "active")} onClick={() => { setActiveGame("listen"); setGameFeedback(""); }}><span className="game-tab-number">01</span><span><b>اسمع واصطد</b><small>التقط الحرف الصحيح</small></span></button>
                <button className={cn(activeGame === "match" && "active")} onClick={() => { setActiveGame("match"); setGameFeedback(""); }}><span className="game-tab-number">02</span><span><b>بيت الكلمة</b><small>طابقها مع حرفها</small></span></button>
                <button className={cn(activeGame === "sentence" && "active")} onClick={() => { setActiveGame("sentence"); setGameFeedback(""); }}><span className="game-tab-number">03</span><span><b>رتّب الحكاية</b><small>كوّن جملة إنجليزية</small></span></button>
              </div>

              <div className={cn("game-board", wrongPulse > 0 && "wrong-answer")} key={`game-board-${activeGame}-${wrongPulse}`}>
                <div className="game-board-copy">
                  <span className="game-round-label">جولة سريعة <i /> + نجوم</span>
                  {activeGame === "listen" && <>
                    <h3>اسمع الصوت ثم <em>اصطد الحرف.</em></h3>
                    <p>اضغط السماعة، ثم اختر الفقاعة التي تحمل الحرف الذي سمعته.</p>
                    <button className={cn("game-listen-button", isSpeaking && "speaking")} onClick={() => playEmbeddedAudio(getEmbeddedAudioCue("letter", listenTargetIndex))}><Volume2 size={20} /> اسمع الصوت</button>
                  </>}
                  {activeGame === "match" && <>
                    <h3>خذ الكلمة إلى <em>بيت حرفها.</em></h3>
                    <p>انظر إلى الكلمة، أو استمع إليها، ثم اختر الحرف الأول الصحيح.</p>
                    <button className="game-listen-button" onClick={() => playEmbeddedAudio(getEmbeddedAudioCue("word", matchTargetIndex))}><Headphones size={20} /> اسمع الكلمة</button>
                  </>}
                  {activeGame === "sentence" && <>
                    <h3>رتّب الكلمات لتصنع <em>جملة صغيرة.</em></h3>
                    <p>ابدأ من اليمين، واضغط الكلمات بالترتيب الذي يجعل المعنى صحيحًا.</p>
                    <button className="game-listen-button" onClick={() => playEmbeddedAudio(getEmbeddedAudioCue("sentence", activeSentencePuzzle.sentenceIndex))}><Volume2 size={20} /> اسمع الجملة</button>
                  </>}
                </div>
                <div className={cn("game-play-area", `game-${activeGame}`)}>
                  {activeGame === "listen" && <>
                    <div className="catch-cloud"><span>مستعد؟</span><b>أي حرف سمعت؟</b></div>
                    <div className="catch-options">{listenOptions.map((index, optionIndex) => <button key={letters[index].letter} className={cn("catch-bubble", `bubble-${optionIndex + 1}`, listenSelected === index && index === listenTargetIndex && "correct", listenSelected === index && index !== listenTargetIndex && "wrong")} onClick={() => chooseListenLetter(index)}>{letters[index].letter}<small>{letters[index].lower}</small></button>)}</div>
                    {listenSolved && <button className="next-game-button" onClick={nextListenRound}>مهمة صوتية جديدة <ArrowLeft size={16} /></button>}
                  </>}
                  {activeGame === "match" && <>
                    <div className="word-ticket"><span>الكلمة الضائعة</span><b>{letters[matchTargetIndex].word}</b><small>{letters[matchTargetIndex].wordAr}</small></div>
                    <div className="home-options">{matchOptions.map((index) => <button key={letters[index].letter} className={cn("letter-home", matchSelected === index && index === matchTargetIndex && "correct", matchSelected === index && index !== matchTargetIndex && "wrong")} onClick={() => chooseMatchLetter(index)}><span>بيت</span><b>{letters[index].letter}</b></button>)}</div>
                    {matchSolved && <button className="next-game-button" onClick={nextMatchRound}>كلمة جديدة <ArrowLeft size={16} /></button>}
                  </>}
                  {activeGame === "sentence" && <>
                    <div className="sentence-clue"><span>المعنى بالعربية</span><b>{activeSentencePuzzle.arabic}</b></div>
                    <div className="sentence-build-zone">{placedSentenceWords.length ? placedSentenceWords.map((word, index) => <span key={`${word}-${index}`} className="built-word">{word}</span>) : <span className="build-placeholder">اضغط الكلمات بالترتيب هنا</span>}</div>
                    <div className="word-bank">{sentenceWordBank.map((word) => <button key={word} className={cn(placedSentenceWords.includes(word) && "used")} onClick={() => chooseSentenceWord(word)}>{word}</button>)}</div>
                    {!sentenceSolved && placedSentenceWords.length > 0 && <button className="reset-words" onClick={resetSentenceRound}><RotateCcw size={14} /> أفرغ السطر</button>}
                    {sentenceSolved && <button className="next-game-button" onClick={nextSentenceRound}>جملة جديدة <ArrowLeft size={16} /></button>}
                  </>}
                </div>
                <div className={cn("game-feedback", gameFeedback && "show")} aria-live="polite"><Sparkles size={15} /> {gameFeedback}</div>
              </div>
            </section>

            <div className="lesson-footer"><span><Sparkles size={15} /> التعلّم بالتكرار يصنع الفرق</span><button onClick={() => { setActiveLetterIndex(0); setQuizAnswer(null); setSentenceCategory("الكل"); setSentenceSearch(""); setSentencePage(1); }}>ابدأ من البداية <RotateCcw size={14} /></button></div>
          </div>
        </section>
      </main>
      <footer className="footer container"><span>صُمّم بحبّ للعقول الصغيرة.</span><span>English Kids Quest <span className="footer-dot">·</span> رحلة اليوم تبدأ بحرف</span></footer>
    </div>
  );
}
