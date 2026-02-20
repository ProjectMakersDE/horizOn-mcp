# News

## Overview

The News feature lets you display in-game announcements, patch notes, and updates to your players. News entries are created in the horizOn Dashboard and fetched by the app at runtime. Entries can be filtered by language.

## Endpoints

### Get News

**`GET /api/v1/app/news?limit={limit}&languageCode={languageCode}`**

Returns a list of published news entries, ordered by release date (newest first).

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | number | No | Max entries to return (default 20, max 100) |
| `languageCode` | string | No | Filter by language (e.g., `en`, `de`, `fr`) |

**Response (200):**

```json
[
  {
    "id": "news-001",
    "title": "Version 2.0 Released!",
    "message": "We've added new features including cloud saves and leaderboards.",
    "releaseDate": "2025-01-15T12:00:00Z",
    "languageCode": "en"
  },
  {
    "id": "news-002",
    "title": "Holiday Event",
    "message": "Earn double XP during the holiday season!",
    "releaseDate": "2025-01-10T08:00:00Z",
    "languageCode": "en"
  }
]
```

## Code Examples

### Godot (GDScript)

```gdscript
# Load latest 20 news entries
var news: Array[HorizonNewsEntry] = await Horizon.news.loadNews()

# Load with filters
var english_news = await Horizon.news.loadNews(10, "en")

# Iterate over entries
for entry in news:
    print("%s: %s" % [entry.title, entry.message])
    print("  Date: %s | Language: %s" % [entry.releaseDate, entry.languageCode])

# Caching (enabled by default)
var cached = await Horizon.news.loadNews(20, "", true)   # uses cache
var fresh = await Horizon.news.loadNews(20, "", false)    # forces refresh

# Get cached news without network request
var cached_entries = Horizon.news.getCachedNews()

# Clear cache
Horizon.news.clearCache()

# Listen for events
Horizon.news.news_loaded.connect(func(entries): print("Loaded %d entries" % entries.size()))
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Load news
var news = await NewsManager.Instance.LoadNews(limit: 10);
foreach (var item in news)
{
    Debug.Log($"{item.title}: {item.message}");
}

// Filter by language
var germanNews = await NewsManager.Instance.LoadNews(limit: 10, languageCode: "de");

// Get specific entry from cache
var entry = NewsManager.Instance.GetNewsById("news-001");

// Clear cache
NewsManager.Instance.ClearCache();
```

### REST (cURL)

```bash
# Get latest 10 news entries in English
curl "https://horizon.pm/api/v1/app/news?limit=10&languageCode=en" \
  -H "X-API-Key: YOUR_API_KEY"
```

## Best Practices

- **Fetch news at startup** — Load news once when the app starts and display in a news panel.
- **Use language filtering** — Show news in the user's preferred language.
- **Cache results** — News does not change frequently; cache for the session duration.

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 401 | Invalid API key | Check `X-API-Key` header |
| 429 | Rate limit exceeded | Cache news data, fetch once at startup |
