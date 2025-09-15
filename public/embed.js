/**
 * POPG AI Chat Widget Embed Script
 * Easy one-line integration for any website
 */

(function() {
    'use strict';
    
    // Configuration options (can be customized via window.popgConfig)
    const config = {
        position: 'bottom-right', // bottom-right, bottom-left, top-right, top-left
        primaryColor: '#007bff',
        margin: '20px',
        zIndex: 10000,
        serverUrl: getServerUrl(),
        ...window.popgConfig
    };

    // Get the server URL from the script source
    function getServerUrl() {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.src && script.src.includes('/embed.js')) {
                const url = new URL(script.src);
                return `${url.protocol}//${url.host}`;
            }
        }
        // Fallback to current domain if script not found
        return window.location.protocol + '//' + window.location.host;
    }

    // Check if widget is already loaded
    if (window.popgWidgetLoaded) {
        return;
    }
    window.popgWidgetLoaded = true;

    // Create widget container
    function createWidget() {
        const widgetContainer = document.createElement('div');
        widgetContainer.id = 'popg-chat-widget-container';
        
        // Get position styles as object
        const positionStyles = getPositionStyles();
        
        widgetContainer.style.cssText = `
            position: fixed;
            bottom: ${positionStyles.bottom};
            right: ${positionStyles.right};
            left: ${positionStyles.left};
            top: ${positionStyles.top};
            z-index: ${config.zIndex};
            width: 350px;
            height: 500px;
            border: none;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            background: white;
            overflow: hidden;
            transition: all 0.3s ease;
            transform: scale(0);
            opacity: 0;
        `;

        // Create iframe for the widget
        const iframe = document.createElement('iframe');
        iframe.src = `${config.serverUrl}/widget-embed.html`;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 12px;
        `;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowtransparency', 'true');

        widgetContainer.appendChild(iframe);

        // Create toggle button
        const toggleButton = document.createElement('div');
        toggleButton.id = 'popg-chat-toggle';
        
        // Get button position styles
        const buttonStyles = getPositionStyles(true);
        
        toggleButton.style.cssText = `
            position: fixed;
            bottom: ${buttonStyles.bottom};
            right: ${buttonStyles.right};
            left: ${buttonStyles.left};
            top: ${buttonStyles.top};
            z-index: ${config.zIndex + 1};
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: ${config.primaryColor};
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: all 0.3s ease;
        `;
        
        toggleButton.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
        `;

        // Add hover effects
        toggleButton.addEventListener('mouseenter', () => {
            toggleButton.style.transform = 'scale(1.05)';
        });
        
        toggleButton.addEventListener('mouseleave', () => {
            toggleButton.style.transform = 'scale(1)';
        });

        // Toggle functionality
        let isOpen = false;
        toggleButton.addEventListener('click', () => {
            if (isOpen) {
                // Close widget
                widgetContainer.style.transform = 'scale(0)';
                widgetContainer.style.opacity = '0';
                toggleButton.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                    </svg>
                `;
            } else {
                // Open widget
                widgetContainer.style.transform = 'scale(1)';
                widgetContainer.style.opacity = '1';
                toggleButton.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                `;
            }
            isOpen = !isOpen;
        });

        // Add to page
        document.body.appendChild(widgetContainer);
        document.body.appendChild(toggleButton);

        // Handle responsive design
        function handleResize() {
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                widgetContainer.style.width = '100%';
                widgetContainer.style.height = '100%';
                widgetContainer.style.top = '0';
                widgetContainer.style.left = '0';
                widgetContainer.style.right = '0';
                widgetContainer.style.bottom = '0';
                widgetContainer.style.borderRadius = '0';
                widgetContainer.style.margin = '0';
            } else {
                widgetContainer.style.width = '350px';
                widgetContainer.style.height = '500px';
                widgetContainer.style.borderRadius = '12px';
                const positionStyles = getPositionStyles();
                Object.keys(positionStyles).forEach(key => {
                    widgetContainer.style[key] = positionStyles[key];
                });
            }
        }

        window.addEventListener('resize', handleResize);
        handleResize();
    }

    // Get position styles based on configuration
    function getPositionStyles(isButton = false) {
        const margin = config.margin;
        const buttonOffset = isButton ? '0' : '80px';
        
        switch (config.position) {
            case 'bottom-left':
                return {
                    bottom: isButton ? margin : buttonOffset,
                    left: margin,
                    right: 'auto',
                    top: 'auto'
                };
            case 'top-right':
                return {
                    top: isButton ? margin : buttonOffset,
                    right: margin,
                    left: 'auto',
                    bottom: 'auto'
                };
            case 'top-left':
                return {
                    top: isButton ? margin : buttonOffset,
                    left: margin,
                    right: 'auto',
                    bottom: 'auto'
                };
            default: // bottom-right
                return {
                    bottom: isButton ? margin : buttonOffset,
                    right: margin,
                    left: 'auto',
                    top: 'auto'
                };
        }
    }

    // Initialize widget when DOM is ready
    function initWidget() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createWidget);
        } else {
            createWidget();
        }
    }

    // Start initialization
    initWidget();

    // Expose global API for customization
    window.popgWidget = {
        open: function() {
            const toggle = document.getElementById('popg-chat-toggle');
            if (toggle && !toggle.classList.contains('open')) {
                toggle.click();
            }
        },
        close: function() {
            const toggle = document.getElementById('popg-chat-toggle');
            if (toggle && toggle.classList.contains('open')) {
                toggle.click();
            }
        },
        toggle: function() {
            const toggle = document.getElementById('popg-chat-toggle');
            if (toggle) {
                toggle.click();
            }
        }
    };
})();