# POPG AI Chat Widget - Testing Instructions

## 🚀 How to Test the Widget

### Method 1: Using the Server (Recommended)
1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and visit:
   - **Demo Page**: http://localhost:3000/demo
   - **Widget Only**: http://localhost:3000/widget
   - **Full App**: http://localhost:3000

### Method 2: Direct File Access (Limited)
- You can open `web.html` directly in your browser, but it will have limited functionality
- The widget will show an error message explaining that it needs server access
- API calls won't work due to CORS restrictions

## 📁 Widget Files

### Core Widget Files:
- `widget.html` - Widget HTML structure
- `widget.css` - Widget styling
- `widget.js` - Widget functionality

### Demo Files:
- `web.html` - Sample webpage with embedded widget
- `index.html` - Full chatbot interface

## 🔧 Embedding on Other Sites

### Simple Embed:
```html
<script src="http://localhost:3000/embed"></script>
```

### Manual Embed:
```html
<!-- Include dependencies -->
<link rel="stylesheet" href="http://localhost:3000/widget.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

<!-- Widget HTML -->
<div class="popg-chat-widget" id="popgChatWidget" 
     data-api-url="http://localhost:3000/api/chat"
     data-position="bottom-right"
     data-theme="light">
     <!-- Widget content here -->
</div>

<!-- Widget script -->
<script src="http://localhost:3000/widget.js"></script>
```

## 🎯 Features to Test

1. **Toggle Button**: Click the purple robot button
2. **Quick Actions**: Try the "What is POPG?" buttons
3. **Chat**: Type custom messages
4. **Minimize/Close**: Use header buttons
5. **Mobile**: Test on mobile devices
6. **Notifications**: Watch for notification badges

## 🐛 Troubleshooting

### CORS Errors:
- Make sure you're using the server (http://localhost:3000/demo)
- Don't open HTML files directly in browser

### Widget Not Loading:
- Check if server is running on port 3000
- Verify all dependencies are loaded
- Check browser console for errors

### API Not Working:
- Ensure ChromaDB is running: `docker-compose up -d`
- Check if training data exists: `npm run train`
- Verify OpenAI API key in `.env` file

## 📊 Server Routes

- `/` - Full chatbot interface
- `/demo` - Widget demo page
- `/widget` - Widget HTML only
- `/widget.css` - Widget stylesheet
- `/widget.js` - Widget JavaScript
- `/embed` - Embeddable script generator
- `/api/chat` - Chat API endpoint
- `/api/health` - Health check
- `/api/stats` - Database stats

## 💡 Tips

1. **Development**: Use `/demo` for testing
2. **Production**: Use `/embed` for external sites
3. **Customization**: Modify data attributes on widget element
4. **Debugging**: Check browser console for detailed logs