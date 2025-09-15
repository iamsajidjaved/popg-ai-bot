# POPG AI Chat Widget - Easy Website Integration

## Quick Start (1 Line of Code!)

Simply add this single line to your website's HTML, just before the closing `</body>` tag:

```html
<script src="https://your-domain.com/embed.js"></script>
```

That's it! The POPG AI chat widget will automatically appear on your website.

## Step-by-Step Installation Guide

### For Complete Beginners:

1. **Find your website's HTML files**
   - If you use WordPress, use a plugin like "Insert Headers and Footers"
   - If you use Wix, go to Settings → Custom Code
   - If you use Squarespace, go to Settings → Advanced → Code Injection
   - If you have an HTML website, edit your HTML files

2. **Add the embed code**
   - Copy this line: `<script src="https://your-domain.com/embed.js"></script>`
   - Paste it just before the `</body>` tag in your HTML
   - Save your changes

3. **You're done!**
   - The chat widget will appear in the bottom-right corner of your website
   - Visitors can click the chat button to start conversations with POPG AI

## Customization Options

You can customize the widget by adding configuration before the embed script:

```html
<script>
window.popgConfig = {
    position: 'bottom-right',     // bottom-right, bottom-left, top-right, top-left
    primaryColor: '#007bff',      // Change the button color
    margin: '20px'                // Distance from screen edge
};
</script>
<script src="https://your-domain.com/embed.js"></script>
```

### Available Positions:
- `bottom-right` (default) - Bottom right corner
- `bottom-left` - Bottom left corner  
- `top-right` - Top right corner
- `top-left` - Top left corner

### Color Examples:
- `#007bff` - Blue (default)
- `#28a745` - Green
- `#dc3545` - Red
- `#ffc107` - Yellow
- `#6f42c1` - Purple

## Platform-Specific Instructions

### WordPress
1. Install the "Insert Headers and Footers" plugin
2. Go to Settings → Insert Headers and Footers
3. Paste the embed code in the "Scripts in Footer" section
4. Click "Save"

### Wix
1. Go to Settings in your site dashboard
2. Click on "Custom Code" under Advanced
3. Click "+ Add Custom Code"
4. Paste the embed code
5. Select "Body - end" for placement
6. Name it "POPG Chat Widget"
7. Click "Apply"

### Squarespace
1. Go to Settings → Advanced → Code Injection
2. Paste the embed code in the "Footer" section
3. Click "Save"

### Shopify
1. Go to Online Store → Themes
2. Click "Actions" → "Edit code"
3. Find the `theme.liquid` file
4. Paste the embed code before `</body>`
5. Click "Save"

### HTML Websites
1. Open your HTML file in a text editor
2. Find the `</body>` tag at the bottom
3. Paste the embed code just before it
4. Save the file

## Advanced Usage

### Control the Widget Programmatically

After the widget loads, you can control it with JavaScript:

```javascript
// Open the chat widget
window.popgWidget.open();

// Close the chat widget  
window.popgWidget.close();

// Toggle the chat widget
window.popgWidget.toggle();
```

### Example: Open chat when user clicks a button

```html
<button onclick="window.popgWidget.open()">
    Need Help? Chat with POPG AI
</button>
```

## Troubleshooting

### Widget not appearing?
- Make sure you pasted the code before the `</body>` tag
- Check if your website has Content Security Policy that blocks external scripts
- Ensure your website is live (not just a local file)

### Widget appears but doesn't work?
- Check your browser's console for any error messages
- Make sure your server is running and accessible
- Verify the embed.js URL is correct

### Mobile issues?
- The widget automatically adapts to mobile screens
- On mobile, it will fill the entire screen when opened
- The chat button remains visible and accessible

## Need Help?

If you're having trouble installing the widget:
1. Contact your web developer
2. Check your website platform's documentation
3. Many platforms offer live chat support for technical questions

## Security & Privacy

- The widget only loads content from your POPG AI server
- No personal data is transmitted without user interaction
- All communications are secured with HTTPS
- Users control what information they share in the chat

---

**Ready to get started?** Just copy and paste this one line into your website:

```html
<script src="https://your-domain.com/embed.js"></script>
```

*Replace `your-domain.com` with your actual server domain where POPG AI is hosted.*