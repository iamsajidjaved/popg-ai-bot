import express from 'express';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize ChromaDB
const chroma = new ChromaClient({
    path: `http://${process.env.CHROMA_HOST}:${process.env.CHROMA_PORT}`
});

/**
 * Fetches current POPG price from API
 */
async function fetchPOPGPrice() {
    try {
        console.log('💰 Fetching POPG price...');
        const response = await axios.get('https://price.popg.com/', {
            timeout: 5000,
            headers: {
                'User-Agent': 'POPG-AI-Bot/1.0'
            }
        });

        console.log('✅ POPG price fetched successfully');
        return response.data;
    } catch (error) {
        console.error('❌ Error fetching POPG price:', error.message);
        return null;
    }
}

/**
 * Formats price data for display
 */
function formatPriceData(priceData) {
    if (!priceData) {
        return "I apologize, but I cannot retrieve the current POPG price at this moment. Please try again later.";
    }

    const formatPrice = (price) => `$${parseFloat(price).toFixed(5)}`;
    
    return `The current POPG price is ${formatPrice(priceData.average)}.

Price information from different sources:
• CoinMarketCap: ${formatPrice(priceData.coinmarketcap?.price || 'N/A')}
• CoinGecko: ${formatPrice(priceData.coingecko?.price || 'N/A')}

This data is sourced from price.popg.com and is updated regularly.`;
}

/**
 * Generates embeddings for user queries (optimized)
 */
async function generateQueryEmbedding(query) {
    try {
        // Cache key for potential future caching implementation
        const startTime = Date.now();

        const response = await openai.embeddings.create({
            model: "text-embedding-ada-002", // Matches training model
            input: query.trim(), // Clean input
            encoding_format: "float", // More efficient
        });

        const duration = Date.now() - startTime;
        console.log(`🔍 Query embedding generated in ${duration}ms`);

        return response.data[0].embedding;
    } catch (error) {
        console.error('❌ Error generating query embedding:', error);
        throw error;
    }
}

/**
 * Searches for relevant content in ChromaDB (optimized)
 */
async function searchRelevantContent(query, topK = 8) { // Increased for better context
    try {
        const searchStart = Date.now();

        // Get the POPG content collection
        const collection = await chroma.getCollection({ name: 'popg_content' });

        // Generate embedding for the query
        const queryEmbedding = await generateQueryEmbedding(query);

        // Search for similar content with optimized parameters
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: topK,
            include: ['documents', 'metadatas', 'distances'],
            // Add where clause for quality filtering if needed
        });

        const searchDuration = Date.now() - searchStart;
        console.log(`🔍 Content search completed in ${searchDuration}ms (${results.documents[0].length} results)`);

        // Log relevance scores for debugging
        if (results.distances && results.distances[0]) {
            const avgDistance = results.distances[0].reduce((a, b) => a + b, 0) / results.distances[0].length;
            console.log(`📊 Average relevance distance: ${avgDistance.toFixed(4)}`);
        }

        return results;

    } catch (error) {
        console.error('❌ Error searching content:', error);
        throw error;
    }
}

/**
 * Generates AI response using OpenAI with context (enhanced formatting)
 */
async function generateAIResponse(userQuery, relevantContent) {
    try {
        const responseStart = Date.now();

        // Check if user is asking about POPG price (more flexible detection)
        const isPriceQuery = (/price|cost|value|worth|usd|dollar|\$|trading|market|current/i.test(userQuery) &&
            /popg/i.test(userQuery)) ||
            /popg.*price/i.test(userQuery) ||
            /price.*popg/i.test(userQuery);

        let priceData = null;
        let priceContext = '';

        if (isPriceQuery) {
            console.log('💰 Price query detected, fetching POPG price...');
            priceData = await fetchPOPGPrice();
            if (priceData) {
                console.log('✅ Price data retrieved:', priceData);
                priceContext = `\n\nCurrent POPG Price Data:
- Average Price: $${priceData.average}
- CoinMarketCap: $${priceData.coinmarketcap?.price || 'N/A'} (Updated: ${priceData.coinmarketcap?.timestamp || 'N/A'})
- CoinGecko: $${priceData.coingecko?.price || 'N/A'} (Updated: ${priceData.coingecko?.timestamp || 'N/A'})`;
            } else {
                console.log('❌ Failed to retrieve price data');
            }
        }

        // Filter and optimize context - only use most relevant results
        const topResults = relevantContent.documents[0].slice(0, 6); // Increased for better context
        const topMetadata = relevantContent.metadatas[0].slice(0, 6);

        // Prepare optimized context
        const contextText = topResults
            .map((doc, index) => {
                const metadata = topMetadata[index];
                // Truncate very long documents to control token usage
                const truncatedDoc = doc.length > 1000 ? doc.substring(0, 1000) + '...' : doc;
                return `**Source:** ${metadata.title} (${metadata.url})\n**Content:** ${truncatedDoc}`;
            })
            .join('\n\n---\n\n');

        // Calculate estimated tokens for cost tracking
        const estimatedTokens = Math.ceil((contextText.length + userQuery.length + priceContext.length) * 1.3);
        console.log(`📊 Estimated tokens: ${estimatedTokens} (~$${(estimatedTokens / 1000 * 0.00015).toFixed(6)})`);

        const systemPrompt = `You are a professional AI assistant for POPG.com and POP.VIP domains. You represent POPG with expertise and attention to detail. Use the provided context to deliver comprehensive, well-structured answers.

Context from POPG domains:
${contextText}${priceContext}

PROFESSIONAL RESPONSE STANDARDS:
- Provide detailed, accurate, and well-researched information
- Use clear, professional language suitable for business communication
- Structure responses with logical flow and clear sections
- Be thorough but concise - cover all relevant aspects
- Demonstrate expertise while remaining accessible

RESPONSE FORMATTING GUIDELINES:
- Use clear headings with **bold** formatting for main topics
- Organize information in logical sections and subsections
- Use bullet points (•) for lists and key features
- Include specific details, numbers, and concrete examples
- Provide actionable information and next steps when relevant
- Use professional spacing with line breaks between sections

STRUCTURE TEMPLATE:
1. **Direct Answer** - Clear, immediate response to the question
2. **Key Details** - Supporting information and specifics
3. **Additional Context** - Relevant background or related information
4. **Next Steps** - Actionable recommendations (when applicable)

LINK FORMATTING GUIDELINES:
- Always format links properly using markdown: [Link Text](URL)
- For social media links, use clean, readable format
- Group similar links under clear headings
- Ensure all URLs are clickable and properly formatted

CONTACT INFORMATION FORMATTING:
When providing POPG team contact information, use this exact format:

**Social Media Channels:**
• Twitter (X): [POPG Token](https://x.com/popgtoken)
• Facebook: [POPG Token](https://www.facebook.com/POPGtoken/)
• Instagram: [POPG Token](https://www.instagram.com/POPGtoken/)
• YouTube: [POPG Community](https://www.youtube.com/@PopgtokenCommunity)
• Discord: [POPG Discord](https://discord.gg/popgtoken)
• Telegram: [POPG Telegram](https://t.me/POPGtoken)

**Official Support:**
• Visit the POPG website for contact forms and comprehensive support options

PRICE INFORMATION HANDLING:
- Present current pricing data with clear labels and sources
- Include timestamp information when available
- Explain price variations and market context
- Format price data in clean, readable sections
- Use simple formatting (avoid complex tables)

QUALITY STANDARDS:
- Every response should demonstrate deep understanding
- Include relevant context and background information
- Anticipate follow-up questions and address them proactively
- Maintain consistency in tone and formatting
- Ensure all information is accurate and up-to-date
- Be comprehensive yet focused on the user's specific question

ERROR HANDLING:
- If information is incomplete, clearly state limitations
- Provide alternative resources when primary information is unavailable
- Suggest specific questions that could provide better assistance
- Always maintain professional demeanor even when data is limited

Remember: You represent POPG professionally. Every response should reflect expertise, attention to detail, and commitment to providing exceptional service.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Most cost-effective GPT-4 model
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userQuery }
            ],
            temperature: 0.7,
            max_tokens: 800, // Increased for comprehensive formatted responses
            presence_penalty: 0.1,
            frequency_penalty: 0.1,
        });

        const responseDuration = Date.now() - responseStart;
        const actualTokens = response.usage.total_tokens;
        const cost = actualTokens / 1000 * 0.00015;

        console.log(`🤖 AI response generated in ${responseDuration}ms`);
        console.log(`📊 Actual tokens used: ${actualTokens} ($${cost.toFixed(6)})`);

        let formattedResponse = response.choices[0].message.content;

        // If this was a price query and we have price data, append formatted price info
        if (isPriceQuery && priceData) {
            formattedResponse += `\n\n${formatPriceData(priceData)}`;
        }

        return {
            response: formattedResponse,
            sources: topMetadata.map(meta => ({
                title: meta.title,
                url: meta.url
            })),
            priceData: priceData,
            metadata: {
                tokens: actualTokens,
                cost: cost,
                responseTime: responseDuration,
                includedPrice: isPriceQuery
            }
        };

    } catch (error) {
        console.error('❌ Error generating AI response:', error);
        throw error;
    }
}

// API Routes

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'AI Chatbot API'
    });
});

/**
 * Chat endpoint - Main AI interaction
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationId } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                error: 'Message is required'
            });
        }

        console.log(`💬 New query: "${message}"`);

        // Search for relevant content using ChromaDB
        const relevantContent = await searchRelevantContent(message.trim());

        if (!relevantContent.documents[0] || relevantContent.documents[0].length === 0) {
            return res.json({
                response: "I apologize, but I couldn't find relevant information in my knowledge base to answer your question. Please make sure the AI has been trained on POPG content by running 'npm run train' first.",
                sources: [],
                conversationId: conversationId || Date.now().toString()
            });
        }

        // Generate AI response using OpenAI
        const aiResult = await generateAIResponse(message.trim(), relevantContent);

        console.log(`✅ Response generated successfully`);

        res.json({
            response: aiResult.response,
            sources: aiResult.sources,
            conversationId: conversationId || Date.now().toString(),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chat API error:', error);

        let errorMessage = 'Internal server error. Please try again later.';

        if (error.message.includes('Collection popg_content does not exist')) {
            errorMessage = 'The AI knowledge base has not been created yet. Please run "npm run train" to train the AI on POPG content first.';
        } else if (error.message.includes('quota') || error.message.includes('401')) {
            errorMessage = 'OpenAI API issue detected. Please check your API key and quota in the .env file.';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ChromaNotFoundError')) {
            errorMessage = 'ChromaDB connection failed. Please ensure ChromaDB is running with "docker-compose up -d".';
        }

        res.status(500).json({
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Get collection stats
 */
app.get('/api/stats', async (req, res) => {
    try {
        const collection = await chroma.getCollection({ name: 'popg_content' });
        const count = await collection.count();

        res.json({
            totalDocuments: count,
            collectionName: 'popg_content',
            website: 'POPG.com',
            status: 'ready'
        });

    } catch (error) {
        console.error('Stats API error:', error);
        res.status(500).json({
            error: 'Could not retrieve stats',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Serve the widget demo page as main page
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Serve the chat widget demo page
 */
app.get('/demo', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Serve the widget files for embedding
 */
app.get('/widget', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'widget.html'));
});

app.get('/simple-chat.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'simple-chat.html'));
});

app.get('/simple-embed.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(path.join(__dirname, 'public', 'simple-embed.js'));
});

app.get('/widget-embed.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'widget-embed.html'));
});

app.get('/chat-interface.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat-interface.html'));
});

app.get('/widget.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'public', 'widget.css'));
});

app.get('/widget.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});

// Serve embed script with proper headers for cross-origin use
app.get('/embed.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.sendFile(path.join(__dirname, 'public', 'embed.js'));
});

/**
 * Widget embed script - generates embeddable code
 */
app.get('/embed', (req, res) => {
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;
    
    const embedCode = `
(function() {
    // Load widget CSS
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '${baseUrl}/widget.css';
    document.head.appendChild(css);
    
    // Load marked.js for markdown parsing
    var marked = document.createElement('script');
    marked.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    document.head.appendChild(marked);
    
    // Load FontAwesome
    var fa = document.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fa);
    
    // Load Inter font
    var font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(font);
    
    // Create widget HTML
    var widgetHtml = \`
        <div class="popg-chat-widget" id="popgChatWidget" 
             data-api-url="${baseUrl}/api/chat"
             data-position="bottom-right"
             data-theme="light"
             data-auto-open="false"
             data-show-notification="true">
            
            <div class="chat-toggle" id="chatToggle">
                <div class="toggle-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="toggle-notification" id="toggleNotification">
                    <span>1</span>
                </div>
            </div>

            <div class="chat-window" id="chatWindow">
                <div class="chat-header">
                    <div class="header-info">
                        <div class="bot-avatar">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="bot-details">
                            <h3>POPG AI Assistant</h3>
                            <p class="status-text">
                                <span class="status-dot"></span>
                                Online
                            </p>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button class="action-btn minimize-btn" id="minimizeBtn" title="Minimize">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="action-btn close-btn" id="closeBtn" title="Close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div class="chat-content">
                    <div class="welcome-section" id="welcomeSection">
                        <div class="welcome-avatar">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="welcome-text">
                            <h4>👋 Hi! I'm POPG AI</h4>
                            <p>I can help you with information about POPG services, features, pricing, and more!</p>
                        </div>
                        <div class="quick-actions">
                            <button class="quick-btn" data-message="What is POPG?">
                                <i class="fas fa-info-circle"></i>
                                What is POPG?
                            </button>
                            <button class="quick-btn" data-message="Why choose POPG over others?">
                                <i class="fas fa-star"></i>
                                Why choose POPG over others?
                            </button>
                            <button class="quick-btn" data-message="How do fans benefit from POPG?">
                                <i class="fas fa-gift"></i>
                                How do fans benefit from POPG?
                            </button>
                            <button class="quick-btn" data-message="Can POPG unlock exclusive perks?">
                                <i class="fas fa-unlock"></i>
                                Can POPG unlock exclusive perks?
                            </button>
                            <button class="quick-btn" data-message="Does POPG reward loyalty?">
                                <i class="fas fa-heart"></i>
                                Does POPG reward loyalty?
                            </button>
                            <button class="quick-btn" data-message="How does POPG connect with iGaming?">
                                <i class="fas fa-gamepad"></i>
                                How does POPG connect with iGaming?
                            </button>
                            <button class="quick-btn" data-message="Is POPG safe and legal?">
                                <i class="fas fa-shield-alt"></i>
                                Is POPG safe and legal?
                            </button>
                            <button class="quick-btn" data-message="Who supports POPG?">
                                <i class="fas fa-users"></i>
                                Who supports POPG?
                            </button>
                            <button class="quick-btn" data-message="Where can I see POPG's live price?">
                                <i class="fas fa-chart-line"></i>
                                Where can I see POPG's live price?
                            </button>
                            <button class="quick-btn" data-message="How can the community join POPG?">
                                <i class="fas fa-user-plus"></i>
                                How can the community join POPG?
                            </button>
                            <button class="quick-btn" data-message="How can I contact the POPG team?">
                                <i class="fas fa-envelope"></i>
                                How can I contact the POPG team?
                            </button>
                        </div>
                    </div>

                    <div class="chat-messages" id="chatMessages"></div>

                    <div class="typing-indicator" id="typingIndicator" style="display: none;">
                        <div class="typing-avatar">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>

                <div class="chat-input">
                    <form class="input-form" id="inputForm">
                        <div class="input-container">
                            <input 
                                type="text" 
                                id="messageInput" 
                                placeholder="Ask me about POPG..."
                                maxlength="500"
                                autocomplete="off"
                            >
                            <button type="submit" class="send-btn" id="sendBtn">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </form>
                    <div class="input-footer">
                        <span class="powered-by">
                            Powered by <strong>POPG AI</strong>
                        </span>
                    </div>
                </div>
            </div>

            <div class="error-toast" id="errorToast">
                <div class="error-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span class="error-message" id="errorMessage"></span>
                </div>
            </div>
        </div>
    \`;
    
    // Wait for dependencies to load, then create widget
    function initWidget() {
        if (typeof marked === 'undefined') {
            setTimeout(initWidget, 100);
            return;
        }
        
        // Add widget HTML to body
        document.body.insertAdjacentHTML('beforeend', widgetHtml);
        
        // Load widget script
        var script = document.createElement('script');
        script.src = '${baseUrl}/widget.js';
        document.head.appendChild(script);
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }
})();`;

    res.setHeader('Content-Type', 'application/javascript');
    res.send(embedCode);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, async () => {
    console.log('\n🤖 POPG AI Chat Widget Server Started!');
    console.log('═'.repeat(50));
    console.log(`🌐 Widget Demo: http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`💬 Chat API: http://localhost:${PORT}/api/chat`);
    console.log(`🔗 Widget embed: http://localhost:${PORT}/embed`);
    console.log('═'.repeat(50));

    // Check ChromaDB connection and knowledge base
    try {
        const collection = await chroma.getCollection({ name: 'popg_content' });
        const stats = await collection.count();
        console.log(`🔗 ChromaDB connection: ✅ Connected`);
        console.log(`📚 Knowledge base: ${stats} documents ready`);
        console.log(`⚙️  Mode: AI-powered widget (OpenAI + ChromaDB)`);
        console.log('\n✅ Widget ready for embedding on POPG.com!');
        console.log('🔗 Visit the demo page to test the widget.');
    } catch (error) {
        console.log(`🔗 ChromaDB connection: ❌ Failed`);
        console.log(`📚 Knowledge base: Not found`);
        console.log(`⚙️  Status: System requires setup`);
        console.log('\n⚠️  Setup required:');
        console.log('   1. Ensure ChromaDB is running: docker-compose up -d');
        console.log('   2. Train the AI: npm run train');
        console.log('   3. Verify OpenAI API key in .env file');
        console.log('\n❌ Widget is not ready until setup is complete.');
    }
});

export default app;
