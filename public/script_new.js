// Modern POPG AI Chatbot Interface
class POPGChatbot {
    constructor() {
        this.isConnected = false;
        this.isLoading = false;
        this.messageHistory = [];
        this.sidebarOpen = true;
        
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeConnection();
        this.setupExampleQuestions();
        this.setupAutoResize();
    }

    initializeElements() {
        // Get DOM elements
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.chatContainer = document.getElementById('chatContainer');
        this.chatMessages = document.getElementById('chatMessages');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.inputForm = document.getElementById('inputForm');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.charCount = document.getElementById('charCount');
        
        // Initialize character count
        this.updateCharCount();
    }

    initializeEventListeners() {
        // Sidebar toggle
        this.sidebarToggle?.addEventListener('click', () => this.toggleSidebar());
        
        // New chat button
        this.newChatBtn?.addEventListener('click', () => this.startNewChat());
        
        // Form submission
        this.inputForm?.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // Input field events
        this.userInput?.addEventListener('input', () => {
            this.updateCharCount();
            this.adjustTextareaHeight();
        });
        
        this.userInput?.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Mobile responsiveness
        window.addEventListener('resize', () => this.handleResize());
        
        // Click outside sidebar to close (mobile)
        document.addEventListener('click', (e) => this.handleOutsideClick(e));
    }

    initializeConnection() {
        // Simulate connection check
        setTimeout(() => {
            this.setConnectionStatus(true);
        }, 1000);
    }

    setupExampleQuestions() {
        const questionCards = document.querySelectorAll('.question-card');
        questionCards.forEach(card => {
            card.addEventListener('click', () => {
                const questionText = card.querySelector('.question-text').textContent;
                this.sendMessage(questionText);
            });
        });
    }

    setupAutoResize() {
        // Auto-resize textarea
        this.adjustTextareaHeight();
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        this.sidebar?.classList.toggle('open', this.sidebarOpen);
        
        // Save preference
        localStorage.setItem('sidebarOpen', this.sidebarOpen);
    }

    startNewChat() {
        this.messageHistory = [];
        this.clearMessages();
        this.showWelcomeScreen();
        this.focusInput();
    }

    handleSubmit(e) {
        e.preventDefault();
        
        const message = this.userInput?.value.trim();
        if (!message || this.isLoading) return;
        
        this.sendMessage(message);
    }

    handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSubmit(e);
        }
    }

    handleResize() {
        // Handle responsive behavior
        const isMobile = window.innerWidth <= 768;
        if (isMobile && this.sidebarOpen) {
            // Close sidebar on mobile when resizing
            this.sidebarOpen = false;
            this.sidebar?.classList.remove('open');
        }
    }

    handleOutsideClick(e) {
        const isMobile = window.innerWidth <= 768;
        if (isMobile && this.sidebarOpen && 
            !this.sidebar?.contains(e.target) && 
            !this.sidebarToggle?.contains(e.target)) {
            this.toggleSidebar();
        }
    }

    setConnectionStatus(connected) {
        this.isConnected = connected;
        
        if (this.statusDot) {
            this.statusDot.classList.toggle('connected', connected);
        }
        
        if (this.statusText) {
            this.statusText.textContent = connected ? 'Connected' : 'Disconnected';
        }
        
        // Update send button state
        this.updateSendButton();
    }

    updateCharCount() {
        const count = this.userInput?.value.length || 0;
        const maxLength = 2000;
        
        if (this.charCount) {
            this.charCount.textContent = `${count}/${maxLength}`;
            this.charCount.style.color = count > maxLength * 0.9 ? 
                'var(--warning)' : 'var(--text-muted)';
        }
        
        this.updateSendButton();
    }

    adjustTextareaHeight() {
        if (!this.userInput) return;
        
        this.userInput.style.height = 'auto';
        this.userInput.style.height = Math.min(this.userInput.scrollHeight, 120) + 'px';
    }

    updateSendButton() {
        if (!this.sendButton) return;
        
        const hasText = this.userInput?.value.trim().length > 0;
        const canSend = hasText && this.isConnected && !this.isLoading;
        
        this.sendButton.disabled = !canSend;
        this.sendButton.innerHTML = this.isLoading ? 
            '<i class="fas fa-spinner fa-spin"></i>' : 
            '<i class="fas fa-paper-plane"></i>';
    }

    showWelcomeScreen() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'flex';
        }
        if (this.chatMessages) {
            this.chatMessages.style.display = 'none';
        }
    }

    hideWelcomeScreen() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'none';
        }
        if (this.chatMessages) {
            this.chatMessages.style.display = 'flex';
        }
    }

    clearMessages() {
        if (this.chatMessages) {
            this.chatMessages.innerHTML = '';
        }
    }

    focusInput() {
        this.userInput?.focus();
    }

    async sendMessage(message) {
        if (!message.trim() || this.isLoading) return;
        
        // Hide welcome screen and show chat
        this.hideWelcomeScreen();
        
        // Add user message
        this.addMessage(message, 'user');
        
        // Clear input
        if (this.userInput) {
            this.userInput.value = '';
            this.adjustTextareaHeight();
            this.updateCharCount();
        }
        
        // Set loading state
        this.setLoading(true);
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Remove typing indicator
            this.hideTypingIndicator();
            
            // Add bot response
            this.addMessage(data.response, 'bot');
            
        } catch (error) {
            console.error('Error:', error);
            
            // Remove typing indicator
            this.hideTypingIndicator();
            
            // Show error message
            this.addMessage(
                'Sorry, I encountered an error while processing your request. Please try again.', 
                'bot', 
                true
            );
            
            this.showToast('Failed to send message', 'error');
        } finally {
            this.setLoading(false);
            this.focusInput();
        }
    }

    addMessage(content, sender, isError = false) {
        if (!this.chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = sender === 'user' ? 
            '<i class="fas fa-user"></i>' : 
            '<i class="fas fa-robot"></i>';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        
        if (isError) {
            messageText.style.borderColor = 'var(--error)';
            messageText.style.background = 'rgba(239, 68, 68, 0.1)';
        }
        
        // Handle markdown for bot messages
        if (sender === 'bot') {
            messageText.className += ' markdown-content';
            messageText.innerHTML = marked.parse(content);
            
            // Highlight code blocks
            messageText.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        } else {
            messageText.textContent = content;
        }
        
        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = new Date().toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageContent.appendChild(messageText);
        messageContent.appendChild(messageTime);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        this.chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        this.scrollToBottom();
        
        // Store in history
        this.messageHistory.push({ content, sender, timestamp: new Date() });
    }

    showTypingIndicator() {
        if (!this.chatMessages) return;
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typingIndicator';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '<i class="fas fa-robot"></i>';
        avatar.style.background = 'var(--gradient-primary)';
        avatar.style.color = 'white';
        
        const typingContent = document.createElement('div');
        typingContent.className = 'typing-content';
        
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'typing-dots';
        dotsContainer.innerHTML = '<span></span><span></span><span></span>';
        
        const typingText = document.createElement('div');
        typingText.className = 'typing-text';
        typingText.textContent = 'POPG AI is thinking...';
        
        typingContent.appendChild(dotsContainer);
        typingContent.appendChild(typingText);
        
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(typingContent);
        
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.updateSendButton();
        
        // Disable input while loading
        if (this.userInput) {
            this.userInput.disabled = loading;
        }
    }

    scrollToBottom() {
        if (this.chatContainer) {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }

    showToast(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container') || 
                              this.createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        toastContainer.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    // Utility methods
    formatTime(date) {
        return date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    formatDate(date) {
        return date.toLocaleDateString();
    }

    // Export chat history
    exportChatHistory() {
        const historyText = this.messageHistory
            .map(msg => `[${this.formatTime(msg.timestamp)}] ${msg.sender.toUpperCase()}: ${msg.content}`)
            .join('\n');
        
        const blob = new Blob([historyText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `popg-chat-${this.formatDate(new Date())}.txt`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    // Save chat to localStorage
    saveChatHistory() {
        localStorage.setItem('popg-chat-history', JSON.stringify(this.messageHistory));
    }

    // Load chat from localStorage
    loadChatHistory() {
        try {
            const saved = localStorage.getItem('popg-chat-history');
            if (saved) {
                this.messageHistory = JSON.parse(saved);
                
                // Restore messages
                this.messageHistory.forEach(msg => {
                    this.addMessage(msg.content, msg.sender);
                });
                
                if (this.messageHistory.length > 0) {
                    this.hideWelcomeScreen();
                }
            }
        } catch (error) {
            console.warn('Failed to load chat history:', error);
        }
    }
}

// Initialize the chatbot when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.popgChatbot = new POPGChatbot();
    
    // Load saved sidebar state
    const savedSidebarState = localStorage.getItem('sidebarOpen');
    if (savedSidebarState !== null) {
        window.popgChatbot.sidebarOpen = JSON.parse(savedSidebarState);
        window.popgChatbot.sidebar?.classList.toggle('open', window.popgChatbot.sidebarOpen);
    }
    
    // Optionally load chat history
    // window.popgChatbot.loadChatHistory();
});

// Auto-save chat history periodically
setInterval(() => {
    if (window.popgChatbot && window.popgChatbot.messageHistory.length > 0) {
        window.popgChatbot.saveChatHistory();
    }
}, 30000); // Save every 30 seconds