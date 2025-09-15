/**
 * Simple POPG AI Chat Widget
 * Clean and simple integration
 */

(function() {
    'use strict';
    
    // Prevent multiple loads
    if (window.popgChatLoaded) return;
    window.popgChatLoaded = true;
    
    // Configuration
    const config = {
        serverUrl: getCurrentDomain(),
        ...window.popgConfig
    };
    
    function getCurrentDomain() {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.src && script.src.includes('simple-embed.js')) {
                const url = new URL(script.src);
                return `${url.protocol}//${url.host}`;
            }
        }
        return window.location.origin;
    }
    
    function createChatWidget() {
        // Create chat button
        const chatButton = document.createElement('div');
        chatButton.id = 'popg-chat-button';
        chatButton.innerHTML = '💬';
        chatButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: #007bff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,123,255,0.3);
            font-size: 24px;
            transition: all 0.3s ease;
        `;
        
        // Create chat window
        const chatWindow = document.createElement('div');
        chatWindow.id = 'popg-chat-window';
        chatWindow.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 350px;
            height: 500px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            z-index: 9998;
            display: none;
            overflow: hidden;
        `;
        
        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.src = config.serverUrl + '/simple-chat.html';
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 12px;
        `;
        
        chatWindow.appendChild(iframe);
        
        // Add hover effects
        chatButton.addEventListener('mouseenter', () => {
            chatButton.style.transform = 'scale(1.1)';
        });
        
        chatButton.addEventListener('mouseleave', () => {
            chatButton.style.transform = 'scale(1)';
        });
        
        // Toggle functionality
        let isOpen = false;
        chatButton.addEventListener('click', () => {
            if (isOpen) {
                chatWindow.style.display = 'none';
                chatButton.innerHTML = '💬';
                chatButton.style.background = '#007bff';
            } else {
                chatWindow.style.display = 'block';
                chatButton.innerHTML = '✕';
                chatButton.style.background = '#dc3545';
            }
            isOpen = !isOpen;
        });
        
        // Add to page
        document.body.appendChild(chatButton);
        document.body.appendChild(chatWindow);
        
        // Handle mobile responsiveness
        function handleResize() {
            if (window.innerWidth <= 768) {
                chatWindow.style.width = 'calc(100vw - 40px)';
                chatWindow.style.height = 'calc(100vh - 140px)';
                chatWindow.style.right = '20px';
                chatWindow.style.left = '20px';
            } else {
                chatWindow.style.width = '350px';
                chatWindow.style.height = '500px';
                chatWindow.style.right = '20px';
                chatWindow.style.left = 'auto';
            }
        }
        
        window.addEventListener('resize', handleResize);
        handleResize();
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createChatWidget);
    } else {
        createChatWidget();
    }
    
    // Global API
    window.popgChat = {
        open: function() {
            const button = document.getElementById('popg-chat-button');
            const window = document.getElementById('popg-chat-window');
            if (button && window) {
                window.style.display = 'block';
                button.innerHTML = '✕';
                button.style.background = '#dc3545';
            }
        },
        close: function() {
            const button = document.getElementById('popg-chat-button');
            const window = document.getElementById('popg-chat-window');
            if (button && window) {
                window.style.display = 'none';
                button.innerHTML = '💬';
                button.style.background = '#007bff';
            }
        }
    };
})();