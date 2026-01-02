/**
 * AI Streaming API Route for DocuIntel
 * 
 * Provides Server-Sent Events (SSE) endpoint for real-time AI responses.
 * Supports streaming analysis results, progress updates, and completion events.
 * 
 * @route GET /api/ai/stream
 */

import { NextRequest } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Stream event types
 */
type StreamEventType =
    | 'connected'
    | 'progress'
    | 'chunk'
    | 'analysis'
    | 'complete'
    | 'error';

/**
 * Stream event structure
 */
interface StreamEvent {
    type: StreamEventType;
    data: any;
    timestamp: number;
}

/**
 * Creates a formatted SSE message
 */
function formatSSE(event: StreamEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * Creates an SSE encoder for streaming responses
 */
function createSSEEncoder() {
    const encoder = new TextEncoder();

    return {
        encode: (event: StreamEvent): Uint8Array => {
            return encoder.encode(formatSSE(event));
        }
    };
}

/**
 * GET /api/ai/stream
 * 
 * Streams AI analysis results using Server-Sent Events.
 * 
 * Query Parameters:
 * - caseId: Case ID to analyze (optional)
 * - prompt: Direct prompt for analysis (optional)
 * - mode: 'analyze' | 'chat' | 'summarize' (default: 'analyze')
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * - Accept: text/event-stream
 * 
 * Events:
 * - connected: Initial connection confirmation
 * - progress: Progress updates (0-100)
 * - chunk: Streaming text chunks
 * - analysis: Structured analysis results
 * - complete: Stream completion
 * - error: Error occurred
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');
    const prompt = searchParams.get('prompt');
    const mode = searchParams.get('mode') || 'analyze';

    // Create readable stream for SSE
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = createSSEEncoder();

            try {
                // Send connection event
                controller.enqueue(encoder.encode({
                    type: 'connected',
                    data: {
                        message: 'Stream connected',
                        caseId,
                        mode
                    },
                    timestamp: Date.now()
                }));

                // Validate request
                if (!prompt && !caseId) {
                    controller.enqueue(encoder.encode({
                        type: 'error',
                        data: { message: 'Either prompt or caseId is required' },
                        timestamp: Date.now()
                    }));
                    controller.close();
                    return;
                }

                // Check if OpenAI is available
                if (!process.env.OPENAI_API_KEY) {
                    await streamMockAnalysis(controller, encoder, prompt || 'Sample contract analysis');
                    return;
                }

                // Stream AI response based on mode
                switch (mode) {
                    case 'analyze':
                        await streamContractAnalysis(controller, encoder, prompt || '');
                        break;
                    case 'chat':
                        await streamChatResponse(controller, encoder, prompt || '');
                        break;
                    case 'summarize':
                        await streamSummary(controller, encoder, prompt || '');
                        break;
                    default:
                        await streamContractAnalysis(controller, encoder, prompt || '');
                }

            } catch (error: any) {
                controller.enqueue(encoder.encode({
                    type: 'error',
                    data: { message: error.message || 'Stream error occurred' },
                    timestamp: Date.now()
                }));
            } finally {
                controller.close();
            }
        },

        cancel() {
            console.log('Stream cancelled by client');
        }
    });

    // Return SSE response
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

/**
 * Streams contract analysis using OpenAI
 */
async function streamContractAnalysis(
    controller: ReadableStreamDefaultController,
    encoder: ReturnType<typeof createSSEEncoder>,
    clauseText: string
): Promise<void> {
    // Send progress update
    controller.enqueue(encoder.encode({
        type: 'progress',
        data: { progress: 10, message: 'Initializing analysis...' },
        timestamp: Date.now()
    }));

    const systemPrompt = `You are an expert legal AI assistant specializing in contract analysis. 
Analyze the provided contract clause and provide:
1. Risk Assessment (score 0-100, severity: low/medium/high/critical)
2. Key Issues identified
3. Recommendations for improvement
4. Suggested redline modifications

Format your response in a clear, structured manner.`;

    try {
        const stream = await openai.chat.completions.create({
            model: process.env.AUTOLAWYER_MODEL || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: clauseText || 'Analyze this sample indemnification clause...' }
            ],
            stream: true,
            temperature: 0.3,
            max_tokens: 2000,
        });

        controller.enqueue(encoder.encode({
            type: 'progress',
            data: { progress: 30, message: 'Analyzing clause...' },
            timestamp: Date.now()
        }));

        let fullResponse = '';
        let chunkCount = 0;

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                chunkCount++;

                // Send streaming chunk
                controller.enqueue(encoder.encode({
                    type: 'chunk',
                    data: {
                        content,
                        chunkIndex: chunkCount
                    },
                    timestamp: Date.now()
                }));

                // Update progress periodically
                if (chunkCount % 10 === 0) {
                    const progress = Math.min(30 + (chunkCount * 2), 90);
                    controller.enqueue(encoder.encode({
                        type: 'progress',
                        data: { progress, message: 'Streaming response...' },
                        timestamp: Date.now()
                    }));
                }
            }
        }

        // Send final analysis summary
        controller.enqueue(encoder.encode({
            type: 'analysis',
            data: {
                fullResponse,
                chunkCount,
                model: process.env.AUTOLAWYER_MODEL || 'gpt-4o-mini'
            },
            timestamp: Date.now()
        }));

        // Send completion event
        controller.enqueue(encoder.encode({
            type: 'complete',
            data: {
                message: 'Analysis complete',
                totalChunks: chunkCount,
                responseLength: fullResponse.length
            },
            timestamp: Date.now()
        }));

    } catch (error: any) {
        throw new Error(`OpenAI streaming failed: ${error.message}`);
    }
}

/**
 * Streams chat response
 */
async function streamChatResponse(
    controller: ReadableStreamDefaultController,
    encoder: ReturnType<typeof createSSEEncoder>,
    userMessage: string
): Promise<void> {
    controller.enqueue(encoder.encode({
        type: 'progress',
        data: { progress: 20, message: 'Processing your question...' },
        timestamp: Date.now()
    }));

    try {
        const stream = await openai.chat.completions.create({
            model: process.env.AUTOLAWYER_MODEL || 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are DocuIntel, a helpful legal AI assistant. Provide clear, accurate answers about legal documents and contracts.'
                },
                { role: 'user', content: userMessage }
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 1000,
        });

        let fullResponse = '';

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                controller.enqueue(encoder.encode({
                    type: 'chunk',
                    data: { content },
                    timestamp: Date.now()
                }));
            }
        }

        controller.enqueue(encoder.encode({
            type: 'complete',
            data: { message: 'Response complete', responseLength: fullResponse.length },
            timestamp: Date.now()
        }));

    } catch (error: any) {
        throw new Error(`Chat streaming failed: ${error.message}`);
    }
}

/**
 * Streams document summary
 */
async function streamSummary(
    controller: ReadableStreamDefaultController,
    encoder: ReturnType<typeof createSSEEncoder>,
    documentText: string
): Promise<void> {
    controller.enqueue(encoder.encode({
        type: 'progress',
        data: { progress: 15, message: 'Generating summary...' },
        timestamp: Date.now()
    }));

    try {
        const stream = await openai.chat.completions.create({
            model: process.env.AUTOLAWYER_MODEL || 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Summarize the following legal document concisely, highlighting key terms, obligations, and potential risks.'
                },
                { role: 'user', content: documentText }
            ],
            stream: true,
            temperature: 0.3,
            max_tokens: 1500,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                controller.enqueue(encoder.encode({
                    type: 'chunk',
                    data: { content },
                    timestamp: Date.now()
                }));
            }
        }

        controller.enqueue(encoder.encode({
            type: 'complete',
            data: { message: 'Summary complete' },
            timestamp: Date.now()
        }));

    } catch (error: any) {
        throw new Error(`Summary streaming failed: ${error.message}`);
    }
}

/**
 * Streams mock analysis when OpenAI is not available
 */
async function streamMockAnalysis(
    controller: ReadableStreamDefaultController,
    encoder: ReturnType<typeof createSSEEncoder>,
    input: string
): Promise<void> {
    const mockResponse = `## Contract Analysis Report

### Risk Assessment
- **Overall Risk Score**: 75/100 (High)
- **Severity**: High

### Key Issues Identified

1. **Unlimited Liability Clause**
   - The indemnification clause lacks a liability cap
   - Potential exposure to unlimited financial risk

2. **Broad Termination Rights**
   - One-sided termination provisions favor the other party
   - Consider negotiating mutual termination rights

3. **Intellectual Property Assignment**
   - All IP created transfers to client
   - May want to retain license for internal use

### Recommendations

1. Add a liability cap (e.g., 12 months of fees)
2. Negotiate mutual termination rights with 60-day notice
3. Request carve-out for pre-existing IP

### Suggested Redlines

\`\`\`diff
- The Supplier's liability under this Agreement shall be unlimited.
+ The Supplier's liability shall be limited to the total fees paid in the preceding 12 months.
\`\`\`

---
*Analysis generated by DocuIntel AI (Demo Mode)*`;

    // Simulate streaming chunks
    const chunks = mockResponse.split(/(?<=\n)/);

    for (let i = 0; i < chunks.length; i++) {
        controller.enqueue(encoder.encode({
            type: 'chunk',
            data: { content: chunks[i], chunkIndex: i },
            timestamp: Date.now()
        }));

        // Simulate typing delay
        await new Promise(resolve => setTimeout(resolve, 50));

        if (i % 5 === 0) {
            controller.enqueue(encoder.encode({
                type: 'progress',
                data: {
                    progress: Math.round((i / chunks.length) * 100),
                    message: 'Generating analysis...'
                },
                timestamp: Date.now()
            }));
        }
    }

    controller.enqueue(encoder.encode({
        type: 'complete',
        data: {
            message: 'Analysis complete (Demo Mode)',
            mode: 'mock'
        },
        timestamp: Date.now()
    }));
}

/**
 * POST handler for initiating analysis streams
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { clauseText, caseId, mode } = body;

        // Redirect to GET with query params for SSE
        const url = new URL(request.url);
        if (clauseText) url.searchParams.set('prompt', clauseText);
        if (caseId) url.searchParams.set('caseId', caseId);
        if (mode) url.searchParams.set('mode', mode);

        return Response.redirect(url.toString(), 307);

    } catch (error: any) {
        return Response.json(
            { error: error.message || 'Failed to initiate stream' },
            { status: 400 }
        );
    }
}
