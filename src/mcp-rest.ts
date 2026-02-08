import express from 'express';
import { StreamableHTTPServerTransport } from '@modelContextProtocol/sdk/server/streamableHttp.js';
import { Server } from '@modelContextProtocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  InitializeRequestSchema,
} from '@modelContextProtocol/sdk/types.js';
import { randomUUID } from "node:crypto";

// Import from existing modules
import { TOOLS, SERVER_INFO, CAPABILITIES, TOOL_NAMES, NavigateArgs, ClickArgs, TypeArgs, WaitArgs, SolveCaptchaArgs, FindSelectorArgs, SaveContentAsMarkdownArgs } from './utils/tool-definitions.js';
import { closeBrowser, forceKillAllChromeProcesses } from './utils/browser-manager.js';
import { setupProcessCleanup } from './utils/core-infrastructure.js';

// Import handlers
import { handleBrowserInit, handleBrowserClose } from './handlers/browser-handlers.js';
import { handleNavigate, handleWait } from './handlers/navigation-handlers.js';
import { handleClick, handleType, handleSolveCaptcha, handleRandomScroll } from './handlers/interaction-handlers.js';
import { handleGetContent, handleFindSelector } from './handlers/content-handlers.js';
import { handleSaveContentAsMarkdown } from './handlers/file-handlers.js';

const app = express();
app.use(express.json());

// Create Server instance (not McpServer)
const server = new Server(SERVER_INFO, { capabilities: CAPABILITIES });

// Register initialize handler
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  console.error(`Initialize request received: ${JSON.stringify(request)}`);
  const clientProtocolVersion = request.params.protocolVersion;
  
  return {
    protocolVersion: clientProtocolVersion,
    capabilities: CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
});

// Register tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('Tools list requested');
  return { tools: TOOLS };
});

// Register resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: [] };
});

// Register prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: [] };
});

// Main tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`Tool call received: ${name} with args: ${JSON.stringify(args)}`);

  try {
    switch (name) {
      case TOOL_NAMES.BROWSER_INIT:
        return await handleBrowserInit(args || {});

      case TOOL_NAMES.NAVIGATE:
        return await handleNavigate(args as unknown as NavigateArgs);

      case TOOL_NAMES.GET_CONTENT:
        return await handleGetContent(args || {});

      case TOOL_NAMES.CLICK:
        return await handleClick(args as unknown as ClickArgs);

      case TOOL_NAMES.TYPE:
        return await handleType(args as unknown as TypeArgs);

      case TOOL_NAMES.WAIT:
        return await handleWait(args as unknown as WaitArgs);

      case TOOL_NAMES.BROWSER_CLOSE:
        return await handleBrowserClose();

      case TOOL_NAMES.SOLVE_CAPTCHA:
        return await handleSolveCaptcha(args as unknown as SolveCaptchaArgs);

      case TOOL_NAMES.RANDOM_SCROLL:
        return await handleRandomScroll();

      case TOOL_NAMES.FIND_SELECTOR:
        return await handleFindSelector(args as unknown as FindSelectorArgs);

      case TOOL_NAMES.SAVE_CONTENT_AS_MARKDOWN:
        return await handleSaveContentAsMarkdown(args as unknown as SaveContentAsMarkdownArgs);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Tool ${name} failed:`, errorMessage);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ Tool execution failed: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (sessionId) => {
    console.log(`Session initialized: ${sessionId}`);
  },
});

app.post('/mcp', async (req: express.Request, res: express.Response) => {
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('Server is healthy');
});

// Setup process cleanup handlers
setupProcessCleanup(async () => {
  console.error('Process cleanup triggered');
  await closeBrowser();
  await forceKillAllChromeProcesses();
});

server.connect(transport).then(() => {
  const PORT = process.env.SERVER_PORT || 7777;

  app.listen(PORT, () => {
    console.log(`🚀 HTTP server is running on http://localhost:${PORT}`);
    console.log(`📋 Available tools: ${TOOLS.length} tools loaded`);
    console.log(`💡 Content priority mode: Enabled`);
  });
}).catch((error) => {
  console.error('Failed to start MCP server:', error);
});

// Global error handlers to catch unexpected errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});