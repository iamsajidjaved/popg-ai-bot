// Global variables
let conversationId = null;
let isLoading = false;

// DOM elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const chatForm = document.getElementById('chatForm');
const sendButton = document.getElementById('sendButton');
const typingIndicator = document.getElementById('typingIndicator');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const charCount = document.getElementById('charCount');
const errorToast = document.getElementById('errorToast');
const errorMessage = document.getElementById('errorMessage');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkServerHealth();
});

/**
 * Initialize the application
 */
function initializeApp() {
    // Auto-resize textarea
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        updateCharacterCount();
    });

    // Generate conversation ID
    conversationId = Date.now().toString();
    
    console.log('🤖 AI Chatbot initialized');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Form submission
    chatForm.addEventListener('submit', handleFormSubmit);
    
    // Enter key handling
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isLoading && this.value.trim()) {
                handleFormSubmit(e);
            }
        }
    });
    
    // Suggestion buttons
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const suggestion = this.getAttribute('data-suggestion');
            messageInput.value = suggestion;
            updateCharacterCount();
            messageInput.focus();
        });
    });
}

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const message = messageInput.value.trim();
    if (!message || isLoading) return;
    
    // Add user message to chat
    addMessage(message, 'user');
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    updateCharacterCount();
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        isLoading = true;
        updateSendButton();
        
        // Send message to API
        const response = await sendMessageToAPI(message);
        
        // Hide typing indicator
        hideTypingIndicator();
        
        // Add bot response
        addMessage(response.response, 'bot', response.sources);
        
        // Update conversation ID
        if (response.conversationId) {
            conversationId = response.conversationId;
        }
        
    } catch (error) {
        hideTypingIndicator();
        showError('Failed to get response. Please try again.');
        console.error('Chat error:', error);
    } finally {
        isLoading = false;
        updateSendButton();
        messageInput.focus();
    }
}

/**
 * Send message to the API
 */
async function sendMessageToAPI(message) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: message,
            conversationId: conversationId
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Add message to chat
 */
function addMessage(text, sender, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    
    // Render markdown for bot messages, plain text for user messages
    if (sender === 'bot') {
        messageText.className += ' markdown-content';
        messageText.innerHTML = marked.parse(text);
    } else {
        messageText.textContent = text;
    }
    
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    content.appendChild(messageText);
    content.appendChild(messageTime);
    
    // Add sources if available (bot messages only)
    if (sender === 'bot' && sources && sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'message-sources';
        
        const sourcesTitle = document.createElement('div');
        sourcesTitle.className = 'sources-title';
        sourcesTitle.innerHTML = '<i class="fas fa-link"></i> Sources:';
        sourcesDiv.appendChild(sourcesTitle);
        
        // Remove duplicates and limit to 3 sources
        const uniqueSources = Array.from(new Set(sources.map(s => s.url)))
            .slice(0, 3)
            .map(url => sources.find(s => s.url === url));
        
        uniqueSources.forEach(source => {
            const sourceLink = document.createElement('a');
            sourceLink.className = 'source-link';
            sourceLink.href = source.url;
            sourceLink.target = '_blank';
            sourceLink.rel = 'noopener noreferrer';
            sourceLink.textContent = source.title || source.url;
            sourcesDiv.appendChild(sourceLink);
        });
        
        content.appendChild(sourcesDiv);
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Show typing indicator
 */
function showTypingIndicator() {
    typingIndicator.style.display = 'flex';
    scrollToBottom();
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}

/**
 * Update send button state
 */
function updateSendButton() {
    sendButton.disabled = isLoading;
    sendButton.innerHTML = isLoading ? 
        '<i class="fas fa-spinner fa-spin"></i>' : 
        '<i class="fas fa-paper-plane"></i>';
}

/**
 * Update character count
 */
function updateCharacterCount() {
    const count = messageInput.value.length;
    charCount.textContent = count;
    
    if (count > 450) {
        charCount.style.color = 'var(--error)';
    } else if (count > 400) {
        charCount.style.color = 'var(--warning)';
    } else {
        charCount.style.color = 'var(--text-muted)';
    }
}

/**
 * Scroll chat to bottom
 */
function scrollToBottom() {
    requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

/**
 * Show error message
 */
function showError(message) {
    errorMessage.textContent = message;
    errorToast.style.display = 'flex';
    
    // Auto-hide after 5 seconds
    setTimeout(hideError, 5000);
}

/**
 * Hide error message
 */
function hideError() {
    errorToast.style.display = 'none';
}

/**
 * Check server health
 */
async function checkServerHealth() {
    try {
        const response = await fetch('/api/health');
        if (response.ok) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
            
            // Check stats
            const statsResponse = await fetch('/api/stats');
            if (statsResponse.ok) {
                const stats = await statsResponse.json();
                statusText.textContent = `Ready • ${stats.totalDocuments} documents`;
            }
        } else {
            throw new Error('Server not responding');
        }
    } catch (error) {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        console.error('Health check failed:', error);
        
        // Retry after 5 seconds
        setTimeout(checkServerHealth, 5000);
    }
}

/**
 * Handle connection status
 */
window.addEventListener('online', () => {
    checkServerHealth();
});

window.addEventListener('offline', () => {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Offline';
});

// Export functions for global access
window.hideError = hideError;
