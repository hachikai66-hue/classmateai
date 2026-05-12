// === class.js (授業画面用ロジック) ===

// 状態管理（localStorageから復元）
const state = {
    apiKey: localStorage.getItem('apiKey'),
    lessonName: localStorage.getItem('lessonName') || '未設定',
    moralValue: localStorage.getItem('moralValue') || '未設定',
    grade: localStorage.getItem('grade') || '高学年',
    gender: localStorage.getItem('gender') || '中性的',
    pitch: parseFloat(localStorage.getItem('pitch')) || 1.0,
    speed: parseFloat(localStorage.getItem('speed')) || 1.0,
    avatarUrl: localStorage.getItem('avatarUrl') || 'neutral_mid.png',
    context: [],
    predictions: { perspective: '', challenge: '' },
    isListening: false,
    isQuestionMode: false,
    selectedAction: null,
    lastPredictionContextLength: 0
};

// APIキーがなければ設定画面に戻す
if (!state.apiKey) {
    window.location.href = 'index.html';
}

const els = {
    transcriptBox: document.getElementById('transcript-box'),
    atmosphereText: document.getElementById('atmosphere-text'),
    avatarImg: document.getElementById('avatar-img'),
    avatarRing: document.querySelector('.avatar-ring'),
    statusBadge: document.getElementById('ai-status-badge'),
    actionBtns: document.querySelectorAll('.action-btn'),
    previewBox: document.getElementById('preview-box'),
    playBtn: document.getElementById('play-btn'),
    stopBtn: document.getElementById('stop-btn'),
    toast: document.getElementById('toast'),
    settingsBtn: document.getElementById('settings-btn'),
    questionInput: document.getElementById('question-input'),
    voiceQuestionBtn: document.getElementById('voice-question-btn'),
    sendQuestionBtn: document.getElementById('send-question-btn'),
    voiceFeedback: document.getElementById('voice-feedback')
};

// アバター画像の設定
els.avatarImg.src = state.avatarUrl;

// === 音声認識 (Web Speech API) ===
let recognition = null;
let micStream = null; // マイクを「掴み続ける」ためのストリーム

// マイク接続を維持する関数
async function keepMicAlive() {
    try {
        // 音声認識とは別に、マイクのストリームを取得して維持する
        // これにより、ブラウザが「マイク使用中」と認識し、再起動時の許可をスキップしやすくなる
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        console.error("Microphone persistence failed:", e);
    }
}
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscript) {
            if (state.isQuestionMode) {
                // 質問モード中の場合は質問として処理
                state.isQuestionMode = false;
                els.voiceQuestionBtn.classList.remove('listening');
                els.voiceFeedback.classList.remove('active');
                handleStudentQuestion(finalTranscript);
            } else {
                // 通常モードの場合はクラスの議論として処理
                addTranscriptLine(finalTranscript, 'student');
                state.context.push(finalTranscript);
                schedulePrediction();
            }
        }
    };

    recognition.onend = () => {
        // 許可を維持するため、意図的な停止以外は再開
        if (state.isListening) {
            try {
                recognition.start();
            } catch (e) {
                console.error("Recognition restart failed:", e);
            }
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        if (event.error === 'not-allowed') {
            showToast('マイクの使用が許可されていません。ブラウザの設定を確認してください。');
            state.isListening = false;
        }
    };
}

// === イベントリスナー ===
els.settingsBtn.addEventListener('click', () => {
    state.isListening = false;
    if (recognition) recognition.stop();
    window.location.href = 'index.html';
});

els.actionBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        els.actionBtns.forEach(b => b.style.opacity = '0.5');
        const target = e.currentTarget;
        target.style.opacity = '1';
        
        state.selectedAction = target.dataset.type;
        
        if (state.predictions[state.selectedAction]) {
            els.previewBox.textContent = state.predictions[state.selectedAction];
            els.previewBox.style.color = '#f8fafc';
            els.playBtn.disabled = false;
        } else {
            els.previewBox.textContent = '現在、AIが思考中です... もう少し会話が進むのをお待ちください。';
            els.previewBox.style.color = '#94a3b8';
            els.playBtn.disabled = true;
        }
    });
});

els.playBtn.addEventListener('click', () => {
    if (!state.selectedAction || !state.predictions[state.selectedAction]) return;
    speakText(state.predictions[state.selectedAction]);
});

els.stopBtn.addEventListener('click', () => {
    window.speechSynthesis.cancel();
    resetAIStatus();
});

// === 子どもたちの質問関連のイベント ===
els.sendQuestionBtn.addEventListener('click', () => {
    const question = els.questionInput.value.trim();
    if (question) {
        handleStudentQuestion(question);
    }
});

els.questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const question = els.questionInput.value.trim();
        if (question) {
            handleStudentQuestion(question);
        }
    }
});

els.voiceQuestionBtn.addEventListener('click', () => {
    if (!recognition) return;
    
    if (state.isQuestionMode) {
        state.isQuestionMode = false;
        els.voiceQuestionBtn.classList.remove('listening');
        els.voiceFeedback.classList.remove('active');
    } else {
        state.isQuestionMode = true;
        els.voiceQuestionBtn.classList.add('listening');
        els.voiceFeedback.classList.add('active');
        showToast('AIに話しかけてね');
    }
});

async function handleStudentQuestion(question) {
    els.questionInput.value = '';
    addTranscriptLine(`しつもん：${question}`, 'student');
    state.context.push(`児童からの質問: ${question}`);
    
    updateAIStatus('質問を考えています...', true);
    
    const systemPrompt = `
あなたは、小中学校の道徳の授業に参加する「AIクラスメート」です。
現在、クラスの友達（児童）から直接あなたに質問が届きました。

【設定パラメーター】
- 教材名: ${state.lessonName}
- 内容項目: ${state.moralValue}
- 学年: ${state.grade}
- キャラクター: ${state.gender}

【質問内容】
"${question}"

【ルール】
1. 質問に対して、指定された学年・性別に合った、親しみやすいアニメ風キャラクターで答えてください。
2. 絶対に「正解」を教えないでください。一緒に考える姿勢を見せてください。
3. 「その質問、すごく大事だね！」「ぼくも/わたしも迷ってたんだ」といった共感から入ってください。
4. 短く、2〜3文で答えてください。
5. 最後は「どう思う？」や「みんなはどうかな？」と問いかけて、議論を戻してください。
`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 200
                }
            })
        });

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        
        speakText(responseText);
        
    } catch (error) {
        console.error('Question Response Error:', error);
        updateAIStatus('待機中');
        showToast('ごめんね、うまく考えられなかったよ。');
    }
}

// === UI更新関数 ===
function addTranscriptLine(text, speaker) {
    const div = document.createElement('div');
    div.className = `transcript-line ${speaker}`;
    div.textContent = text;
    els.transcriptBox.appendChild(div);
    els.transcriptBox.scrollTop = els.transcriptBox.scrollHeight;
}

function updateAIStatus(status, isActive = false) {
    els.statusBadge.textContent = status;
    if (isActive) {
        els.avatarRing.classList.add('active');
        els.statusBadge.style.backgroundColor = '#ec4899';
    } else {
        els.avatarRing.classList.remove('active');
        els.statusBadge.style.backgroundColor = '#6366f1';
    }
}

function resetAIStatus() {
    updateAIStatus('待機中');
    els.playBtn.disabled = false;
    els.stopBtn.disabled = true;
}

function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 3000);
}

// === Gemini API 連携 (予測生成) ===
let predictionTimer = null;
function schedulePrediction() {
    if (predictionTimer) clearTimeout(predictionTimer);
    predictionTimer = setTimeout(generatePredictions, 3000);
}

async function generatePredictions() {
    if (state.context.length === state.lastPredictionContextLength && state.context.length > 0) return;
    
    updateAIStatus('思考予測中...', true);
    
    const contextText = state.context.length > 0 
        ? state.context.slice(-5).join('\n') 
        : '（まだクラスの会話は始まっていません）';

    const systemPrompt = `
あなたは、小中学校の道徳の授業に参加する「AIクラスメート」です。
役割: 共に悩み、考え、議論を活性化させる一人の児童・生徒として振る舞います。正解を教えるのではなく、クラスの思考の深まりをサポートします。

【設定パラメーター】
- 教材名: ${state.lessonName}
- 内容項目: ${state.moralValue}
- 学年: ${state.grade}
- キャラクター: ${state.gender}

【ルール】
1. 直前の文脈（今のクラスの雰囲気や誰かの発言）を汲み取った枕詞を使用してください。
2. 語尾や口調は指定された学年・性別に合った、親しみやすいアニメ風キャラクターにしてください。
3. 絶対に「正解」や「まとめ」を言わないでください。

【現在の教室の会話文脈（直近）】
${contextText}

以下の2つのアプローチで、次にあなたが発言すべき内容をそれぞれ2〜3文で考えてください。
必ず以下のJSON形式のみを出力してください（Markdownのバッククォート等は不要です）。
{
  "perspective": "（新しい・別の視点からの発言案：考えの多面化・多角化を促進し、物事を多方向から見るきっかけを作る内容）",
  "challenge": "（考えをゆさぶる発言案：あえて今のクラスの主流とは異なる立場の意見や、もしもの極限状態を提示して考えを深めさせる内容）",
  "atmosphere": "（現在のクラスの雰囲気の分析結果を1文で）"
}
`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        
        const parsed = JSON.parse(responseText);
        
        state.predictions = {
            perspective: parsed.perspective,
            challenge: parsed.challenge
        };
        
        state.lastPredictionContextLength = state.context.length;
        
        if (parsed.atmosphere) els.atmosphereText.textContent = parsed.atmosphere;

        updateAIStatus('準備完了');
        showToast('AIの発言候補が更新されました');

        if (state.selectedAction) {
            els.previewBox.textContent = state.predictions[state.selectedAction];
            els.previewBox.style.color = '#f8fafc';
            els.playBtn.disabled = false;
        }

    } catch (error) {
        console.error('Prediction Generation Error:', error);
        updateAIStatus('待機中');
    }
}

// === 音声合成 ===
function speakText(text) {
    if (!('speechSynthesis' in window)) return;

    addTranscriptLine(text, 'ai');
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.pitch = state.pitch;
    utterance.rate = state.speed;

    const voices = window.speechSynthesis.getVoices();
    const jaVoices = voices.filter(v => v.lang.includes('ja'));
    if (jaVoices.length > 0) utterance.voice = jaVoices[0];

    utterance.onstart = () => {
        updateAIStatus('発話中...', true);
        els.playBtn.disabled = true;
        els.stopBtn.disabled = false;
    };

    utterance.onend = () => {
        resetAIStatus();
        state.context.push(text);
        schedulePrediction();
    };

    utterance.onerror = (e) => {
        console.error('Speech synthesis error', e);
        resetAIStatus();
    };

    window.speechSynthesis.speak(utterance);
}

if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// === 初期起動処理 ===
window.addEventListener('DOMContentLoaded', () => {
    // 最初の予測を走らせる
    generatePredictions();
    
    const isLocalFile = window.location.protocol === 'file:';
    const protocolWarning = isLocalFile ? `
        <p style="margin-top: 15px; color: #fbbf24; font-size: 13px; text-align: center; max-width: 400px;">
            <i class="fa-solid fa-triangle-exclamation"></i> 現在ファイルを直接開いています。<br>
            Chromeの仕様上、ファイルを直接開くとマイクの許可が毎回求められます。<br>
            <strong>対策:</strong> ローカルサーバー（VSCodeのLive Server等）を使用するか、HTTPSで公開して利用してください。
        </p>
    ` : '';

    overlay.innerHTML = `
        <h2 style="margin-bottom: 20px; color: white;">授業を開始しますか？</h2>
        <button id="start-session-btn" class="primary-btn" style="padding: 20px 40px; font-size: 20px;">
            <i class="fa-solid fa-play"></i> 授業をはじめる（マイクをONにする）
        </button>
        <p style="margin-top: 20px; color: #94a3b8; font-size: 14px;">※クリックするとマイクの許可が求められます。一度「許可」すると維持されます。</p>
        ${protocolWarning}
    `;
    document.body.appendChild(overlay);

    document.getElementById('start-session-btn').addEventListener('click', async () => {
        document.body.removeChild(overlay);
        
        // 1. まずマイクストリームを維持（許可を確定させる）
        await keepMicAlive();
        
        // 2. 音声認識を開始
        if (recognition) {
            state.isListening = true;
            recognition.start();
            showToast('音声認識を開始しました');
        }
    });
});
