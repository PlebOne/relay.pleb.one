# Quick Reference: Using Safe JSON Parsing

## The Problem You're Solving

Before: ❌
```typescript
const response = await fetch("/api/endpoint");
const data = await response.json(); // Crashes with "Unexpected end of JSON input"
```

After: ✅
```typescript
import { safeJsonParse } from "@/lib/fetch-utils";

const response = await fetch("/api/endpoint");
const { data, error, status } = await safeJsonParse<MyType>(response);

if (error) {
  console.error("Request failed:", error);
  return;
}

// data is safely available
console.log(data);
```

## Usage Patterns

### Pattern 1: Basic Usage
```typescript
import { safeJsonParse } from "@/lib/fetch-utils";

const response = await fetch("/api/endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ foo: "bar" }),
});

const { data, error, status } = await safeJsonParse<ResponseType>(response);

if (error) {
  setErrorMessage(error); // User-friendly error
  return;
}

if (!data || !response.ok) {
  setErrorMessage(data?.message || "Request failed");
  return;
}

// Success!
handleSuccess(data);
```

### Pattern 2: Combined Fetch + Parse
```typescript
import { safeFetch } from "@/lib/fetch-utils";

const { data, error, status } = await safeFetch<ResponseType>("/api/endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ foo: "bar" }),
});

if (error) {
  setErrorMessage(error);
  return;
}

// Use data...
```

### Pattern 3: With Type Safety
```typescript
interface LoginResponse {
  success: boolean;
  token?: string;
  error?: string;
}

const { data, error } = await safeJsonParse<LoginResponse>(response);

if (error || !data) {
  // Handle error
  return;
}

// data.success is properly typed
if (data.success && data.token) {
  // TypeScript knows these fields exist
  saveToken(data.token);
}
```

## Common Scenarios

### Handling Form Submissions
```typescript
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  setIsSubmitting(true);
  setError(null);

  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const { data, error } = await safeJsonParse<SubmitResponse>(response);

    if (error) {
      setError(error);
      return;
    }

    if (!response.ok || !data?.success) {
      setError(data?.message || "Submission failed");
      return;
    }

    // Success
    setSuccess(true);
    resetForm();
  } catch (err) {
    setError("Network error. Please try again.");
  } finally {
    setIsSubmitting(false);
  }
};
```

### Handling External APIs
```typescript
useEffect(() => {
  const fetchData = async () => {
    try {
      const response = await fetch("https://api.example.com/data");
      const { data, error } = await safeJsonParse<ApiResponse>(response);

      if (error) {
        console.error("API error:", error);
        setData(null); // Graceful fallback
        return;
      }

      setData(data);
    } catch (err) {
      console.error("Network error:", err);
      setData(null);
    }
  };

  fetchData();
}, []);
```

## Error Messages You'll Get

Instead of cryptic "Unexpected end of JSON input", you'll see:

- ✅ "Server returned empty response"
- ✅ "Server returned non-JSON response: <html>..."
- ✅ "Invalid JSON response: [actual content]"
- ✅ "Network request failed"

## When NOT to Use

- ✓ Use for: Client-side fetch calls to your API
- ✓ Use for: External API calls
- ✗ Don't use for: Server-side code (Next.js API routes)
- ✗ Don't use for: tRPC calls (they handle errors differently)

## Remember

1. Always import the utility
2. Always check for errors before using data
3. Always provide user-friendly error messages
4. TypeScript types are your friend

---

For more details, see: `FETCH_ERROR_FIX.md`
