# Adtona for ChatGPT

This folder now contains a ChatGPT App built with the OpenAI Apps SDK and MCP Apps standard.

## What it does

ChatGPT gathers three essentials in conversation:

1. Where are you going?
2. What dates are you going?
3. What do you want to see, eat, and shop for?

ChatGPT creates the detailed itinerary and calls `render_travel_itinerary`. The MCP server validates the structured itinerary and returns an interactive Adtona widget. The server does **not** call the OpenAI API and does not need an OpenAI API key.

## Run locally

Requirements: Node.js 18 or later.

```powershell
npm install
npm start
```

Open the standalone widget preview at `http://localhost:8787/preview`. The MCP endpoint is `http://localhost:8787/mcp`.

## Connect it to ChatGPT

1. Deploy the Node server to an HTTPS host, or expose port 8787 through a secure development tunnel.
2. In ChatGPT, enable Developer mode under **Settings → Apps & Connectors → Advanced settings**.
3. Under **Settings → Apps & Connectors**, create an app/connector.
4. Use a connector URL ending in `/mcp`, such as `https://your-host.example/mcp`.
5. Start a new conversation, add Adtona from the **+ → More** menu, and say: `Plan a trip for me.`

No authentication is required for this prototype because it stores no user accounts or private travel data. Add OAuth before introducing saved trips, bookings, or user-specific records.

## Suggested connector metadata

- **Name:** Adtona
- **Description:** Creates a detailed, interactive day-by-day travel itinerary after asking where you are going, your dates, and what you want to see, eat, and shop for.

## Production notes

- Host the MCP server; GitHub Pages alone cannot run it.
- Keep the server stateless unless saved trips are added later.
- Add a privacy policy and verify any live travel data sources before public submission.
- Restaurant hours, prices, availability, forecasts, and reservations must be verified by the traveler.
