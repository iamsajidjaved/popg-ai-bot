// POPG AI Chat Widget
class POPGChatWidget {
    constructor(options = {}) {
        // Detect if we're running locally or on a server
        const isLocalFile = window.location.protocol === 'file:';
        const defaultApiUrl = isLocalFile ? 'http://localhost:3000/api/chat' : '/api/chat';
        
        this.options = {
            apiUrl: options.apiUrl || defaultApiUrl,
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
        this.exportBtn = document.getElementById('exportBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.welcomeSection = document.getElementById('welcomeSection');
        this.chatMessages = document.getElementById('chatMessages');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.inputForm = document.getElementById('inputForm');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.errorToast = document.getElementById('errorToast');
        this.notification = document.getElementById('toggleNotification');
        
        // Store conversation history
        this.conversationHistory = [];
    }
    
    bindEvents() {
        // Toggle chat
        this.toggleBtn?.addEventListener('click', () => this.toggleChat());
        
        // Window controls
        this.minimizeBtn?.addEventListener('click', () => this.minimizeChat());
        this.closeBtn?.addEventListener('click', () => this.closeChat());
        this.exportBtn?.addEventListener('click', () => this.exportConversation());
        this.clearBtn?.addEventListener('click', () => this.clearConversation());
        
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

        // Clear input immediately for better UX
        if (this.messageInput) {
            this.messageInput.value = '';
            this.updateSendButton();
        }
        
        await this.sendMessage(message);
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
            
            // Professional error handling with detailed messages
            let errorMessage = 'I apologize for the technical difficulty. Please try again.';
            let chatErrorMessage = 'I\'m experiencing a temporary connection issue. Please try your question again in a moment.';
            
            if (error.message.includes('Failed to fetch') || error.message.includes('ERR_FAILED')) {
                if (window.location.protocol === 'file:') {
                    errorMessage = 'Widget requires server environment. Please access via http://localhost:3000/demo';
                    chatErrorMessage = '**Technical Notice:** This POPG AI widget requires a web server environment to function properly.\n\n**Solution:** Please visit http://localhost:3000/demo to experience the full functionality.\n\n**For Developers:** Serve this through a local web server instead of opening the HTML file directly.';
                } else {
                    errorMessage = 'Server connection unavailable. Please verify the POPG AI service is running.';
                    chatErrorMessage = '**Connection Issue:** I\'m unable to reach the POPG AI service at the moment.\n\n**Please try:**\n• Refreshing the page\n• Checking your internet connection\n• Contacting support if the issue persists\n\nI apologize for the inconvenience.';
                }
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Request timeout. The server may be busy.';
                chatErrorMessage = '**Request Timeout:** The server is taking longer than expected to respond.\n\n**Suggested Actions:**\n• Try a shorter, more specific question\n• Wait a moment and try again\n• The server may be experiencing high traffic\n\nThank you for your patience.';
            } else if (error.message.includes('500')) {
                errorMessage = 'Internal server error. Please contact support.';
                chatErrorMessage = '**Service Temporarily Unavailable:** The POPG AI service is experiencing technical difficulties.\n\n**Status:** Our technical team has been notified\n**Estimated Resolution:** Usually within a few minutes\n\n**Meanwhile, you can:**\n• Visit our [official website](https://popg.com) for basic information\n• Contact our support team directly\n\nWe apologize for the inconvenience.';
            }
            
            this.showError(errorMessage);
            
            // Add professional error message to chat
            this.addMessage(chatErrorMessage, 'bot');
            
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
            // Simple text processing - convert basic markdown but keep it clean
            let processedContent = content
                // Convert **bold** to <strong>
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // Convert markdown links [text](url) to proper HTML links
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: none; border-bottom: 1px solid #007bff;">$1</a>')
                // Convert bullet points to simple list items
                .replace(/^• (.+)$/gm, '<div style="margin: 4px 0; padding-left: 12px;">• $1</div>')
                // Convert line breaks to proper spacing
                .replace(/\n\n/g, '</p><p style="margin: 8px 0;">')
                .replace(/\n/g, '<br>');
            
            // Wrap in paragraph if no paragraph tags exist
            if (!processedContent.includes('<p>') && !processedContent.includes('<div>')) {
                processedContent = `<p style="margin: 8px 0;">${processedContent}</p>`;
            }
            
            bubble.innerHTML = processedContent;
        } else {
            bubble.textContent = content;
        }
        
        const time = document.createElement('div');
        time.className = 'message-time';
        const now = new Date();
        time.textContent = now.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        time.title = now.toLocaleString(); // Full timestamp on hover

        // Add message actions for bot messages
        if (sender === 'bot') {
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn copy-btn';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.title = 'Copy message';
            copyBtn.addEventListener('click', () => this.copyMessage(content));
            
            const timestampBtn = document.createElement('button');
            timestampBtn.className = 'action-btn timestamp-btn';
            timestampBtn.innerHTML = '<i class="fas fa-clock"></i>';
            timestampBtn.title = `Sent at ${now.toLocaleString()}`;
            
            actions.appendChild(copyBtn);
            actions.appendChild(timestampBtn);
            messageContent.appendChild(actions);
        }
        
        messageContent.appendChild(bubble);
        messageContent.appendChild(time);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        this.chatMessages.appendChild(messageDiv);
        
        // Track in conversation history
        this.conversationHistory.push({
            content: content,
            sender: sender,
            timestamp: now,
            id: Date.now() + Math.random()
        });
        
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
            
            // Add professional status message
            const statusText = this.typingIndicator.querySelector('.typing-text');
            if (statusText) {
                const messages = [
                    'POPG AI is analyzing your question...',
                    'Processing your request...',
                    'Gathering information...',
                    'Preparing response...'
                ];
                statusText.textContent = messages[Math.floor(Math.random() * messages.length)];
            }
            
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
            this.sendBtn.setAttribute('title', 'Processing...');
        } else {
            this.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            this.sendBtn.setAttribute('title', hasText ? 'Send message' : 'Type a message first');
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
    
    copyMessage(content) {
        // Remove HTML tags for clean copying
        const cleanContent = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(cleanContent).then(() => {
                this.showNotification('Message copied to clipboard!');
            }).catch(() => {
                this.fallbackCopy(cleanContent);
            });
        } else {
            this.fallbackCopy(cleanContent);
        }
    }
    
    fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            this.showNotification('Message copied to clipboard!');
        } catch (err) {
            this.showNotification('Copy failed. Please copy manually.', 'error');
        }
        document.body.removeChild(textarea);
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `widget-notification ${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10001;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInDown 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutUp 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    exportConversation() {
        if (this.conversationHistory.length === 0) {
            this.showNotification('No conversation to export', 'error');
            return;
        }
        
        // Create formatted conversation text
        const exportData = {
            export_date: new Date().toISOString(),
            platform: 'POPG AI Chat Widget',
            total_messages: this.conversationHistory.length,
            conversation: this.conversationHistory.map(msg => ({
                timestamp: msg.timestamp.toISOString(),
                sender: msg.sender === 'bot' ? 'POPG AI Assistant' : 'User',
                message: msg.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
            }))
        };
        
        // Create downloadable file
        const jsonContent = JSON.stringify(exportData, null, 2);
        const txtContent = this.formatConversationAsText(exportData);
        
        // Create download links
        this.downloadFile(jsonContent, 'popg-conversation.json', 'application/json');
        
        // Also offer text version
        setTimeout(() => {
            this.downloadFile(txtContent, 'popg-conversation.txt', 'text/plain');
        }, 500);
        
        this.showNotification('Conversation exported successfully!');
    }
    
    formatConversationAsText(data) {
        let text = `POPG AI Conversation Export\n`;
        text += `Export Date: ${new Date(data.export_date).toLocaleString()}\n`;
        text += `Total Messages: ${data.total_messages}\n`;
        text += `${'='.repeat(50)}\n\n`;
        
        data.conversation.forEach(msg => {
            text += `[${new Date(msg.timestamp).toLocaleString()}] ${msg.sender}:\n`;
            text += `${msg.message}\n\n`;
        });
        
        text += `${'='.repeat(50)}\n`;
        text += `Generated by POPG AI Chat Widget\n`;
        
        return text;
    }
    
    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    clearConversation() {
        if (this.conversationHistory.length === 0) {
            this.showNotification('No conversation to clear', 'error');
            return;
        }
        
        // Show confirmation dialog
        if (confirm('Are you sure you want to clear the entire conversation? This action cannot be undone.')) {
            // Clear visual messages
            if (this.chatMessages) {
                this.chatMessages.innerHTML = '';
            }
            
            // Clear history
            this.conversationHistory = [];
            
            // Show welcome section again
            if (this.welcomeSection) {
                this.welcomeSection.style.display = 'block';
            }
            
            this.showNotification('Conversation cleared successfully!');
        }
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
        // Detect environment and set appropriate API URL
        const isLocalFile = window.location.protocol === 'file:';
        const defaultApiUrl = isLocalFile ? 'http://localhost:3000/api/chat' : '/api/chat';
        
        // Get configuration from data attributes
        const config = {
            apiUrl: widgetElement.dataset.apiUrl || defaultApiUrl,
            position: widgetElement.dataset.position,
            theme: widgetElement.dataset.theme,
            autoOpen: widgetElement.dataset.autoOpen === 'true',
            showNotification: widgetElement.dataset.showNotification !== 'false'
        };
        
        // Show warning if opened as file
        if (isLocalFile) {
            console.warn('⚠️ Widget opened as file:// - For full functionality, please serve through web server: http://localhost:3000/demo');
        }
        
        // Initialize widget
        window.popgChatWidget = new POPGChatWidget(config);
        
        console.log('POPG Chat Widget ready!', isLocalFile ? '(File mode - limited functionality)' : '(Server mode)');
    }
});

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = POPGChatWidget;
}

// Global access
window.POPGChatWidget = POPGChatWidget;