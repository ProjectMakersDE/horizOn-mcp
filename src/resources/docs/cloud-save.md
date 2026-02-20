# Cloud Save

## Overview

Cloud Save allows players to persist their game data across devices and sessions. horizOn supports two modes:

- **JSON mode** — Send structured data as a UTF-8 string via `application/json`
- **Binary mode** — Send raw bytes via `application/octet-stream`

## Tier Limits

Data size is limited by the account's pricing tier:

| Tier | Max Save Size |
|------|--------------|
| FREE | 1 KB |
| BASIC | 5 KB |
| PRO | 20 KB |
| ENTERPRISE | 250 KB |

If the save data exceeds the tier limit, the save request will fail with a `403` error.

## Endpoints

### Save Data

**`POST /api/v1/app/cloud-save/save`**

Saves user data to the cloud. Overwrites any existing save.

**Request Body (JSON mode):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | The user's ID |
| `saveData` | string | Yes | Data to save (JSON string) |

**Response (200):**

```json
{
  "success": true,
  "dataSizeBytes": 256
}
```

**Binary mode:** `POST /api/v1/app/cloud-save/save?userId={userId}` with `Content-Type: application/octet-stream` and raw bytes in the body.

---

### Load Data

**`POST /api/v1/app/cloud-save/load`**

Loads the user's saved data from the cloud.

**Request Body (JSON mode):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | The user's ID |

**Response (200):**

```json
{
  "found": true,
  "saveData": "{\"level\":5,\"coins\":1000}"
}
```

If no save data exists:

```json
{
  "found": false,
  "saveData": null
}
```

**Binary mode:** `GET /api/v1/app/cloud-save/load?userId={userId}` with `Accept: application/octet-stream`.

## Code Examples

### Godot (GDScript)

```gdscript
# Save a Dictionary (recommended approach)
await Horizon.cloudSave.saveObject({"level": 5, "coins": 1000, "inventory": ["sword", "shield"]})

# Load as Dictionary
var data: Dictionary = await Horizon.cloudSave.loadObject()
if not data.is_empty():
    var level = data.get("level", 1)
    var coins = data.get("coins", 0)

# Save raw JSON string
await Horizon.cloudSave.saveData('{"level": 5}')

# Load raw JSON string
var json: String = await Horizon.cloudSave.loadData()

# Binary data support
await Horizon.cloudSave.saveBytes(my_packed_byte_array)
var bytes: PackedByteArray = await Horizon.cloudSave.loadBytes()

# Save any Variant using Godot serialization
await Horizon.cloudSave.saveVariant(my_resource)
var loaded = await Horizon.cloudSave.loadVariant()

# Listen for events
Horizon.cloudSave.data_saved.connect(func(size): print("Saved %d bytes" % size))
Horizon.cloudSave.data_loaded.connect(func(data): print("Data loaded"))
Horizon.cloudSave.data_save_failed.connect(func(error): print("Save failed: %s" % error))
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Save a typed object as JSON
[System.Serializable]
public class GameData
{
    public int Level;
    public int Coins;
    public string[] Inventory;
}

var saveData = new GameData { Level = 5, Coins = 1000, Inventory = new[] { "sword", "shield" } };
await CloudSaveManager.Instance.SaveObject(saveData);

// Load a typed object
var loaded = await CloudSaveManager.Instance.LoadObject<GameData>();
if (loaded != null)
{
    Debug.Log($"Level: {loaded.Level}, Coins: {loaded.Coins}");
}

// Save/load raw string
await CloudSaveManager.Instance.Save("{\"level\": 5}");
string json = await CloudSaveManager.Instance.Load();

// Binary data support
byte[] data = GetBinaryData();
await CloudSaveManager.Instance.SaveBytes(data);
byte[] loadedBytes = await CloudSaveManager.Instance.LoadBytes();
```

### REST (cURL)

```bash
# Save data (JSON mode)
curl -X POST https://horizon.pm/api/v1/app/cloud-save/save \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "saveData": "{\"level\":5,\"coins\":1000}"}'

# Load data (JSON mode)
curl -X POST https://horizon.pm/api/v1/app/cloud-save/load \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123"}'
```

## Best Practices

- **Save on meaningful events** — Save when a level is completed, not on every frame or action.
- **Compress large saves** — If nearing the tier limit, consider compressing JSON data.
- **Handle "not found" gracefully** — On first load, `found` will be `false`. Initialize defaults.
- **Use typed objects** — Both SDKs support saving/loading typed objects directly.

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 401 | Invalid API key | Check `X-API-Key` header |
| 403 | Save exceeds tier limit | Reduce data size or upgrade tier |
| 429 | Rate limit exceeded | Batch saves, save less frequently |
