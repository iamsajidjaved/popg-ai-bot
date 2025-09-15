// POPG AI Chat Widget
class POPGChatWidget {
    constructor(options = {}) {
        this.options = {
            apiUrl: options.apiUrl || '/api/chat',
            position: options.position || 'bottom-right',
            theme: options.theme || 'light',
            autoOpen: options.autoOpen || false,
            showNotification: options.showNotification !== false,
            ...options
        };
        
        this.isOpen = false;
        this.isMinimized = false;
        this.isLoading = false;
        this.messageHistory = [];
        this.hasNewMessage = false;
        
        this.init();
    }
    
    init() {
        this.bindElements();
        this.bindEvents();
        this.initializeWidget();
        
        if (this.options.autoOpen) {
            setTimeout(() => this.openChat(), 1000);
        }
        
        // Show welcome notification
        if (this.options.showNotification) {
            setTimeout(() => this.showNotification(), 2000);
        }
    }
    
    bindElements() {
        this.widget = document.getElementById('popgChatWidget');
        this.toggleBtn = document.getElementById('chatToggle');
        this.chatWindow = document.getElementById('chatWindow');
        this.minimizeBtn = document.getElementById('minimizeBtn');
        this.closeBtn = document.getElementById('closeBtn');
        this.welcomeSection = document.getElementById('welcomeSection');
        this.chatMessages = document.getElementById('chatMessages');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.inputForm = document.getElementById('inputForm');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.errorToast = document.getElementById('errorToast');
        this.notification = document.getElementById('toggleNotification');
    }
    
    bindEvents() {
        // Toggle chat
        this.toggleBtn?.addEventListener('click', () => this.toggleChat());
        
        // Window controls
        this.minimizeBtn?.addEventListener('click', () => this.minimizeChat());
        this.closeBtn?.addEventListener('click', () => this.closeChat());
        
        // Form submission
        this.inputForm?.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // Input events
        this.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSubmit(e);
            }
        });
        
        this.messageInput?.addEventListener('input', () => this.updateSendButton());
        
        // Quick action buttons
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const message = btn.getAttribute('data-message');
                if (message) {
                    this.sendMessage(message);
                }
            });
        });
        
        // Click outside to close (optional)
        document.addEventListener('click', (e) => {
            if (!this.widget?.contains(e.target) && this.isOpen && !this.isMinimized) {
                // Optionally close on outside click
                // this.closeChat();
            }
        });
    }
    
    initializeWidget() {
        // Set initial state
        this.updateSendButton();
        
        // Apply theme if specified
        if (this.options.theme === 'dark') {
            this.widget?.classList.add('dark-theme');
        }
        
        // Apply position
        this.applyPosition();
        
        console.log('POPG Chat Widget initialized');
    }
    
    applyPosition() {
        if (!this.widget) return;
        
        const positions = {
            'bottom-right': { bottom: '24px', right: '24px' },
            'bottom-left': { bottom: '24px', left: '24px' },
            'top-right': { top: '24px', right: '24px' },
            'top-left': { top: '24px', left: '24px' }
        };
        
        const pos = positions[this.options.position] || positions['bottom-right'];
        Object.assign(this.widget.style, pos);
    }
    
    toggleChat() {
        if (this.isOpen) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }
    
    openChat() {
        if (!this.chatWindow) return;
        
        this.isOpen = true;
        this.isMinimized = false;
        this.chatWindow.classList.add('open');
        this.chatWindow.classList.remove('minimized');
        this.toggleBtn?.classList.add('active');
        
        // Hide notification
        this.hideNotification();
        
        // Focus input
        setTimeout(() => {
            this.messageInput?.focus();
        }, 300);
        
        // Mark messages as read
        this.hasNewMessage = false;
    }
    
    closeChat() {
        if (!this.chatWindow) return;
        
        this.isOpen = false;
        this.isMinimized = false;
        this.chatWindow.classList.remove('open', 'minimized');
        this.toggleBtn?.classList.remove('active');
    }
    
    minimizeChat() {
        if (!this.chatWindow) return;
        
        this.isMinimized = true;
        this.chatWindow.classList.add('minimized');
    }
    
    showNotification() {
        if (this.notification && !this.isOpen) {
            this.notification.classList.add('show');
        }
    }
    
    hideNotification() {
        if (this.notification) {
            this.notification.classList.remove('show');
        }
    }
    
    async handleSubmit(e) {
        e.preventDefault();
        
        const message = this.messageInput?.value.trim();
        if (!message || this.isLoading) return;
        
        await this.sendMessage(message);
        
        // Clear input
        if (this.messageInput) {
            this.messageInput.value = '';
            this.updateSendButton();
        }
    }
    
    async sendMessage(message) {
        if (!message.trim() || this.isLoading) return;
        
        // Hide welcome section
        if (this.welcomeSection) {
            this.welcomeSection.style.display = 'none';
        }
        
        // Add user message
        this.addMessage(message, 'user');
        
        // Show typing indicator
        this.showTyping();
        
        try {
            this.isLoading = true;
            this.updateSendButton();
            
            const response = await fetch(this.options.apiUrl, {
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
            
            // Hide typing indicator
            this.hideTyping();
            
            // Add bot response
            this.addMessage(data.response, 'bot');
            
        } catch (error) {
            console.error('Error sending message:', error);
            
            this.hideTyping();
            this.showError('Sorry, I encountered an error. Please try again.');
            
            // Add error message
            this.addMessage(
                'I apologize, but I\'m having trouble connecting right now. Please try again in a moment.',
                'bot'
            );
            
        } finally {
            this.isLoading = false;
            this.updateSendButton();
        }
    }
    
    addMessage(content, sender) {
        if (!this.chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = sender === 'user' ? 
            '<i class="fas fa-user"></i>' : 
            '<i class="fas fa-robot"></i>';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        
        // Handle markdown for bot messages
        if (sender === 'bot') {
            bubble.innerHTML = marked.parse(content);
        } else {
            bubble.textContent = content;
        }
        
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageContent.appendChild(bubble);
        messageContent.appendChild(time);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        this.chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        this.scrollToBottom();
        
        // Store in history
        this.messageHistory.push({
            content,
            sender,
            timestamp: new Date()
        });
        
        // Show notification if closed
        if (!this.isOpen && sender === 'bot') {
            this.hasNewMessage = true;
            this.showNotification();
        }
    }
    
    showTyping() {
        if (this.typingIndicator) {
            this.typingIndicator.style.display = 'flex';
            this.scrollToBottom();
        }
    }
    
    hideTyping() {
        if (this.typingIndicator) {
            this.typingIndicator.style.display = 'none';
        }
    }
    
    updateSendButton() {
        if (!this.sendBtn || !this.messageInput) return;
        
        const hasText = this.messageInput.value.trim().length > 0;
        const canSend = hasText && !this.isLoading;
        
        this.sendBtn.disabled = !canSend;
        
        if (this.isLoading) {
            this.sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            this.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
    
    scrollToBottom() {
        if (this.chatMessages && this.chatMessages.parentElement) {
            const container = this.chatMessages.parentElement;
            container.scrollTop = container.scrollHeight;
        }
    }
    
    showError(message) {
        if (!this.errorToast) return;
        
        const errorMessage = this.errorToast.querySelector('#errorMessage');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        
        this.errorToast.classList.add('show');
        
        // Auto hide after 5 seconds
        setTimeout(() => {
            this.errorToast.classList.remove('show');
        }, 5000);
    }
    
    // Public API methods
    open() {
        this.openChat();
    }
    
    close() {
        this.closeChat();
    }
    
    minimize() {
        this.minimizeChat();
    }
    
    sendText(message) {
        if (message && message.trim()) {
            this.sendMessage(message.trim());
        }
    }
    
    clearHistory() {
        this.messageHistory = [];
        if (this.chatMessages) {
            this.chatMessages.innerHTML = '';
        }
        if (this.welcomeSection) {
            this.welcomeSection.style.display = 'block';
        }
    }
    
    getHistory() {
        return [...this.messageHistory];
    }
    
    setTheme(theme) {
        if (this.widget) {
            this.widget.classList.toggle('dark-theme', theme === 'dark');
        }
        this.options.theme = theme;
    }
    
    destroy() {
        if (this.widget) {
            this.widget.remove();
        }
    }
}

// Auto-initialize if widget HTML is present
document.addEventListener('DOMContentLoaded', function() {
    const widgetElement = document.getElementById('popgChatWidget');
    if (widgetElement) {
        // Get configuration from data attributes
        const config = {
            apiUrl: widgetElement.dataset.apiUrl,
            position: widgetElement.dataset.position,
            theme: widgetElement.dataset.theme,
            autoOpen: widgetElement.dataset.autoOpen === 'true',
            showNotification: widgetElement.dataset.showNotification !== 'false'
        };
        
        // Initialize widget
        window.popgChatWidget = new POPGChatWidget(config);
        
        console.log('POPG Chat Widget ready!');
    }
});

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = POPGChatWidget;
}

// Global access
window.POPGChatWidget = POPGChatWidget;