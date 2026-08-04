import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const widgetHtml = readFileSync(join(here, "public", "plantoguide-widget.html"), "utf8");
const WIDGET_URI = "ui://widget/plantoguide.html";
const MCP_PATH = "/mcp";

const activitySchema = z.object({
  time: z.string().describe("Local start time, such as 9:00 AM"),
  type: z.enum(["Breakfast", "See", "Explore", "Lunch", "Shop", "Dinner", "Evening", "Transit"]),
  icon: z.string().describe("One relevant emoji"),
  title: z.string().min(1),
  area: z.string().min(1),
  description: z.string().min(1),
  planningTip: z.string().optional(),
});

const mealOptionSchema = z.object({
  name: z.string().min(1),
  area: z.string().min(1),
  cuisine: z.string().min(1),
  why: z.string().min(1),
  price: z.enum(["$", "$$", "$$$", "$$$$"]).optional(),
});

const shoppingOptionSchema = z.object({
  name: z.string().min(1),
  area: z.string().min(1),
  bestFor: z.string().min(1),
  why: z.string().min(1),
});

const daySchema = z.object({
  date: z.string().describe("ISO date in YYYY-MM-DD format"),
  icon: z.string().describe("One emoji representing the day's main theme"),
  title: z.string().min(1),
  neighborhood: z.string().min(1),
  summary: z.string().min(1),
  activities: z.array(activitySchema).min(3).max(8),
  food: z.object({
    breakfast: z.array(mealOptionSchema).min(3).max(3),
    lunch: z.array(mealOptionSchema).min(3).max(3),
    dinner: z.array(mealOptionSchema).min(3).max(3),
  }),
  shopping: z.array(shoppingOptionSchema).min(3).max(3),
});

const itinerarySchema = {
  destination: z.string().min(1),
  startDate: z.string().describe("ISO date in YYYY-MM-DD format"),
  endDate: z.string().describe("ISO date in YYYY-MM-DD format"),
  interests: z.array(z.string()).min(1),
  tripTitle: z.string().min(1),
  intro: z.string().min(1),
  weather: z.object({
    summary: z.string().min(1),
    high: z.string().min(1),
    low: z.string().min(1),
    packingTip: z.string().min(1),
    disclaimer: z.string().default("Seasonal planning guidance; check a live forecast before departure."),
  }),
  days: z.array(daySchema).min(1).max(21),
  planningNotes: z.array(z.string()).min(1).max(6),
};

function createTravelServer() {
  // Keep the legacy MCP name for existing ChatGPT App connections while the
  // public release version follows Adtona's canonical version.js value.
  const server = new McpServer({ name: "plantoguide", version: "5.5.4" });

  registerAppResource(
    server,
    "plantoguide-widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [{
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml,
        _meta: {
          ui: { prefersBorder: false },
          "openai/widgetDescription": "A full-width, interactive day-by-day travel guide with date and section navigation.",
        },
      }],
    }),
  );

  registerAppTool(
    server,
    "render_travel_itinerary",
    {
      title: "Create an Adtona itinerary",
      description: [
        "Create and display a detailed Adtona itinerary.",
        "Before calling this tool, make sure the conversation provides exactly three essentials: destination, arrival/departure dates, and the user's places or interests for sightseeing, food, and shopping.",
        "Ask only for essentials that are missing. Then use your travel knowledge to produce a practical plan for every calendar date in the range.",
        "Honor every explicit request, group stops geographically, use realistic meal times, include exactly three distinct breakfast, lunch, and dinner choices and three shopping choices per day, and do not repeat a venue anywhere in the itinerary unless the user explicitly requests it.",
        "Prefer well-known, specific places while clearly treating hours, prices, availability, weather, and reservation details as items the traveler should verify.",
      ].join(" "),
      inputSchema: itinerarySchema,
      outputSchema: itinerarySchema,
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": WIDGET_URI,
        "openai/toolInvocation/invoking": "Building your Adtona travel guide…",
        "openai/toolInvocation/invoked": "Your Adtona travel guide is ready.",
      },
    },
    async (itinerary) => {
      const expectedDays = inclusiveDayCount(itinerary.startDate, itinerary.endDate);
      if (!expectedDays || expectedDays !== itinerary.days.length) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `The itinerary must contain one day for every date from ${itinerary.startDate} through ${itinerary.endDate} (${expectedDays || "a valid number of"} days). Please correct it and call this tool again.`,
          }],
        };
      }

      const activityNames = itinerary.days.flatMap((day) => day.activities.map((item) => item.title.trim().toLocaleLowerCase()));
      const duplicateActivity = activityNames.find((name, index) => activityNames.indexOf(name) !== index);
      if (duplicateActivity) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `The itinerary repeats the activity “${duplicateActivity}”. Replace the duplicate with a distinct place and call this tool again.`,
          }],
        };
      }

      return {
        structuredContent: itinerary,
        content: [{
          type: "text",
          text: `Created a ${itinerary.days.length}-day Adtona travel guide for ${itinerary.destination}. The interactive guide includes daily routes, dining choices, shopping, weather guidance, and planning notes.`,
        }],
      };
    },
  );

  return server;
}

function inclusiveDayCount(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

const port = Number(process.env.PORT ?? 8787);
const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "OPTIONS" && url.pathname.startsWith(MCP_PATH)) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ name: "Adtona", status: "ok", mcp: MCP_PATH, preview: "/preview" }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/preview") {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(widgetHtml);
    return;
  }

  const mcpMethods = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname.startsWith(MCP_PATH) && req.method && mcpMethods.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = createTravelServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`Adtona MCP server listening on http://localhost:${port}${MCP_PATH}`);
  console.log(`Widget preview: http://localhost:${port}/preview`);
});
