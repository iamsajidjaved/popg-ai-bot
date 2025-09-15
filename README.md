# POPG AI Chat Widget 🤖

A powerful embeddable AI chat widget for POPG.com that can answer questions about POPG's services, tokenomics, games, and platform features. Built with OpenAI embeddings and ChromaDB for intelligent semantic search.

![POPG AI Widget](https://img.shields.io/badge/AI-Powered-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-orange) ![Widget](https://img.shields.io/badge/Widget-Embeddable-purple)

## 🚀 Features

- **Embeddable Chat Widget**: Professional floating chat widget for any website
- **Smart Web Scraping**: Automatically crawls and indexes POPG.com content
- **AI-Powered Responses**: Uses OpenAI GPT-4 and embeddings for intelligent answers
- **Vector Search**: ChromaDB for fast and accurate semantic content retrieval
- **Modern UI**: Clean, responsive widget design with POPG branding
- **Easy Integration**: Simple one-line embed for any website
- **Mobile Optimized**: Works perfectly on all devices

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Scraper   │───▶│   ChromaDB       │───▶│  Chat Widget    │
│   (trainer.js)  │    │   (Embeddings)   │    │   (Frontend)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   POPG.com      │    │   OpenAI API     │    │   Express API   │
│   Content       │    │   Embeddings     │    │   (server.js)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **Docker** and **Docker Compose**
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

## ⚡ Quick Start

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd popg-ai-chatbot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your actual values
# Add your OpenAI API key and configure settings
```

### 4. Start ChromaDB
```bash
# Start the ChromaDB vector database
docker-compose up -d
```

### 5. Train the AI
```bash
# Scrape POPG.com and create embeddings
npm run train
```

### 6. Start the Chat Interface
```bash
# Launch the web server
npm start
```

### 7. View the Widget Demo
Navigate to `http://localhost:3000` to see the widget demo page! 🎉

## 💻 Widget Integration

### Easy Embed (Recommended)
Add this single line to any website:
```html
<script src="http://localhost:3000/embed"></script>
```

### Manual Integration
For more control, include the widget files manually:
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
     <!-- Widget content loaded automatically -->
</div>

<!-- Widget script -->
<script src="http://localhost:3000/widget.js"></script>
```

### Widget Configuration Options
```html
<div class="popg-chat-widget" id="popgChatWidget" 
     data-api-url="/api/chat"           <!-- API endpoint -->
     data-position="bottom-right"       <!-- bottom-right, bottom-left, top-right, top-left -->
     data-theme="light"                 <!-- light, dark -->
     data-auto-open="false"             <!-- true, false -->
     data-show-notification="true">     <!-- true, false -->
</div>
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following configuration:

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# ChromaDB Configuration
CHROMA_HOST=localhost
CHROMA_PORT=8000

# Training Configuration
TARGET_WEBSITE=https://popg.com

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Training Configuration

Modify the `CONFIG` object in `trainer.js` to customize scraping behavior:

```javascript
const CONFIG = {
    maxDepth: 1,           // How deep to crawl (levels)
    maxPages: 10,          // Maximum pages to scrape
    delay: 2000,           // Delay between requests (ms)
    timeout: 30000,        // Request timeout (ms)
    chunkSize: 300,        // Text chunk size for embeddings
    chunkOverlap: 50,      // Overlap between chunks
    batchSize: 1,          // Embeddings processed per batch
    maxContentSize: 100000 // Max content per page (chars)
};
```

## 📝 API Reference

### Chat Endpoint
```http
POST /api/chat
Content-Type: application/json

{
  "message": "What is POPG?",
  "conversationId": "optional-conversation-id"
}
```

### Health Check
```http
GET /api/health
```

### Collection Statistics
```http
GET /api/stats
```

## 🛠️ Development

### Project Structure
```
popg-ai-chatbot/
├── public/              # Frontend chat interface
│   ├── index.html      # Main chat page
│   ├── styles.css      # Styling
│   └── script.js       # Chat functionality
├── server.js           # Express API server
├── trainer.js          # Web scraping and training
├── docker-compose.yaml # ChromaDB setup
├── package.json        # Dependencies and scripts
└── README.md          # This file
```

### Available Scripts

- `npm start` - Start the chat server
- `npm run train` - Train the AI on POPG content
- `npm run dev` - Start server in development mode
- `docker-compose up -d` - Start ChromaDB
- `docker-compose down` - Stop ChromaDB

### Memory Management

For large datasets, run training with increased memory:

```bash
# For memory-intensive training
node --max-old-space-size=8192 --expose-gc trainer.js
```

## 🔍 Usage Examples

### Training Questions You Can Ask

- "What is POPG?"
- "How does POPG tokenomics work?"
- "What games does POPG offer?"
- "Tell me about POPG's NFT marketplace"
- "What is POPG's mission?"
- "How do I stake POPG tokens?"

### Custom Website Training

To train on a different website, update your `.env`:

```env
TARGET_WEBSITE=https://your-website.com
```

Then run the training:

```bash
npm run train
```

## 🚨 Troubleshooting

### Common Issues

**ChromaDB Connection Failed**
```bash
# Make sure ChromaDB is running
docker-compose up -d
# Check if container is running
docker ps
```

**OpenAI API Quota Exceeded**
- Check your OpenAI account billing and usage
- Verify your API key is correct in `.env`

**Memory Issues During Training**
- Reduce `maxPages` and `chunkSize` in CONFIG
- Run with increased memory allocation
- Process content in smaller batches

**Training Produces No Content**
- Check if the target website is accessible
- Verify the website doesn't block automated requests
- Check network connectivity

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 About POPG

This chatbot is specifically designed to provide information about POPG (Play-to-Earn Gaming Platform). Visit [POPG.com](https://popg.com) to learn more about their Web3 gaming ecosystem.

## 🙏 Acknowledgments

- [OpenAI](https://openai.com) for GPT-4 and embedding models
- [ChromaDB](https://www.trychroma.com/) for vector database
- [Cheerio](https://cheerio.js.org/) for web scraping
- [Express.js](https://expressjs.com/) for the web framework

---

**Built with ❤️ for the POPG community**