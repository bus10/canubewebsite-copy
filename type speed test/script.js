const words = [
    // Common short words
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
    'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
    'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy',
    'did', 'its', 'let', 'put', 'say', 'too', 'use', 'yes', 'bad', 'big',
    'hot', 'run', 'top', 'cut', 'dog', 'fun', 'got', 'lot', 'men', 'sat',
    
    // Medium-length words
    'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'about', 'after',
    'again', 'before', 'between', 'could', 'every', 'first', 'found', 'great',
    'group', 'house', 'large', 'later', 'leave', 'little', 'might', 'never',
    'other', 'place', 'right', 'small', 'still', 'think', 'three', 'under',
    'water', 'where', 'which', 'while', 'world', 'would', 'write', 'young',
    'answer', 'become', 'better', 'change', 'choose', 'church', 'common',
    'create', 'depend', 'during', 'expect', 'family', 'father', 'figure',
    'friend', 'giving', 'golden', 'happen', 'having', 'health', 'heaven',
    'indeed', 'inside', 'itself', 'junior', 'keeper', 'keeper', 'ladies',
    'length', 'letter', 'living', 'manner', 'market', 'master', 'matter',
    'member', 'mental', 'method', 'middle', 'mirror', 'mobile', 'modern',
    'moment', 'mother', 'motion', 'moving', 'nature', 'notice', 'number',
    
    // Technical and programming words
    'developer', 'code', 'javascript', 'typing', 'speed', 'test', 'function',
    'variable', 'array', 'object', 'method', 'class', 'program', 'software',
    'computer', 'database', 'server', 'client', 'network', 'system', 'data',
    'logic', 'algorithm', 'process', 'syntax', 'compile', 'execute', 'debug',
    'memory', 'storage', 'buffer', 'stream', 'thread', 'process', 'library',
    'framework', 'module', 'package', 'interface', 'protocol', 'request',
    'response', 'handler', 'listener', 'callback', 'promise', 'async', 'await',
    'template', 'component', 'router', 'middleware', 'service', 'provider',
    
    // Design and UX words
    'beautiful', 'animation', 'smooth', 'keyboard', 'monitor', 'screen',
    'design', 'interface', 'experience', 'user', 'layout', 'element',
    'widget', 'button', 'input', 'output', 'display', 'render', 'style',
    'theme', 'color', 'border', 'shadow', 'padding', 'margin', 'spacing',
    'responsive', 'mobile', 'desktop', 'tablet', 'viewport', 'resolution',
    
    // Learning and improvement words
    'learning', 'practice', 'improvement', 'challenge', 'success', 'goal',
    'effort', 'progress', 'performance', 'accuracy', 'speed', 'skill',
    'training', 'exercise', 'achieve', 'accomplish', 'complete', 'finish',
    'struggle', 'overcome', 'master', 'expert', 'professional', 'advanced',
    'beginner', 'intermediate', 'proficient', 'competent', 'capable'
];

let currentWordIndex = 0;
let currentCharIndex = 0;
let correctChars = 0;
let incorrectChars = 0;
let correctedChars = 0; // Track mistakes that were fixed with backspace
let totalCharsTyped = 0;
let startTime = null;
let timeLeft = 30; // Default to short test
let testDuration = 30; // Track selected test duration
let timerInterval = null;
let testActive = false;
let testFinished = false;
let selectedWords = [];
let typedChars = []; // Track typed characters for current word

const wordsContainer = document.getElementById('wordsContainer');
const wpmDisplay = document.getElementById('wpm');
const accuracyDisplay = document.getElementById('accuracy');
const timerDisplay = document.getElementById('timer');
const resetBtn = document.getElementById('resetBtn');
const instructionText = document.querySelector('.instruction-text');
const lengthButtons = document.querySelectorAll('.length-btn');

function initializeTest() {
    currentWordIndex = 0;
    currentCharIndex = 0;
    correctChars = 0;
    incorrectChars = 0;
    correctedChars = 0;
    totalCharsTyped = 0;
    timeLeft = testDuration;
    testActive = false;
    testFinished = false;
    typedChars = [];
    
    timerDisplay.textContent = testDuration;
    generateWords();
    updateStats();
    instructionText.classList.remove('active');
    
    // Re-enable length buttons
    lengthButtons.forEach(btn => btn.disabled = false);
}

function generateWords() {
    selectedWords = [];
    for (let i = 0; i < 100; i++) {
        selectedWords.push(words[Math.floor(Math.random() * words.length)]);
    }
    displayWords(selectedWords);
}

function appendMoreWords() {
    const currentLength = selectedWords.length;
    for (let i = 0; i < 50; i++) {
        selectedWords.push(words[Math.floor(Math.random() * words.length)]);
    }
    
    // Add new words to the DOM
    selectedWords.slice(currentLength).forEach((word, index) => {
        const wordEl = document.createElement('span');
        wordEl.className = 'word';
        wordEl.textContent = word;
        wordEl.setAttribute('data-word', word);
        wordEl.id = `word-${currentLength + index}`;
        wordsContainer.appendChild(wordEl);
    });
}

function displayWords(wordsList) {
    wordsContainer.innerHTML = '';
    wordsList.forEach((word, index) => {
        const wordEl = document.createElement('span');
        wordEl.className = 'word';
        if (index === 0) wordEl.classList.add('current');
        wordEl.textContent = word;
        wordEl.setAttribute('data-word', word);
        wordEl.id = `word-${index}`;
        wordsContainer.appendChild(wordEl);
    });
}

function startTest() {
    if (!testActive && !testFinished) {
        testActive = true;
        startTime = Date.now();
        wordsContainer.classList.add('active');
        instructionText.classList.add('active');
        
        // Disable length selection during test
        lengthButtons.forEach(btn => btn.disabled = true);
        
        timerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = timeLeft;
            
            if (timeLeft <= 0) {
                endTest();
            }
        }, 1000);
    }
}

function handleKeyPress(e) {
    const char = e.key;
    
    // Handle backspace
    if (char === 'Backspace') {
        e.preventDefault();
        
        if (testFinished || !testActive) return;
        if (typedChars.length === 0) return;
        
        const allWords = Array.from(document.querySelectorAll('.word'));
        const currentWord = allWords[currentWordIndex];
        const correctWord = currentWord.getAttribute('data-word');
        
        // Remove the last typed character
        const removedChar = typedChars.pop();
        currentCharIndex--;
        
        // If the removed char was wrong, move it from incorrect to corrected
        if (removedChar.toLowerCase() !== correctWord[currentCharIndex].toLowerCase()) {
            incorrectChars = Math.max(0, incorrectChars - 1);
            correctedChars++; // Count as a corrected mistake (still penalty, but reduced)
        } else {
            correctChars = Math.max(0, correctChars - 1);
        }
        
        // Remove incorrect class if all remaining chars are correct
        const allCorrect = typedChars.every((char, index) => 
            char.toLowerCase() === correctWord[index].toLowerCase()
        );
        
        if (allCorrect && typedChars.length > 0) {
            currentWord.classList.remove('incorrect');
        }
        
        totalCharsTyped = Math.max(0, totalCharsTyped - 1);
        renderWordProgress(currentWord, correctWord);
        updateStats();
        return;
    }
    
    // Only process alphanumeric characters and spaces
    if (char.length !== 1 || /[^a-zA-Z ]/.test(char)) {
        return;
    }
    
    e.preventDefault();
    
    if (testFinished) return;
    
    if (!testActive && !testFinished) {
        startTest();
    }
    
    const allWords = Array.from(document.querySelectorAll('.word'));
    
    if (currentWordIndex >= allWords.length) {
        // Generate more words if we're running out
        if (testActive) {
            appendMoreWords();
        } else {
            endTest();
            return;
        }
    }
    
    const currentWord = allWords[currentWordIndex];
    const correctWord = currentWord.getAttribute('data-word');
    
    if (char === ' ') {
        // Word completed
        currentWord.classList.remove('current');
        
        // Check if word is correct
        const typedWord = typedChars.join('');
        if (typedWord === correctWord) {
            currentWord.classList.add('correct');
            // Don't add to correctChars here - already counted character by character
        } else {
            currentWord.classList.add('incorrect');
            // Only count length difference as penalty if word is too short
            if (typedWord.length < correctWord.length) {
                incorrectChars += (correctWord.length - typedWord.length);
            }
        }
        
        totalCharsTyped += typedWord.length + 1; // +1 for space
        currentWordIndex++;
        currentCharIndex = 0;
        typedChars = [];
        
        if (currentWordIndex < allWords.length) {
            allWords[currentWordIndex].classList.add('current');
            allWords[currentWordIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            // Generate more words if needed
            if (testActive) {
                appendMoreWords();
                const updatedWords = Array.from(document.querySelectorAll('.word'));
                updatedWords[currentWordIndex].classList.add('current');
                updatedWords[currentWordIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                endTest();
            }
        }
    } else {
        // Character typed
        typedChars.push(char);
        
        // Check if character is correct
        if (char.toLowerCase() === correctWord[currentCharIndex].toLowerCase()) {
            correctChars++;
        } else {
            currentWord.classList.add('incorrect');
            incorrectChars++;
        }
        
        currentCharIndex++;
        totalCharsTyped = typedChars.length;
        
        // Render the word with typed characters
        renderWordProgress(currentWord, correctWord);
    }
    
    updateStats();
}

function renderWordProgress(wordEl, correctWord) {
    wordEl.innerHTML = '';
    
    // Display each character of the word
    for (let i = 0; i < correctWord.length; i++) {
        const charSpan = document.createElement('span');
        charSpan.className = 'char';
        charSpan.textContent = correctWord[i];
        
        if (i < typedChars.length) {
            // Character has been typed
            if (typedChars[i].toLowerCase() === correctWord[i].toLowerCase()) {
                charSpan.classList.add('correct');
            } else {
                charSpan.classList.add('incorrect');
            }
        } else {
            // Character not yet typed
            charSpan.style.opacity = '0.3';
        }
        
        wordEl.appendChild(charSpan);
    }
}

function updateStats() {
    // Calculate WPM (words per minute: 5 chars = 1 word)
    let wpm = 0;
    if (startTime) {
        const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
        wpm = Math.round((correctChars / 5) / elapsedMinutes);
    }
    wpmDisplay.textContent = Math.max(0, wpm);
    wpmDisplay.classList.add('update');
    setTimeout(() => wpmDisplay.classList.remove('update'), 300);
    
    // Calculate accuracy with reduced penalty for corrected mistakes
    // Corrected chars count as 0.3x penalty (70% forgiveness)
    const weightedIncorrect = incorrectChars + (correctedChars * 0.3);
    const totalChars = correctChars + weightedIncorrect;
    let accuracy = 100;
    if (totalChars > 0) {
        accuracy = Math.round((correctChars / totalChars) * 100);
    }
    accuracyDisplay.textContent = accuracy + '%';
    
}

function endTest() {
    testActive = false;
    testFinished = true;
    
    clearInterval(timerInterval);
    wordsContainer.classList.remove('active');
    
    // Calculate final stats
    const elapsedMinutes = testDuration / 60; // Convert duration to minutes
    const wpm = Math.round((correctChars / 5) / elapsedMinutes);
    const weightedIncorrect = incorrectChars + (correctedChars * 0.3);
    const totalChars = correctChars + weightedIncorrect;
    const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
    
    // Show results
    const finishedDiv = document.createElement('div');
    finishedDiv.className = 'finished';
    finishedDiv.innerHTML = `
        <h2>Test Complete!</h2>
        <p><strong>WPM:</strong> ${wpm}</p>
        <p><strong>Accuracy:</strong> ${accuracy}%</p>
        <p><strong>Words Typed:</strong> ${Math.round(correctChars / 5)}</p>
    `;
    
    const testArea = document.querySelector('.test-area');
    testArea.insertBefore(finishedDiv, testArea.firstChild);
}

function reset() {
    // Clear intervals
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    // Remove finished message if it exists
    const finished = document.querySelector('.finished');
    if (finished) {
        finished.remove();
    }
    
    initializeTest();
}

// Event listeners
document.addEventListener('keypress', handleKeyPress);
resetBtn.addEventListener('click', reset);

// Length selection
lengthButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if (testActive) return; // Don't allow changes during test
        
        // Update active state
        lengthButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Set new duration
        testDuration = parseInt(btn.getAttribute('data-length'));
        timeLeft = testDuration;
        timerDisplay.textContent = testDuration;
    });
});

// Initialize on load
window.addEventListener('load', initializeTest);
