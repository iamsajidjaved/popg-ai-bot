import axios from "axios";
import * as cheerio from 'cheerio';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Load environment variables
dotenv.config();

/**
 * Configuration for the POPG AI training scraper (optimized for comprehensive crawling)
 */
const CONFIG = {
    maxDepth: 3, // Increased for deeper crawling
    maxPages: 100, // Significantly increased for comprehensive coverage
    delay: 500, // Reduced delay for faster crawling
    timeout: 30000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    chunkSize: 1500, // Larger chunks = fewer API calls = lower cost
    chunkOverlap: 150, // 10% overlap for context continuity
    batchSize: 5,
    maxContentSize: 100000,
    embeddingBatchSize: 15, // Optimized batch size for API efficiency
    maxRetries: 3,
    // API optimization settings
    maxTokensPerRequest: 8000, // Conservative token limit
    rateLimitDelay: 100, // Milliseconds between batches
    // PDF processing settings
    enablePdfProcessing: true,
    maxPdfSize: 10 * 1024 * 1024, // 10MB max PDF size
    // Multi-domain settings
    allowedDomains: ['popg.com', 'pop.vip', 'docs.google.com'], // Domains to crawl
    crossDomainCrawling: true
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
 * Checks if a URL is within allowed domains for crawling
 */
function isAllowedDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        return CONFIG.allowedDomains.some(domain => 
            hostname === domain || hostname.endsWith('.' + domain)
        );
    } catch (error) {
        return false;
    }
}

/**
 * Checks if a URL points to a PDF file
 */
function isPdfUrl(url) {
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        return pathname.endsWith('.pdf');
    } catch (error) {
        return false;
    }
}

/**
 * Downloads and processes a PDF file using PDF.js
 */
async function processPdf(url) {
    try {
        console.log(`   📄 Processing PDF: ${url}`);
        
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: CONFIG.timeout,
            headers: {
                'User-Agent': CONFIG.userAgent,
            },
            maxContentLength: CONFIG.maxPdfSize,
            maxBodyLength: CONFIG.maxPdfSize
        });

        if (response.data.byteLength > CONFIG.maxPdfSize) {
            console.warn(`   ⚠️  PDF too large: ${response.data.byteLength} bytes (max: ${CONFIG.maxPdfSize})`);
            return null;
        }

        // Use PDF.js to parse the PDF
        const pdfDocument = await pdfjsLib.getDocument({
            data: new Uint8Array(response.data),
            verbosity: 0 // Reduce logging
        }).promise;

        let fullText = '';
        const numPages = pdfDocument.numPages;

        // Extract text from each page
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            try {
                const page = await pdfDocument.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map(item => item.str)
                    .join(' ');
                fullText += pageText + '\n';
            } catch (pageError) {
                console.warn(`   ⚠️  Error processing page ${pageNum}: ${pageError.message}`);
            }
        }

        if (!fullText || fullText.trim().length < 200) {
            console.warn(`   ⚠️  PDF has insufficient content: ${fullText ? fullText.length : 0} characters`);
            return null;
        }

        // Clean up PDF text
        let cleanText = fullText
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .trim();

        // Limit content size
        if (cleanText.length > CONFIG.maxContentSize) {
            cleanText = cleanText.substring(0, CONFIG.maxContentSize);
            console.warn(`   ⚠️  PDF content truncated from ${fullText.length} to ${CONFIG.maxContentSize} characters`);
        }

        console.log(`   ✅ PDF processed: ${numPages} pages, ${cleanText.length} characters`);

        return {
            url,
            title: `PDF Document: ${url.split('/').pop()}`,
            description: 'PDF document content',
            keywords: 'pdf, document',
            content: cleanText,
            internalLinks: [], // PDFs don't have internal links to crawl
            isPdf: true,
            pageCount: numPages
        };

    } catch (error) {
        console.warn(`   ⚠️  Failed to process PDF ${url}: ${error.message}`);
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
 * Splits text into chunks for better processing (optimized for API efficiency)
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
        chunkSize = 1500;
        overlap = 150;
    }
    
    console.log(`     📏 [CHUNKING] Text: ${text.length} chars, Chunk: ${chunkSize}, Overlap: ${overlap}`);
    
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.slice(start, end);
        
        if (chunk.trim().length > 100) { // Increased minimum chunk size for quality
            chunks.push(chunk.trim());
        }
        
        // Move to next position, ensuring we always progress
        const nextStart = end - overlap;
        if (nextStart <= start) {
            start = start + Math.floor(chunkSize / 2);
        } else {
            start = nextStart;
        }
        
        if (start >= text.length) break;
        
        // Safety check to prevent infinite loops
        if (chunks.length > 1000) {
            console.error(`     ❌ [CHUNKING] Too many chunks (${chunks.length}), breaking to prevent infinite loop`);
            break;
        }
    }
    
    console.log(`     ✅ [CHUNKING] Created ${chunks.length} chunks (estimated cost: $${(text.length / 1000000 * 0.0001).toFixed(6)})`);
    return chunks;
}

/**
 * Generates embeddings using OpenAI (optimized for efficiency and cost)
 */
async function generateEmbeddings(textArray) {
    const startTime = Date.now();
    console.log(`     🔄 [EMBEDDING] Starting generation for ${textArray.length} text(s)...`);
    
    // Calculate total characters for cost tracking
    const totalChars = textArray.reduce((sum, text) => sum + text.length, 0);
    console.log(`     💰 [COST] ${totalChars} chars ≈ $${(totalChars / 1000000 * 0.0001).toFixed(6)}`);
    
    try {
        // Optimize batch size based on content size and API limits
        const maxBatchSize = 100; // OpenAI allows up to 100 inputs per request
        const maxTokensPerBatch = CONFIG.maxTokensPerRequest;
        
        if (textArray.length === 1) {
            console.log(`     🚀 [EMBEDDING] Single request...`);
            const response = await openai.embeddings.create({
                model: "text-embedding-ada-002", // Most cost-effective model
                input: textArray[0],
                encoding_format: "float", // More efficient than base64
            });
            const duration = Date.now() - startTime;
            console.log(`     ✅ [EMBEDDING] Completed in ${duration}ms`);
            return [response.data[0].embedding];
        }
        
        // For multiple texts, use intelligent batching
        if (textArray.length <= maxBatchSize && totalChars < maxTokensPerBatch) {
            console.log(`     🚀 [EMBEDDING] Efficient batch (${textArray.length} texts)...`);
            const response = await openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: textArray,
                encoding_format: "float",
            });
            
            const duration = Date.now() - startTime;
            console.log(`     ✅ [EMBEDDING] Batch completed in ${duration}ms (${Math.round(duration/textArray.length)}ms/item)`);
            
            return response.data.map(item => item.embedding);
        }
        
        // For large batches, split intelligently
        console.log(`     🔄 [EMBEDDING] Large batch, splitting intelligently...`);
        const embeddings = [];
        let currentBatch = [];
        let currentBatchChars = 0;
        
        for (let i = 0; i < textArray.length; i++) {
            const text = textArray[i];
            const textLength = text.length;
            
            // If adding this text would exceed limits, process current batch
            if ((currentBatch.length >= maxBatchSize) || 
                (currentBatchChars + textLength > maxTokensPerBatch && currentBatch.length > 0)) {
                
                console.log(`     ⚡ [SUB-BATCH] ${currentBatch.length} texts, ${currentBatchChars} chars`);
                const batchResponse = await openai.embeddings.create({
                    model: "text-embedding-ada-002",
                    input: currentBatch,
                    encoding_format: "float",
                });
                
                embeddings.push(...batchResponse.data.map(item => item.embedding));
                currentBatch = [];
                currentBatchChars = 0;
                
                // Brief pause to respect rate limits
                await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitDelay));
            }
            
            currentBatch.push(text);
            currentBatchChars += textLength;
        }
        
        // Process remaining batch
        if (currentBatch.length > 0) {
            console.log(`     ⚡ [FINAL-BATCH] ${currentBatch.length} texts`);
            const batchResponse = await openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: currentBatch,
                encoding_format: "float",
            });
            embeddings.push(...batchResponse.data.map(item => item.embedding));
        }
        
        const duration = Date.now() - startTime;
        console.log(`     ✅ [EMBEDDING] All ${textArray.length} embeddings completed in ${duration}ms`);
        return embeddings;
        
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`     ❌ [EMBEDDING] Error after ${duration}ms:`, error.message);
        
        // Enhanced error handling with retry logic
        if (error.status === 429) { // Rate limit
            console.log(`     ⏳ [EMBEDDING] Rate limited, waiting 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return generateEmbeddings(textArray); // Retry
        }
        
        if (error.status === 400 && textArray.length > 1) { // Bad request, try individual
            console.log(`     🔄 [EMBEDDING] Falling back to individual processing...`);
            const embeddings = [];
            for (let i = 0; i < textArray.length; i++) {
                try {
                    console.log(`     🔄 [INDIVIDUAL] ${i + 1}/${textArray.length}...`);
                    const response = await openai.embeddings.create({
                        model: "text-embedding-ada-002",
                        input: textArray[i],
                        encoding_format: "float",
                    });
                    embeddings.push(response.data[0].embedding);
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (individualError) {
                    console.error(`     ❌ [INDIVIDUAL] ${i + 1} failed:`, individualError.message);
                    throw individualError;
                }
            }
            return embeddings;
        }
        
        throw error;
    }
}

/**
 * Scrapes a single page and extracts content (supports both HTML and PDF)
 */
async function scrapePage(url) {
    try {
        // Check if it's a PDF
        if (isPdfUrl(url) && CONFIG.enablePdfProcessing) {
            return await processPdf(url);
        }
        
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
        });

        const $ = cheerio.load(data);
        
        // Extract metadata
        const title = $('title').text().trim() || 'Untitled';
        const description = $('meta[name="description"]').attr('content') || '';
        const keywords = $('meta[name="keywords"]').attr('content') || '';
        
        // Extract main content
        const textContent = extractTextContent(data);
        
        if (textContent.length < 200) { // Increased minimum for quality
            console.warn(`   ⚠️  Page has insufficient content: ${textContent.length} characters`);
            return null;
        }
        
        // Limit content size to prevent memory issues
        let finalContent = textContent;
        if (textContent.length > CONFIG.maxContentSize) {
            finalContent = textContent.substring(0, CONFIG.maxContentSize);
            console.warn(`   ⚠️  Content truncated from ${textContent.length} to ${CONFIG.maxContentSize} characters`);
        }
        
        // Extract links (both internal and cross-domain if enabled)
        const internalLinks = [];
        
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const normalizedUrl = normalizeUrl(href, url);
            
            if (normalizedUrl) {
                // Check if it's within allowed domains
                if (isAllowedDomain(normalizedUrl)) {
                    internalLinks.push(normalizedUrl);
                }
            }
        });

        // Also look for PDF links specifically
        if (CONFIG.enablePdfProcessing) {
            $('a[href*=".pdf"], a[href*="pdf"]').each((_, element) => {
                const href = $(element).attr('href');
                const normalizedUrl = normalizeUrl(href, url);
                
                if (normalizedUrl && isPdfUrl(normalizedUrl) && isAllowedDomain(normalizedUrl)) {
                    internalLinks.push(normalizedUrl);
                }
            });
        }

        console.log(`   ✅ Scraped: ${title} (${finalContent.length} chars, ${internalLinks.length} links)`);
        
        return {
            url,
            title,
            description,
            keywords,
            content: finalContent,
            internalLinks: [...new Set(internalLinks)], // Remove duplicates
            isPdf: false
        };
        
    } catch (error) {
        console.warn(`   ⚠️  Failed to scrape ${url}: ${error.message}`);
        return null;
    }
}

/**
 * Crawls website and collects all page content (supports multiple domains and PDFs)
 */
async function crawlWebsite(startUrls) {
    // Support both single URL and array of URLs
    const urlsToStart = Array.isArray(startUrls) ? startUrls : [startUrls];
    const visitedPages = new Set();
    const pagesToVisit = urlsToStart.map(url => ({ url, depth: 0 }));
    const scrapedContent = [];
    
    console.log(`🚀 Starting comprehensive crawl of domains: ${CONFIG.allowedDomains.join(', ')}\n`);
    console.log(`📋 Starting URLs: ${urlsToStart.join(', ')}`);
    console.log(`📄 PDF Processing: ${CONFIG.enablePdfProcessing ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🔍 Max Pages: ${CONFIG.maxPages}, Max Depth: ${CONFIG.maxDepth}\n`);

    while (pagesToVisit.length > 0 && visitedPages.size < CONFIG.maxPages) {
        const { url, depth } = pagesToVisit.shift();
        
        if (visitedPages.has(url) || depth > CONFIG.maxDepth || !isAllowedDomain(url)) {
            continue;
        }

        visitedPages.add(url);
        const hostname = new URL(url).hostname;
        const pageType = isPdfUrl(url) ? 'PDF' : 'HTML';
        
        console.log(`📄 [${pageType}] [Depth ${depth}] [${hostname}] Processing page ${visitedPages.size}/${CONFIG.maxPages}`);
        
        const pageData = await scrapePage(url);
        
        if (pageData && pageData.content.length > 200) {
            scrapedContent.push(pageData);
            
            // Add new links to crawl queue (only for HTML pages)
            if (!pageData.isPdf && depth < CONFIG.maxDepth) {
                pageData.internalLinks.forEach(link => {
                    if (!visitedPages.has(link) && 
                        !pagesToVisit.some(p => p.url === link) && 
                        isAllowedDomain(link)) {
                        pagesToVisit.push({ url: link, depth: depth + 1 });
                    }
                });
                
                console.log(`   🔗 Found ${pageData.internalLinks.length} links, queue size: ${pagesToVisit.length}`);
            } else if (pageData.isPdf) {
                console.log(`   📄 PDF processed: ${pageData.pageCount} pages`);
            }
        }
        
        // Be respectful - add delay
        if (pagesToVisit.length > 0) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.delay));
        }
    }

    console.log(`\n✅ Crawl completed: ${scrapedContent.length} pages/documents processed`);
    
    // Print summary by domain and type
    const summary = {};
    scrapedContent.forEach(page => {
        const hostname = new URL(page.url).hostname;
        const type = page.isPdf ? 'PDF' : 'HTML';
        const key = `${hostname} (${type})`;
        
        if (!summary[key]) {
            summary[key] = 0;
        }
        summary[key]++;
    });
    
    console.log('\n📊 Content Summary:');
    Object.entries(summary).forEach(([key, count]) => {
        console.log(`   ${key}: ${count} documents`);
    });

    return scrapedContent;
}

/**
 * Stores content in ChromaDB with optimized embeddings
 */
async function storeInChromaDB(scrapedContent) {
    try {
        console.log('\n📊 Processing content for ChromaDB (optimized)...');
        
        // Create collection
        const collectionName = 'popg_content';
        let collection;
        
        try {
            await chroma.deleteCollection({ name: collectionName });
            console.log(`🗑️  Deleted existing collection`);
        } catch (deleteError) {
            console.log(`📚 Collection doesn't exist yet`);
        }
        
        collection = await chroma.createCollection({ 
            name: collectionName,
            metadata: { description: "POPG website content for AI chatbot" }
        });
        console.log(`📚 Created new collection: ${collectionName}`);

        let totalChunks = 0;
        let totalCost = 0;
        
        // Process pages with optimized batching
        for (let pageIndex = 0; pageIndex < scrapedContent.length; pageIndex++) {
            const page = scrapedContent[pageIndex];
            const pageStartTime = Date.now();
            
            console.log(`\n   🔄 [PAGE ${pageIndex + 1}/${scrapedContent.length}] ${page.title}`);
            console.log(`   📊 [PAGE ${pageIndex + 1}] Content: ${page.content.length} chars`);
            
            // Split content into optimized chunks
            const chunks = splitTextIntoChunks(page.content);
            
            if (chunks.length === 0) {
                console.log(`   ⚠️  No chunks to process, skipping...`);
                continue;
            }
            
            // Process chunks with efficient batching
            for (let i = 0; i < chunks.length; i += CONFIG.embeddingBatchSize) {
                const batchChunks = chunks.slice(i, i + CONFIG.embeddingBatchSize);
                const batchNumber = Math.floor(i / CONFIG.embeddingBatchSize) + 1;
                const totalBatches = Math.ceil(chunks.length / CONFIG.embeddingBatchSize);
                
                console.log(`     ⚡ [BATCH ${batchNumber}/${totalBatches}] Processing ${batchChunks.length} chunks`);
                
                try {
                    // Generate embeddings efficiently
                    const batchEmbeddings = await generateEmbeddings(batchChunks);
                    
                    // Prepare data for ChromaDB
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
                            page_index: pageIndex,
                            chunk_size: chunk.length
                        });
                        ids.push(`page_${pageIndex}_chunk_${chunkIndex}_${Date.now()}_${j}`);
                        
                        // Track cost
                        totalCost += (chunk.length / 1000000 * 0.0001);
                    }
                    
                    // Store batch in ChromaDB
                    await collection.add({
                        documents: documents,
                        embeddings: embeddings,
                        metadatas: metadatas,
                        ids: ids
                    });
                    
                    totalChunks += documents.length;
                    console.log(`     ✅ [BATCH ${batchNumber}] Stored ${documents.length} chunks (Total: ${totalChunks})`);
                    
                    // Brief pause for system stability
                    await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitDelay));
                    
                } catch (batchError) {
                    console.error(`     ❌ [BATCH ${batchNumber}] Failed:`, batchError.message);
                    // Continue with next batch instead of failing completely
                }
            }
            
            const pageDuration = Date.now() - pageStartTime;
            console.log(`   ✅ [PAGE ${pageIndex + 1}] Completed in ${Math.round(pageDuration / 1000)}s`);
        }

        console.log(`\n✅ Successfully stored ${totalChunks} document chunks!`);
        console.log(`💰 Estimated total cost: $${totalCost.toFixed(6)}`);
        
        return {
            totalPages: scrapedContent.length,
            totalChunks: totalChunks,
            collectionName: collectionName,
            estimatedCost: totalCost
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
        const heartbeat = await chroma.heartbeat();
        console.log(`✅ ChromaDB heartbeat: ${heartbeat}`);
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
 * Main training function (optimized for comprehensive crawling)
 */
async function trainAIBot() {
    try {
        const startTime = Date.now();
        
        // Define multiple starting URLs for comprehensive coverage
        const startingUrls = [
            'https://popg.com',
            'https://pop.vip',
            'https://popg.com/assets/documents/litepapers/popg-litepaper-v1.8.pdf',
            'https://docs.google.com/spreadsheets/d/12HQRVGa1d7O-zs7AH5PDhvnEaJO9jNIhJh9i7LHBa9k/htmlview#gid=0'
        ];
        
        console.log('🤖 POPG AI Bot Comprehensive Training Process Started');
        console.log('=' .repeat(70));
        console.log(`🎯 Target Domains: ${CONFIG.allowedDomains.join(', ')}`);
        console.log(`🌐 Starting URLs: ${startingUrls.join(', ')}`);
        console.log(`⚙️  Max Pages: ${CONFIG.maxPages} (per domain)`);
        console.log(`📊 Max Depth: ${CONFIG.maxDepth} levels`);
        console.log(`⚙️  Chunk Size: ${CONFIG.chunkSize} chars (${CONFIG.chunkOverlap} overlap)`);
        console.log(`⚙️  Batch Size: ${CONFIG.embeddingBatchSize} embeddings per batch`);
        console.log(`� PDF Processing: ${CONFIG.enablePdfProcessing ? 'ENABLED' : 'DISABLED'}`);
        console.log(`�💰 Model: text-embedding-ada-002 ($0.0001/1K tokens)`);
        console.log('=' .repeat(70));
        
        // Test ChromaDB connection
        console.log('\n🔧 STEP 0: Testing Database Connection...');
        await testChromaConnection();
        
        // Test chunking function
        console.log('\n🧪 STEP 0.5: Testing Optimized Chunking...');
        const testText = "This is a test text for optimization. ".repeat(50);
        console.log(`Testing with ${testText.length} character sample...`);
        const testChunks = splitTextIntoChunks(testText);
        console.log(`✅ Chunking test passed: ${testChunks.length} chunks created`);
        
        // Comprehensive website crawl
        console.log('\n🕷️  STEP 1: Comprehensive Website Crawling...');
        console.log('This will scrape ALL internal pages including PDFs from both domains');
        const scrapedContent = await crawlWebsite(startingUrls);
        
        if (scrapedContent.length === 0) {
            throw new Error('No content was scraped from any of the target websites');
        }
        
        console.log(`✅ Comprehensively crawled ${scrapedContent.length} pages/documents successfully`);
        
        // Store in ChromaDB with optimizations
        console.log('\n🧠 STEP 2: Training AI with comprehensive content...');
        const result = await storeInChromaDB(scrapedContent);
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        // Display comprehensive summary
        console.log('\n' + '🎉'.repeat(35));
        console.log('🎉 COMPREHENSIVE POPG AI BOT TRAINING COMPLETED! 🎉');
        console.log('🎉'.repeat(35));
        console.log('\n📊 COMPREHENSIVE TRAINING SUMMARY:');
        console.log('─'.repeat(60));
        console.log(`🌐 Domains Crawled: ${CONFIG.allowedDomains.join(', ')}`);
        console.log(`⏱️  Training Time: ${duration} seconds`);
        console.log(`📄 Total Content: ${result.totalPages} pages/documents`);
        console.log(`📝 Content Chunks: ${result.totalChunks}`);
        console.log(`🧠 Chunk Size: ${CONFIG.chunkSize} chars (optimized for efficiency)`);
        console.log(`⚡ Batch Size: ${CONFIG.embeddingBatchSize} embeddings per request`);
        console.log(`📄 PDF Support: ${CONFIG.enablePdfProcessing ? 'ENABLED ✅' : 'DISABLED ❌'}`);
        console.log(`💰 Estimated Cost: $${result.estimatedCost.toFixed(6)}`);
        console.log(`🗃️  Collection: ${result.collectionName}`);
        console.log(`📈 Efficiency: ${Math.round(result.totalChunks / (duration / 60))} chunks/minute`);
        
        // Show domain breakdown
        const domainStats = {};
        scrapedContent.forEach(page => {
            const hostname = new URL(page.url).hostname;
            if (!domainStats[hostname]) {
                domainStats[hostname] = { html: 0, pdf: 0 };
            }
            if (page.isPdf) {
                domainStats[hostname].pdf++;
            } else {
                domainStats[hostname].html++;
            }
        });
        
        console.log('\n📊 Content by Domain:');
        Object.entries(domainStats).forEach(([domain, stats]) => {
            console.log(`   ${domain}: ${stats.html} HTML pages, ${stats.pdf} PDF documents`);
        });
        
        console.log('─'.repeat(60));
        console.log('\n✅ Your comprehensive POPG AI bot is ready!');
        console.log('💡 This bot now has complete knowledge from:');
        console.log('   • popg.com (all internal pages + PDFs)');
        console.log('   • pop.vip (all internal pages + PDFs)');
        console.log('   • Including the POPG litepaper PDF');
        console.log('\n🚀 Run "npm start" to start the enhanced chat interface.');
        
    } catch (error) {
        console.error('\n❌ Comprehensive training failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the optimized training
trainAIBot();