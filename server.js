import express from 'express';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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
 * Generates embeddings for user queries
 */
async function generateQueryEmbedding(query) {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: query,
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('Error generating query embedding:', error);
        throw error;
    }
}

/**
 * Searches for relevant content in ChromaDB
 */
async function searchRelevantContent(query, topK = 5) {
    try {
        // Get the POPG content collection
        const collection = await chroma.getCollection({ name: 'popg_content' });
        
        // Generate embedding for the query
        const queryEmbedding = await generateQueryEmbedding(query);
        
        // Search for similar content
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: topK,
            include: ['documents', 'metadatas', 'distances']
        });
        
        return results;
        
    } catch (error) {
        console.error('Error searching content:', error);
        throw error;
    }
}

/**
 * Generates AI response using OpenAI with context
 */
async function generateAIResponse(userQuery, relevantContent) {
    try {
        // Prepare context from relevant content
        const contextText = relevantContent.documents[0]
            .map((doc, index) => {
                const metadata = relevantContent.metadatas[0][index];
                return `Source: ${metadata.title} (${metadata.url})\nContent: ${doc}\n`;
            })
            .join('\n---\n');

        const systemPrompt = `You are a helpful AI assistant trained on content from POPG.com. Use the provided context to answer user questions accurately and helpfully about POPG services, features, and information.

Context from POPG.com:
${contextText}

Instructions:
- Answer based primarily on the provided context from POPG.com
- If the context doesn't contain enough information, say so clearly
- Be conversational and helpful
- Include relevant source URLs when appropriate
- Keep responses concise but informative
- Focus on POPG-related topics and services`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userQuery }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        return {
            response: response.choices[0].message.content,
            sources: relevantContent.metadatas[0].map(meta => ({
                title: meta.title,
                url: meta.url
            }))
        };
        
    } catch (error) {
        console.error('Error generating AI response:', error);
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
