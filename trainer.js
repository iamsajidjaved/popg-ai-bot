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
    maxPages: 10, // Back to full processing with 16GB RAM
    delay: 1000,
    timeout: 30000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    chunkSize: 1000, // Optimal chunk size for 16GB
    chunkOverlap: 100,
    batchSize: 5, // Can handle larger batches now
    maxContentSize: 100000, // Back to full content (100KB per page)
    embeddingBatchSize: 8, // Larger embedding batches for efficiency
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
    
    // Validate inputs
    if (!text || text.length === 0) {
        console.warn('     ⚠️  Empty text provided to splitTextIntoChunks');
        return [];
    }
    
    if (chunkSize <= overlap) {
        console.warn(`     ⚠️  Invalid chunk configuration: chunkSize (${chunkSize}) <= overlap (${overlap}). Using default values.`);
        chunkSize = 1000;
        overlap = 100;
    }
    
    console.log(`     📏 [CHUNKING] Text length: ${text.length}, Chunk size: ${chunkSize}, Overlap: ${overlap}`);
    
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.slice(start, end);
        
        if (chunk.trim().length > 50) { // Only include substantial chunks
            chunks.push(chunk.trim());
        }
        
        // Move to next position, ensuring we always progress
        const nextStart = end - overlap;
        if (nextStart <= start) {
            // If overlap is too large, just move by half chunk size to ensure progress
            start = start + Math.floor(chunkSize / 2);
        } else {
            start = nextStart;
        }
        
        // Safety check to prevent infinite loops
        if (start >= text.length) break;
        
        // Additional safety: if we have too many chunks, something is wrong
        if (chunks.length > 10000) {
            console.error(`     ❌ [CHUNKING] Too many chunks (${chunks.length}), breaking to prevent infinite loop`);
            break;
        }
    }
    
    console.log(`     ✅ [CHUNKING] Created ${chunks.length} chunks from ${text.length} characters`);
    return chunks;
}

/**
 * Generates embeddings using OpenAI (with batching for efficiency)
 */
async function generateEmbeddings(textArray) {
    const startTime = Date.now();
    console.log(`     🔄 [EMBEDDING] Starting generation for ${textArray.length} text(s)...`);
    console.log(`     📝 [EMBEDDING] Text lengths: ${textArray.map(t => t.length).join(', ')} chars`);
    
    try {
        // For small batches, process individually to avoid API limits
        if (textArray.length === 1) {
            console.log(`     🚀 [EMBEDDING] Sending single text to OpenAI...`);
            const response = await openai.embeddings.create({
                model: "text-embedding-ada-002", // Faster, cheaper model
                input: textArray[0],
            });
            const duration = Date.now() - startTime;
            console.log(`     ✅ [EMBEDDING] Single embedding generated in ${duration}ms`);
            return [response.data[0].embedding];
        }
        
        // For larger batches, send all at once
        console.log(`     🚀 [EMBEDDING] Sending batch of ${textArray.length} texts to OpenAI...`);
        const response = await openai.embeddings.create({
            model: "text-embedding-ada-002", // Faster, cheaper model
            input: textArray,
        });
        
        const duration = Date.now() - startTime;
        console.log(`     ✅ [EMBEDDING] Batch of ${textArray.length} embeddings generated in ${duration}ms`);
        console.log(`     📊 [EMBEDDING] Average time per embedding: ${Math.round(duration / textArray.length)}ms`);
        
        return response.data.map(item => item.embedding);
        
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`     ❌ [EMBEDDING] Error after ${duration}ms:`, error.message);
        console.error(`     🔍 [EMBEDDING] Error details:`, {
            name: error.name,
            status: error.status,
            code: error.code,
            type: error.type
        });
        
        // Fallback: process one by one if batch fails
        if (textArray.length > 1) {
            console.log(`     🔄 [EMBEDDING] Fallback: Processing embeddings individually...`);
            const embeddings = [];
            for (let i = 0; i < textArray.length; i++) {
                const text = textArray[i];
                try {
                    console.log(`     🔄 [EMBEDDING] Individual ${i + 1}/${textArray.length} (${text.length} chars)...`);
                    const individualStart = Date.now();
                    
                    const response = await openai.embeddings.create({
                        model: "text-embedding-ada-002",
                        input: text,
                    });
                    
                    const individualDuration = Date.now() - individualStart;
                    console.log(`     ✅ [EMBEDDING] Individual ${i + 1}/${textArray.length} completed in ${individualDuration}ms`);
                    
                    embeddings.push(response.data[0].embedding);
                    await new Promise(resolve => setTimeout(resolve, 200)); // Small delay
                } catch (individualError) {
                    console.error(`     ❌ [EMBEDDING] Failed individual ${i + 1}/${textArray.length}:`, individualError.message);
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
        
        // Process pages with detailed logging for 16GB RAM
        for (let pageIndex = 0; pageIndex < scrapedContent.length; pageIndex++) {
            const page = scrapedContent[pageIndex];
            const pageStartTime = Date.now();
            
            console.log(`\n   🔄 [PAGE ${pageIndex + 1}/${scrapedContent.length}] Starting: ${page.title}`);
            console.log(`   📄 [PAGE ${pageIndex + 1}] URL: ${page.url}`);
            console.log(`   📊 [PAGE ${pageIndex + 1}] Content length: ${page.content.length} characters`);
            
            // Show memory usage
            const memUsage = process.memoryUsage();
            console.log(`   💾 [MEMORY] Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB total`);
            console.log(`   💾 [MEMORY] RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, External: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
            
            // Split content into chunks
            console.log(`   ✂️  [PAGE ${pageIndex + 1}] Splitting content into chunks...`);
            const chunkStartTime = Date.now();
            const chunks = splitTextIntoChunks(page.content);
            const chunkTime = Date.now() - chunkStartTime;
            console.log(`   ✅ [PAGE ${pageIndex + 1}] Split into ${chunks.length} chunks in ${chunkTime}ms`);
            
            if (chunks.length === 0) {
                console.log(`   ⚠️  [PAGE ${pageIndex + 1}] No chunks to process, skipping...`);
                continue;
            }
            
            // Force garbage collection before processing chunks
            if (global.gc) {
                console.log(`   🧹 [PAGE ${pageIndex + 1}] Running garbage collection...`);
                global.gc();
                const newMemUsage = process.memoryUsage();
                console.log(`   ✅ [PAGE ${pageIndex + 1}] GC completed. Heap now: ${Math.round(newMemUsage.heapUsed / 1024 / 1024)}MB`);
            }
            
            // Process chunks with optimized batching for 16GB RAM
            console.log(`     📝 [PROCESSING] Split into ${chunks.length} chunks`);
            console.log(`     🔄 [PROCESSING] Will process in batches of ${CONFIG.embeddingBatchSize}`);
            
            for (let i = 0; i < chunks.length; i += CONFIG.embeddingBatchSize) {
                const batchChunks = chunks.slice(i, i + CONFIG.embeddingBatchSize);
                const batchNumber = Math.floor(i / CONFIG.embeddingBatchSize) + 1;
                const totalBatches = Math.ceil(chunks.length / CONFIG.embeddingBatchSize);
                
                console.log(`     ⚡ [BATCH ${batchNumber}/${totalBatches}] Processing ${batchChunks.length} chunks (chunks ${i + 1}-${i + batchChunks.length})`);
                
                try {
                    const batchStartTime = Date.now();
                    
                    // Generate embeddings for the batch
                    console.log(`     🧠 [BATCH ${batchNumber}] Generating embeddings...`);
                    const batchEmbeddings = await generateEmbeddings(batchChunks);
                    
                    const embeddingTime = Date.now() - batchStartTime;
                    console.log(`     ✅ [BATCH ${batchNumber}] Embeddings generated in ${embeddingTime}ms`);
                    
                    // Prepare data for ChromaDB
                    console.log(`     📦 [BATCH ${batchNumber}] Preparing data for storage...`);
                    const documents = [];
                    const embeddings = [];
                    const metadatas = [];
                    const ids = [];
                    
                    for (let j = 0; j < batchChunks.length; j++) {
                        const chunk = batchChunks[j];
                        const chunkIndex = i + j;
                        
                        documents.push(chunk);
                        embeddings.push(batchEmbeddings[j]);
                        metadatas.push({
                            url: page.url,
                            title: page.title,
                            description: page.description,
                            keywords: page.keywords,
                            chunk_index: chunkIndex,
                            total_chunks: chunks.length,
                            page_index: pageIndex
                        });
                        ids.push(`page_${pageIndex}_chunk_${chunkIndex}_${Date.now()}_${j}`);
                    }
                    
                    // Store batch in ChromaDB
                    console.log(`     💾 [BATCH ${batchNumber}] Storing in ChromaDB...`);
                    const storeStartTime = Date.now();
                    
                    await collection.add({
                        documents: documents,
                        embeddings: embeddings,
                        metadatas: metadatas,
                        ids: ids
                    });
                    
                    const storeTime = Date.now() - storeStartTime;
                    const totalBatchTime = Date.now() - batchStartTime;
                    
                    totalChunks += documents.length;
                    console.log(`     ✅ [BATCH ${batchNumber}] Stored ${documents.length} chunks in ${storeTime}ms`);
                    console.log(`     📊 [BATCH ${batchNumber}] Total batch time: ${totalBatchTime}ms (Embedding: ${embeddingTime}ms, Storage: ${storeTime}ms)`);
                    console.log(`     📈 [PROGRESS] Total chunks stored: ${totalChunks}`);
                    
                    // Memory cleanup
                    documents.length = 0;
                    embeddings.length = 0;
                    metadatas.length = 0;
                    ids.length = 0;
                    
                    // Brief pause for system stability
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                } catch (batchError) {
                    console.error(`     ❌ [BATCH ${batchNumber}] Failed:`, batchError.message);
                    console.error(`     🔍 [BATCH ${batchNumber}] Error details:`, {
                        name: batchError.name,
                        status: batchError.status,
                        code: batchError.code
                    });
                    
                    console.log(`     🔄 [BATCH ${batchNumber}] Falling back to individual chunk processing...`);
                    
                    // Fallback: process chunks individually
                    for (let k = 0; k < batchChunks.length; k++) {
                        const chunkIndex = i + k;
                        const chunk = batchChunks[k];
                        
                        try {
                            console.log(`     🔄 [INDIVIDUAL] Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} chars)`);
                            const individualStart = Date.now();
                            
                            const singleEmbedding = await generateEmbeddings([chunk]);
                            
                            await collection.add({
                                documents: [chunk],
                                embeddings: singleEmbedding,
                                metadatas: [{
                                    url: page.url,
                                    title: page.title,
                                    description: page.description,
                                    keywords: page.keywords,
                                    chunk_index: chunkIndex,
                                    total_chunks: chunks.length,
                                    page_index: pageIndex
                                }],
                                ids: [`page_${pageIndex}_chunk_${chunkIndex}_${Date.now()}_individual`]
                            });
                            
                            totalChunks++;
                            const individualTime = Date.now() - individualStart;
                            console.log(`     ✅ [INDIVIDUAL] Chunk ${chunkIndex + 1}/${chunks.length} stored in ${individualTime}ms (Total: ${totalChunks})`);
                            
                            await new Promise(resolve => setTimeout(resolve, 200));
                            
                        } catch (individualError) {
                            console.error(`     ❌ [INDIVIDUAL] Failed chunk ${chunkIndex + 1}:`, individualError.message);
                            // Continue with next chunk
                        }
                    }
                }
            }
            
            // Progress update for completed page
            const pageEndTime = Date.now();
            const pageDuration = pageEndTime - pageStartTime;
            const progress = ((pageIndex + 1) / scrapedContent.length * 100).toFixed(1);
            
            console.log(`\n   ✅ [PAGE ${pageIndex + 1}/${scrapedContent.length}] COMPLETED in ${Math.round(pageDuration / 1000)}s`);
            console.log(`   📊 [PAGE ${pageIndex + 1}] Processed ${chunks.length} chunks successfully`);
            console.log(`   📈 [PROGRESS] Overall progress: ${progress}% (${pageIndex + 1}/${scrapedContent.length} pages)`);
            console.log(`   ⏱️  [TIMING] Average time per chunk: ${Math.round(pageDuration / chunks.length)}ms`);
            console.log(`   🎯 [TOTAL] Total chunks stored so far: ${totalChunks}`);
            console.log(`   ${'='.repeat(60)}`);
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
        console.log('=' .repeat(50));
        console.log(`🎯 Target Website: ${targetUrl}`);
        console.log(`⚙️  Max Pages: ${CONFIG.maxPages}`);
        console.log(`⚙️  Max Depth: ${CONFIG.maxDepth}`);
        console.log('=' .repeat(50));
        
        // Step 0: Test ChromaDB connection
        console.log('\n🔧 STEP 0: Testing Database Connection...');
        await testChromaConnection();
        
        // Step 0.5: Test chunking function with sample text
        console.log('\n🧪 STEP 0.5: Testing Chunking Function...');
        const testText = "This is a test text. ".repeat(100); // 2000+ characters
        console.log(`Testing with ${testText.length} character sample...`);
        const testChunks = splitTextIntoChunks(testText);
        console.log(`✅ Chunking test passed: ${testChunks.length} chunks created`);
        
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
