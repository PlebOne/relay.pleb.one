# Fix: "Unexpected end of JSON input" Error

## Problem
The application frequently encounters `Error: Failed to execute 'json' on 'Response': Unexpected end of JSON input` during login and other operations. This happens when:

1. **Server returns empty response** - Authentication failures or server errors that don't return JSON
2. **Server returns HTML error page** - When NextAuth or middleware returns error pages instead of JSON
3. **Network timeouts** - Interrupted requests that don't complete
4. **Authentication state issues** - Session token expiration mid-request

## Root Causes

### 1. Unsafe `.json()` calls
The old pattern used throughout the app:
```typescript
const response = await fetch("/api/endpoint");
const data = await response.json(); // ❌ Crashes if response is empty/invalid
```

### 2. NextAuth Issues
- NextAuth can return HTML error pages on authentication failures
- Session expiration can cause middleware to redirect/block API calls
- No consistent error format across auth flows

### 3. No Response Validation
- No checks for content-type headers
- No validation of response body existence
- No graceful degradation

## Solution Implemented

### 1. Safe JSON Parsing Utility (`/src/lib/fetch-utils.ts`)

Created a robust utility that handles all edge cases:

```typescript
import { safeJsonParse, safeFetch } from "@/lib/fetch-utils";

// Method 1: Parse existing response
const response = await fetch("/api/endpoint");
const { data, error, status } = await safeJsonParse<ExpectedType>(response);

if (error) {
  // Handle error - error message describes what went wrong
  console.error(error);
  return;
}

// data is now safely typed as ExpectedType
console.log(data);

// Method 2: Combined fetch + parse
const { data, error, status } = await safeFetch<ExpectedType>("/api/endpoint", {
  method: "POST",
  body: JSON.stringify({ ... }),
});
```

### 2. Updated All Affected Pages

**Pages Fixed:**
- ✅ `/src/app/login/page.tsx` - Already had good error handling
- ✅ `/src/app/request/page.tsx` - Now uses `safeJsonParse`
- ✅ `/src/app/appeal/page.tsx` - Now uses `safeJsonParse`
- ✅ `/src/app/report/page.tsx` - Now uses `safeJsonParse`
- ✅ `/src/components/ui/cypherpunk.tsx` - Bitcoin price fetch now safe

### 3. What the Utility Does

1. **Checks Content-Length** - Detects empty responses
2. **Validates Content-Type** - Ensures response is actually JSON
3. **Reads response as text first** - Prevents parsing crashes
4. **Provides descriptive errors** - Instead of cryptic "unexpected end of input"
5. **Uses response cloning** - Allows retry logic if needed
6. **Type-safe** - Maintains TypeScript types

## Benefits

### Before:
```typescript
try {
  const response = await fetch("/api/endpoint");
  const data = await response.json(); // ❌ Crashes on empty/invalid response
  // ...
} catch (error) {
  // Generic "Unexpected end of JSON input" - not helpful
}
```

### After:
```typescript
const { data, error, status } = await safeJsonParse<MyType>(response);

if (error) {
  // Specific errors:
  // - "Server returned empty response"
  // - "Server returned non-JSON response: <html>..."
  // - "Invalid JSON response: <actual content>"
  setErrorMessage(error);
  return;
}

// data is safely available and typed
```

## Best Practices Going Forward

### 1. Always Use Safe Parsing
```typescript
// ❌ DON'T
const data = await response.json();

// ✅ DO
import { safeJsonParse } from "@/lib/fetch-utils";
const { data, error, status } = await safeJsonParse<ExpectedType>(response);
```

### 2. Handle All Response Cases
```typescript
const { data, error, status } = await safeJsonParse<MyType>(response);

// Handle parse/network errors
if (error) {
  showError(error);
  return;
}

// Handle business logic errors
if (!response.ok || !data) {
  showError(data?.message || "Request failed");
  return;
}

// Success case
processData(data);
```

### 3. Server-Side: Always Return JSON
```typescript
// ✅ Good - API route always returns JSON
export async function POST(request: Request) {
  try {
    // ... logic
    return NextResponse.json({ success: true, data });
  } catch (error) {
    // Always return JSON even on error
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
```

### 4. Add Timeout Protection
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

try {
  const response = await fetch("/api/endpoint", {
    signal: controller.signal,
  });
  const { data, error } = await safeJsonParse(response);
  // ...
} catch (error) {
  if (error.name === "AbortError") {
    showError("Request timed out");
  }
} finally {
  clearTimeout(timeout);
}
```

## Monitoring

To detect if this issue recurs, monitor for:

1. **Client-side errors** containing "json" or "parse"
2. **Empty responses** from API routes (check logs)
3. **Authentication failures** that might return HTML
4. **Middleware redirects** during API calls

## Related Files

- `/src/lib/fetch-utils.ts` - Core utility
- `/src/app/request/page.tsx` - Example usage
- `/src/app/appeal/page.tsx` - Example usage
- `/src/app/report/page.tsx` - Example usage
- `/src/components/ui/cypherpunk.tsx` - Example usage

## Testing Recommendations

1. **Test with network offline** - Should show proper error
2. **Test with expired session** - Should not crash
3. **Test with server returning HTML error** - Should show readable error
4. **Test with slow connection** - Should handle timeouts gracefully

## Additional Improvements Possible

1. **Add retry logic** - Automatically retry failed requests
2. **Add request caching** - Prevent duplicate requests
3. **Add loading states** - Better UX during requests
4. **Add Sentry/logging** - Track errors in production
5. **Add rate limiting** - Prevent abuse

---

**Date Fixed:** 2026-02-01  
**Fixed By:** GitHub Copilot CLI  
**Status:** ✅ Complete
