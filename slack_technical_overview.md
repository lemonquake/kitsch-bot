# Slack Integration Implementation Overview

This document provides a comprehensive breakdown of how the Slack Notification feature was implemented in Kitsch Bot.

## 🎯 Architecture

The integration follows a simple one-way flow:
`Discord Action (Ticket Created) -> Bot Event -> Webhook Request -> Slack Channel`

We use **Incoming Webhooks**, which is the simplest and most performant way to post messages to Slack without requiring a full bot user or extensive Oauth.

## 📂 Implementation Details

### 1. The Utility Layer (`utils/slack_utils.py`)
We created a dedicated utility module to handle the HTTP request. This keeps the core logic clean and reusable.

*   **Technology**: Uses `aiohttp` for asynchronous non-blocking requests.
*   **Method**: Sends a value-added JSON payload (`POST`) to the Slack Webhook URL.
*   **Error Handling**: Logs errors if the request fails (e.g., 404, 500) but does *not* crash the bot.

```python
async def send_slack_notification(webhook_url: str, message: str):
    # Validates URL
    # Constructs JSON payload: {"text": message}
    # Sends POST request
```

### 2. The Logic Layer (`utils/hub_manager.py`)
This is where the business logic resides. We hook into the ticket creation process.

*   **Trigger**: Inside `_create_ticket`, right after the Discord channel and database entry are created.
*   **Data**: We extract:
    *   User Name & ID
    *   Channel Link (`<#id>`)
    *   Guild Name
*   **Format**: The message is formatted using Slack's markdown (e.g., `*Bold*`, `_Italic_`).

### 3. Configuration (`.env`)
Security is paramount. The Webhook URL contains a secret token, so it **must never** be hardcoded.

*   **Variable**: `SLACK_WEBHOOK_URL`
*   **Loading**: Loaded via `os.getenv` at runtime.

### 4. Setup Process

1.  **Create App**: A Slack App is created in the workspace.
2.  **Enable Webhooks**: "Incoming Webhooks" feature is turned on.
3.  **Generate URL**: A unique URL is generated for a specific channel.
4.  **Configure Bot**: This URL is pasted into the `.env` file.

## 📝 Usage Example

When a user clicks "Open Ticket", the following happens:
1.  Bot creates `#ticket-username`.
2.  Bot saves ticket to SQLite DB.
3.  Bot checks `.env` for `SLACK_WEBHOOK_URL`.
4.  Bot sends: `🎫 *New Ticket Created* ...` to Slack.
5.  Support team sees notification instantly.

## 🔧 Future Improvements
*   **Embeds**: Slack supports "blocks" for richer formatting (similar to Discord embeds).
*   **Interactivity**: Adding buttons in Slack to "Claim" the ticket (would require a Slack App with interactivity enabled and a webserver to receive events).
