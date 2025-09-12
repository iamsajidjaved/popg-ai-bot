import axios from "axios";
import * as cheerio from 'cheerio';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

/**
 * Configuration for the POPG AI training scraper
 */
const CONFIG = {
    maxDepth: 1,
    maxPages: 3, // Further reduced for 8GB RAM
    delay: 1000,
    timeout: 30000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    chunkSize: 1200, // Even larger chunks = fewer embeddings
    chunkOverlap: 200,
    batchSize: 3,
    maxContentSize: 20000, // Much smaller content (20KB per page)
    embeddingBatchSize: 2, // Smaller embedding batches
    maxRetries: 3
};

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize ChromaDB
const chroma = new ChromaClient({
    path: `http://${process.env.CHROMA_HOST}:${process.env.CHROMA_PORT}`
});

/**
 * Normalizes a URL by resolving relative paths and removing fragments
 */
function normalizeUrl(url, baseUrl) {
    try {
        if (!url || url === '#' || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:')) {
            return null;
        }
        const absoluteUrl = new URL(url, baseUrl);
        absoluteUrl.hash = '';
        return absoluteUrl.toString();
    } catch (error) {
        return null;
    }
}

/**
 * Extracts clean text content from HTML
 */
function extractTextContent(html) {
    const $ = cheerio.load(html);

    // Remove script and style elements
    $('script, style, nav, footer, header, .sidebar, .menu, .navigation').remove();

    // Extract main content
    const mainContent = $('main, article, .content, .post, .entry, .article-content').first();
    const textContent = mainContent.length > 0 ? mainContent.text() : $('body').text();

    // Clean up the text
    return textContent
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();
}

/**
 * Splits text into chunks for better processing
 */
function splitTextIntoChunks(text, chunkSize = CONFIG.chunkSize, overlap = CONFIG.chunkOverlap) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.slice(start, end);

        if (chunk.trim().length > 50) { // Only include substantial chunks
            chunks.push(chunk.trim());
        }

        start = end - overlap;
        if (start >= text.length) break;
    }

    return chunks;
}

/**
 * Generates embeddings using OpenAI (with batching for efficiency)
 */
async function generateEmbeddings(textArray) {
    try {
        console.log(`     🔄 Generating ${textArray.length} embeddings...`);

        // For small batches, process individually to avoid API limits
        if (textArray.length === 1) {
            const response = await openai.embeddings.create({
                model: "text-embedding-ada-002", // Faster, cheaper model
                input: textArray[0],
            });
            return [response.data[0].embedding];
        }

        // For larger batches, send all at once
        const response = await openai.embeddings.create({
            model: "text-embedding-ada-002", // Faster, cheaper model
            input: textArray,
        });

        return response.data.map(item => item.embedding);

    } catch (error) {
        console.error('Error generating embeddings:', error.message);

        // Fallback: process one by one if batch fails
        if (textArray.length > 1) {
            console.log('     🔄 Fallback: Processing embeddings individually...');
            const embeddings = [];
            for (const text of textArray) {
                try {
                    const response = await openai.embeddings.create({
                        model: "text-embedding-ada-002",
                        input: text,
                    });
                    embeddings.push(response.data[0].embedding);
                    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
                } catch (individualError) {
                    console.error(`Failed to generate embedding for chunk: ${individualError.message}`);
                    throw individualError;
                }
            }
            return embeddings;
        }

        throw error;
    }
}

/**
 * Scrapes a single page and extracts content
 */
async function scrapePage(url) {
    try {
        console.log(`   📄 Scraping: ${url}`);

        const { data } = await axios.get(url, {
            timeout: CONFIG.timeout,
            headers: {
                'User-Agent': CONFIG.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 300; // default
            }
        });

        const $ = cheerio.load(data);

        // Extract metadata
        const title = $('title').text().trim() || 'Untitled';
        const description = $('meta[name="description"]').attr('content') || '';
        const keywords = $('meta[name="keywords"]').attr('content') || '';

        // Extract main content
        const textContent = extractTextContent(data);

        if (textContent.length < 100) {
            console.warn(`   ⚠️  Page has insufficient content: ${textContent.length} characters`);
            return null;
        }

        // Limit content size to prevent memory issues
        let finalContent = textContent;
        if (textContent.length > CONFIG.maxContentSize) {
            finalContent = textContent.substring(0, CONFIG.maxContentSize);
            console.warn(`   ⚠️  Content truncated from ${textContent.length} to ${CONFIG.maxContentSize} characters`);
        }

        // Extract internal links
        const baseHostname = new URL(url).hostname;
        const internalLinks = [];

        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const normalizedUrl = normalizeUrl(href, url);

            if (normalizedUrl) {
                const linkHostname = new URL(normalizedUrl).hostname;
                if (linkHostname === baseHostname) {
                    internalLinks.push(normalizedUrl);
                }
            }
        });

        console.log(`   ✅ Scraped: ${title} (${finalContent.length} chars, ${internalLinks.length} links)`);

        return {
            url,
            title,
            description,
            keywords,
            content: finalContent,
            internalLinks: [...new Set(internalLinks)] // Remove duplicates
        };

    } catch (error) {
        console.warn(`   ⚠️  Failed to scrape ${url}: ${error.message}`);

        // Try alternative approach for main domain
        if (url === 'https://popg.com') {
            console.log(`   🔄 Trying alternative URL: https://www.popg.com`);
            try {
                return await scrapePage('https://www.popg.com');
            } catch (altError) {
                console.warn(`   ⚠️  Alternative URL also failed: ${altError.message}`);
            }
        }

        return null;
    }
}

/**
 * Crawls website and collects all page content
 */
async function crawlWebsite(startUrl) {
    const baseHostname = new URL(startUrl).hostname;
    const visitedPages = new Set();
    const pagesToVisit = [{ url: startUrl, depth: 0 }];
    const scrapedContent = [];

    console.log(`🚀 Starting content crawl of: ${baseHostname}\n`);

    while (pagesToVisit.length > 0 && visitedPages.size < CONFIG.maxPages) {
        const { url, depth } = pagesToVisit.shift();

        if (visitedPages.has(url) || depth > CONFIG.maxDepth) {
            continue;
        }

        visitedPages.add(url);
        console.log(`📄 [Depth ${depth}] Processing page ${visitedPages.size}/${CONFIG.maxPages}`);

        const pageData = await scrapePage(url);

        if (pageData && pageData.content.length > 100) { // Only include pages with substantial content
            scrapedContent.push(pageData);

            // Add new internal links to crawl queue
            if (depth < CONFIG.maxDepth) {
                pageData.internalLinks.forEach(link => {
                    if (!visitedPages.has(link) && !pagesToVisit.some(p => p.url === link)) {
                        pagesToVisit.push({ url: link, depth: depth + 1 });
                    }
                });
            }
        }

        // Be respectful - add delay
        if (pagesToVisit.length > 0) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.delay));
        }
    }

    return scrapedContent;
}

/**
 * Stores content in ChromaDB with embeddings (batch processing)
 */
async function storeInChromaDB(scrapedContent) {
    try {
        console.log('\n📊 Processing content for ChromaDB...');

        // Create or get collection with simpler approach
        const collectionName = 'popg_content';
        let collection;

        try {
            // First, try to delete existing collection to start fresh
            try {
                await chroma.deleteCollection({ name: collectionName });
                console.log(`�️  Deleted existing collection: ${collectionName}`);
            } catch (deleteError) {
                // Collection doesn't exist, which is fine
                console.log(`📚 Collection ${collectionName} doesn't exist yet`);
            }

            // Create new collection
            collection = await chroma.createCollection({
                name: collectionName,
                metadata: { description: "POPG website content for AI chatbot" }
            });
            console.log(`📚 Created new collection: ${collectionName}`);

        } catch (error) {
            console.error('Error with collection management:', error.message);
            throw new Error(`Failed to setup ChromaDB collection: ${error.message}`);
        }

        let totalChunks = 0;

        // Process pages with aggressive memory management
        for (let pageIndex = 0; pageIndex < scrapedContent.length; pageIndex++) {
            const page = scrapedContent[pageIndex];
            console.log(`   🔄 Processing page ${pageIndex + 1}/${scrapedContent.length}: ${page.title}`);

            // Show memory usage
            const memUsage = process.memoryUsage();
            console.log(`   💾 Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB total`);

            // Split content into chunks
            const chunks = splitTextIntoChunks(page.content);
            console.log(`     📝 Split into ${chunks.length} chunks`);

            // Force garbage collection before processing chunks
            if (global.gc) {
                global.gc();
                console.log(`     🧹 Garbage collection completed`);
            }

            // Process chunks one by one to minimize memory usage
            console.log(`     📝 Processing ${chunks.length} chunks individually for memory efficiency`);

            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                const chunk = chunks[chunkIndex];

                console.log(`     ⚡ Chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} chars)`);

                try {
                    // Generate single embedding
                    const embedding = await generateEmbeddings([chunk]);

                    // Prepare metadata
                    const metadata = {
                        url: page.url,
                        title: page.title,
                        description: page.description,
                        keywords: page.keywords,
                        chunk_index: chunkIndex,
                        total_chunks: chunks.length,
                        page_index: pageIndex
                    };

                    // Generate unique ID
                    const id = `page_${pageIndex}_chunk_${chunkIndex}_${Date.now()}`;

                    // Store immediately
                    await collection.add({
                        documents: [chunk],
                        embeddings: embedding,
                        metadatas: [metadata],
                        ids: [id]
                    });

                    totalChunks++;
                    console.log(`     ✅ Stored chunk ${chunkIndex + 1}/${chunks.length} (Total: ${totalChunks})`);

                    // Force garbage collection if available
                    if (global.gc) {
                        global.gc();
                    }

                    // Memory-friendly pause
                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (chunkError) {
                    console.error(`     ❌ Failed to process chunk ${chunkIndex + 1}: ${chunkError.message}`);
                    // Continue with next chunk instead of failing completely
                }
            }
        }

        console.log(`✅ Successfully stored ${totalChunks} document chunks!`);

        return {
            totalPages: scrapedContent.length,
            totalChunks: totalChunks,
            collectionName: collectionName
        };

    } catch (error) {
        console.error('❌ Error storing in ChromaDB:', error);
        throw error;
    }
}

/**
 * Tests ChromaDB connection
 */
async function testChromaConnection() {
    try {
        console.log('🔗 Testing ChromaDB connection...');

        // Test basic connection
        const heartbeat = await chroma.heartbeat();
        console.log(`✅ ChromaDB heartbeat: ${heartbeat}`);

        // List collections to verify API access
        const collections = await chroma.listCollections();
        console.log(`✅ ChromaDB API accessible (${collections.length} existing collections)`);

        return true;
    } catch (error) {
        console.error('❌ ChromaDB connection failed:', error.message);
        console.error('💡 Make sure ChromaDB is running with: docker-compose up -d');
        throw new Error(`ChromaDB connection failed: ${error.message}`);
    }
}

/**
 * Main training function
 */
async function trainAIBot() {
    try {
        const startTime = Date.now();
        const targetUrl = process.env.TARGET_WEBSITE || 'https://popg.com';

        console.log('🤖 POPG AI Bot Training Process Started');
        console.log('='.repeat(50));
        console.log(`🎯 Target Website: ${targetUrl}`);
        console.log(`⚙️  Max Pages: ${CONFIG.maxPages}`);
        console.log(`⚙️  Max Depth: ${CONFIG.maxDepth}`);
        console.log('='.repeat(50));

        // Step 0: Test ChromaDB connection
        console.log('\n🔧 STEP 0: Testing Database Connection...');
        await testChromaConnection();

        // Step 1: Crawl website
        console.log('\n🕷️  STEP 1: Crawling Website...');
        const scrapedContent = await crawlWebsite(targetUrl);

        if (scrapedContent.length === 0) {
            throw new Error('No content was scraped from the website');
        }

        console.log(`✅ Crawled ${scrapedContent.length} pages successfully`);

        // Step 2: Store in ChromaDB
        console.log('\n🧠 STEP 2: Training AI with content...');
        const result = await storeInChromaDB(scrapedContent);

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        // Display final summary
        console.log('\n' + '🎉'.repeat(20));
        console.log('🎉 POPG AI BOT TRAINING COMPLETED! 🎉');
        console.log('🎉'.repeat(20));
        console.log('\n📊 TRAINING SUMMARY:');
        console.log('─'.repeat(40));
        console.log(`🌐 POPG Website: ${new URL(targetUrl).hostname}`);
        console.log(`⏱️  Training Time: ${duration} seconds`);
        console.log(`📄 Pages Processed: ${result.totalPages}`);
        console.log(`📝 Content Chunks: ${result.totalChunks}`);
        console.log(`🗃️  Collection: ${result.collectionName}`);
        console.log('─'.repeat(40));
        console.log('\n✅ Your POPG AI bot is now ready to answer questions!');
        console.log('💡 Run "npm start" to start the chat interface.');

    } catch (error) {
        console.error('\n❌ Training failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the training - always execute when this file is run
trainAIBot();
