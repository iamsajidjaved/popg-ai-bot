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
        return "⚠️ Unable to fetch current POPG price data.";
    }
    
    const formatPrice = (price) => `$${parseFloat(price).toFixed(5)}`;
    const formatTime = (timestamp) => {
        try {
            return new Date(timestamp).toLocaleString();
        } catch {
            return timestamp;
        }
    };
    
    return `## 💰 Current POPG Price

**Average Price:** ${formatPrice(priceData.average)}

### Price Sources:
| Source | Price | Last Updated |
|--------|-------|--------------|
| CoinMarketCap | ${formatPrice(priceData.coinmarketcap?.price || 'N/A')} | ${formatTime(priceData.coinmarketcap?.timestamp || 'N/A')} |
| CoinGecko | ${formatPrice(priceData.coingecko?.price || 'N/A')} | ${formatTime(priceData.coingecko?.timestamp || 'N/A')} |

*Data sourced from price.popg.com*`;
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

        const systemPrompt = `You are a helpful AI assistant for POPG.com and POP.VIP domains. Use the provided context to answer questions accurately about POPG services, features, and information.

Context from POPG domains:
${contextText}${priceContext}

CRITICAL FORMATTING INSTRUCTIONS:
- ALWAYS format your response using rich Markdown for maximum readability
- Structure information using headers (## for main topics, ### for subtopics)
- Use bullet points (•) for lists and numbered lists (1.) for sequences
- Create tables whenever comparing data, features, or presenting structured information
- Use **bold** for important points, *italics* for emphasis, and \`code\` for technical terms
- If answering about POPG price, present it in a formatted table with clear headers
- For complex topics, break information into clearly organized sections
- Always include relevant source links at the bottom when available
- Use blockquotes (>) for important announcements or highlights
- Present information in a scannable, well-organized format

PRICE QUERY HANDLING:
- If the user asks about POPG price and price data is provided in the context, use it prominently
- Format price information in clear, readable tables
- Include all available price sources (CoinMarketCap, CoinGecko)
- Show timestamps for price updates
- If no price data is available, clearly state this limitation

CONTENT GUIDELINES:
- Answer based primarily on the provided context from POPG.com and POP.VIP
- If context is insufficient, clearly state this limitation
- Be conversational, helpful, and professional
- Include specific details and examples when available
- For price queries, prominently display current pricing data
- Provide actionable information when possible

RESPONSE STRUCTURE:
1. Direct answer to the question (with appropriate header)
2. Supporting details in organized lists or tables
3. Additional relevant information if applicable
4. Source references at the end

Remember: Your goal is to provide comprehensive, well-formatted responses that are easy to read and understand.`;

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
 * Serve the chat interface
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    console.log('\n🤖 POPG AI Chatbot Server Started!');
    console.log('═'.repeat(50));
    console.log(`🌐 Server running at: http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`💬 Chat API: http://localhost:${PORT}/api/chat`);
    console.log('═'.repeat(50));
    
    // Check ChromaDB connection and knowledge base
    try {
        const collection = await chroma.getCollection({ name: 'popg_content' });
        const stats = await collection.count();
        console.log(`🔗 ChromaDB connection: ✅ Connected`);
        console.log(`📚 Knowledge base: ${stats} documents ready`);
        console.log(`⚙️  Mode: AI-powered (OpenAI + ChromaDB)`);
        console.log('\n✅ Ready to answer questions about POPG!');
        console.log('🔗 Open your browser and start chatting.');
    } catch (error) {
        console.log(`🔗 ChromaDB connection: ❌ Failed`);
        console.log(`📚 Knowledge base: Not found`);
        console.log(`⚙️  Status: System requires setup`);
        console.log('\n⚠️  Setup required:');
        console.log('   1. Ensure ChromaDB is running: docker-compose up -d');
        console.log('   2. Train the AI: npm run train');
        console.log('   3. Verify OpenAI API key in .env file');
        console.log('\n❌ Bot is not ready until setup is complete.');
    }
});

export default app;
