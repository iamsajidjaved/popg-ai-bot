# POPG AI Chatbot

A smart AI chatbot specifically trained on POPG.com content using OpenAI and ChromaDB. The bot can answer questions about POPG services, features, and any information available on the POPG website through a clean chat interface.

## 🚀 Features

- **POPG Content Training**: Automatically scrapes and processes all POPG.com content
- **AI-Powered Responses**: Uses OpenAI GPT models for intelligent answers about POPG
- **Vector Search**: ChromaDB for efficient semantic search of POPG content
- **Clean Chat UI**: Modern, responsive chat interface
- **Source Attribution**: Shows which POPG pages were used to answer questions
- **Real-time Status**: Connection status and document count
- **Mobile Responsive**: Works on all devices

## 📋 Prerequisites

- Node.js 18+ installed
- Docker (for ChromaDB)
- OpenAI API key

## 🛠️ Installation

1. **Clone and Setup**
   ```bash
   git clone <your-repo>
   cd webpage-ai
   npm install
   ```

2. **Start ChromaDB**
   ```bash
   docker-compose up -d
   ```

3. **Configure Environment**
   
   Your `.env` file should already contain your OpenAI API key for POPG.com:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   CHROMA_HOST=localhost
   CHROMA_PORT=8000
   PORT=3000
   TARGET_WEBSITE=https://popg.com
   ```

## 🚦 Quick Start

### Step 1: Train the POPG AI Bot

Train the bot on POPG.com content:

```bash
npm run train
```

This will:
- Scrape POPG.com website content
- Extract and clean content from each page
- Generate embeddings using OpenAI
- Store everything in ChromaDB

### Step 2: Start the Chat Server

```bash
npm start
```

### Step 3: Open the Chat Interface

Visit `http://localhost:3000` in your browser and start asking questions about POPG!

## 🎯 Usage

### API Endpoints

- `GET /` - POPG chat interface
- `POST /api/chat` - Send message to POPG AI bot
- `GET /api/health` - Server health check
- `GET /api/stats` - POPG document statistics

### Chat API Example

```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "What services does POPG offer?",
    conversationId: "unique-conversation-id"
  })
});

const data = await response.json();
console.log(data.response);
```

## ⚙️ Configuration

### Crawler Settings

Edit `trainer.js` to adjust crawling behavior:

```javascript
const CONFIG = {
    maxDepth: 3,        // How deep to crawl
    maxPages: 100,      // Maximum pages to process
    delay: 1000,        // Delay between requests (ms)
    chunkSize: 1000,    // Text chunk size for embeddings
    chunkOverlap: 200   // Overlap between chunks
};
```

### OpenAI Model

Change the AI model in `server.js`:

```javascript
const response = await openai.chat.completions.create({
    model: "gpt-4",  // or "gpt-3.5-turbo"
    // ...
});
```

## 🔧 Troubleshooting

### ChromaDB Connection Issues

1. Make sure Docker is running
2. Check if ChromaDB container is up:
   ```bash
   docker ps
   ```
3. Restart ChromaDB:
   ```bash
   docker-compose restart
   ```

### OpenAI API Errors

1. Verify your API key is correct
2. Check your OpenAI account has sufficient credits
3. Ensure the API key has proper permissions

### Training Fails

1. Check if the target website is accessible
2. Verify the website allows scraping (robots.txt)
3. Try reducing `maxPages` for initial testing

## 📁 Project Structure

```
webpage-ai/
├── public/                 # Frontend files
│   ├── index.html         # Chat interface
│   ├── styles.css         # UI styles
│   └── script.js          # Frontend logic
├── server.js              # Express server & AI logic
├── trainer.js             # Website scraper & training
├── scraper.js             # Original scraper (backup)
├── docker-compose.yaml    # ChromaDB setup
├── package.json           # Dependencies
├── .env                   # Environment variables
└── README.md             # This file
```

## 🤖 How It Works

1. **Content Extraction**: The trainer scrapes web pages and extracts clean text content
2. **Text Processing**: Content is split into chunks with overlap for better context
3. **Embeddings**: Each chunk is converted to vector embeddings using OpenAI
4. **Storage**: Embeddings and metadata are stored in ChromaDB
5. **Query Processing**: User questions are converted to embeddings
6. **Semantic Search**: ChromaDB finds the most relevant content chunks
7. **AI Response**: OpenAI generates responses using the relevant context

## 🌟 Advanced Features

### Custom Prompts

Modify the system prompt in `server.js` to change the bot's behavior:

```javascript
const systemPrompt = `You are a helpful assistant...`;
```

### Source Filtering

Add logic to filter or prioritize certain sources:

```javascript
// In trainer.js - filter pages during scraping
if (url.includes('/admin/') || url.includes('/private/')) {
    return null; // Skip private pages
}
```

### Custom Metadata

Add more metadata during training:

```javascript
metadatas.push({
    url: page.url,
    title: page.title,
    category: extractCategory(page.url),
    lastModified: new Date().toISOString(),
    // ... more custom fields
});
```

## 📄 License

MIT License - feel free to use this project for your own applications!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 💡 Tips

- Start with a small website for testing
- Monitor your OpenAI usage to control costs
- Use the original `scraper.js` for analyzing link structures
- Check browser console for debugging frontend issues
- Use `npm run dev` for development with auto-restart

---

**Happy Chatting! 🎉**
