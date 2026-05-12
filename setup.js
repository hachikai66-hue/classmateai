// === setup.js (設定画面用ロジック) ===

const els = {
    setupAvatarImg: document.getElementById('setup-avatar-img'),
    gradeSelect: document.getElementById('grade-level'),
    genderSelect: document.getElementById('gender'),
    pitchInput: document.getElementById('voice-pitch'),
    speedInput: document.getElementById('voice-speed'),
    pitchVal: document.getElementById('pitch-val'),
    speedVal: document.getElementById('speed-val'),
    testVoiceBtn: document.getElementById('test-voice-btn'),
    startBtn: document.getElementById('start-btn'),
    apiKeyInput: document.getElementById('api-key'),
    lessonNameInput: document.getElementById('lesson-name'),
    moralValueInput: document.getElementById('moral-value')
};

// 過去の設定があれば復元
if (localStorage.getItem('apiKey')) els.apiKeyInput.value = localStorage.getItem('apiKey');
if (localStorage.getItem('lessonName')) els.lessonNameInput.value = localStorage.getItem('lessonName');
if (localStorage.getItem('moralValue')) els.moralValueInput.value = localStorage.getItem('moralValue');
if (localStorage.getItem('grade')) els.gradeSelect.value = localStorage.getItem('grade');
if (localStorage.getItem('gender')) els.genderSelect.value = localStorage.getItem('gender');
if (localStorage.getItem('pitch')) els.pitchInput.value = localStorage.getItem('pitch');
if (localStorage.getItem('speed')) els.speedInput.value = localStorage.getItem('speed');

function updateAvatarPreview() {
    const grade = els.gradeSelect.value;
    const genderStr = els.genderSelect.value;
    
    let genderKey = 'neutral';
    if (genderStr === '男子') genderKey = 'boy';
    else if (genderStr === '女子') genderKey = 'girl';
    
    let gradeKey = 'elem';
    if (grade === '高学年' || grade === '中学生') {
        gradeKey = 'mid';
    }
    
    const avatarUrl = `${genderKey}_${gradeKey}.png`;
    els.setupAvatarImg.src = avatarUrl;
    
    // プレビュー表示されたURLを保存しておく
    localStorage.setItem('avatarUrl', avatarUrl);
}

els.gradeSelect.addEventListener('change', updateAvatarPreview);
els.genderSelect.addEventListener('change', updateAvatarPreview);
updateAvatarPreview();

function updateVoiceLabels() {
    els.pitchVal.textContent = parseFloat(els.pitchInput.value).toFixed(1);
    els.speedVal.textContent = parseFloat(els.speedInput.value).toFixed(1);
}

els.pitchInput.addEventListener('input', updateVoiceLabels);
els.speedInput.addEventListener('input', updateVoiceLabels);
updateVoiceLabels();

els.testVoiceBtn.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
        alert('お使いのブラウザは音声合成に対応していません。');
        return;
    }
    
    window.speechSynthesis.cancel();
    
    const pitch = parseFloat(els.pitchInput.value);
    const speed = parseFloat(els.speedInput.value);
    const gender = els.genderSelect.value;
    const grade = els.gradeSelect.value;
    
    const text = `こんにちは！私は${grade}の道徳のクラスメートです。設定は完了しましたか？`;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.pitch = pitch;
    utterance.rate = speed;
    
    const voices = window.speechSynthesis.getVoices();
    const jaVoices = voices.filter(v => v.lang.includes('ja'));
    if (jaVoices.length > 0) utterance.voice = jaVoices[0];
    
    window.speechSynthesis.speak(utterance);
});

els.startBtn.addEventListener('click', () => {
    if (!els.apiKeyInput.value.trim()) {
        alert('Gemini APIキーを入力してください。');
        return;
    }

    localStorage.setItem('apiKey', els.apiKeyInput.value.trim());
    localStorage.setItem('lessonName', els.lessonNameInput.value.trim() || '未設定');
    localStorage.setItem('moralValue', els.moralValueInput.value.trim() || '未設定');
    localStorage.setItem('grade', els.gradeSelect.value);
    localStorage.setItem('gender', els.genderSelect.value);
    localStorage.setItem('pitch', els.pitchInput.value);
    localStorage.setItem('speed', els.speedInput.value);

    // 授業ページへ遷移
    window.location.href = 'class.html';
});
