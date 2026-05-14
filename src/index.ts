import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { publishToLinkedIn } from "./lib/linkedin.js";

const server = new Server(
  { name: "linkedin-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_post",
      description: "Publica un post en LinkedIn",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Contenido del post" },
        },
        required: ["text"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "create_post") {
    const text = request.params.arguments?.text as string;
    const result = await publishToLinkedIn(
      text,
      process.env.LINKEDIN_ACCESS_TOKEN!,
      process.env.LINKEDIN_PERSON_ID!
    );

    if (!result.ok) {
      return {
        content: [{ type: "text", text: `Error al publicar: ${result.error}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: "✅ Post publicado exitosamente en LinkedIn" }],
    };
  }

  return {
    content: [{ type: "text", text: "Tool no encontrada" }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
server.connect(transport);
